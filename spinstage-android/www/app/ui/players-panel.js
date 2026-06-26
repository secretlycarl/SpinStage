/**
 * Players side panel: device list, sync groups, stereo pairs, queue transfer.
 * Cross-module callbacks use ui/handlers.js (wired in spinstage-app.js).
 */
import { state } from '../state.js';
import {
    CAST_MEMBER_JOIN_SETTLE_MS,
    CAST_MEMBER_SYNC_MAX_ATTEMPTS,
    CAST_MEMBER_SYNC_STEP_MS,
    GROUP_DISSOLVE_MAX_ATTEMPTS,
    GROUP_DISSOLVE_STEP_MS,
    IS_ANDROID,
    MA_PROTOCOL_KEY_SPLITTER,
    SYNC_DELAY_CONFIG_KEY,
    GROUP_TRIM_CONFIG_KEY,
    SYNC_DELAY_LEGACY_KEYS,
    SYNC_DELAY_STEP_MS,
    SYNC_DELAY_CUTOVER_DEBOUNCE_MS,
    SYNC_JOIN_RECOVERY_DELAY_MS,
    PLAYBACK_OFFSET_MIN_AHEAD_SEC,
    ANDROID_PLAYBACK_BUFFER_MIN_AHEAD_SEC,
    PLAYBACK_JOIN_BUFFER_WAIT_MS,
    DEFAULT_PLAYER_VOLUME,
    PLAYER_VOLUME_KEY,
} from '../constants.js';
import {
    clampStaticDelayMs,
    clampGroupTrimMs,
    netGroupOffsetMs,
    formatNetOffsetLabel,
} from '../sync-delay.js';
import {
    mainBody,
    playersBtn,
    playersPanel,
    playersPanelHint,
    playersList,
    playersSyncActions,
    playersSyncBtn,
    playersSyncLabel,
    playersStereoBtn,
    playersStereoLeadBtn,
    playersJoinBtn,
    playersRefreshBtn,
    playersResetOffsetsBtn,
    playersLeaveBtn,
    playersSplitBtn,
    playersRowMenu,
} from '../dom.js';
import { maClient } from '../ma/client.js';
import { getDefaultPlayerName } from '../util/server.js';
import { getShowConnection } from './settings.js';
import { loadQueueItems } from './queue.js';
import {
    isRadioMedia,
    requestNowPlayingVisuals,
    syncProgressFromMaQueue,
} from '../playback/now-playing.js';
import { uiH } from './handlers.js';
import { syncAllAndroidChipSections } from './android-chip-sections.js';


const PLAYERS_REMOVE_GROUP_ACTION = {
    id: 'remove_from_group',
    label: 'Remove From Group',
    icon: 'leave-group.svg',
};
const PLAYERS_RELOAD_PROVIDER_ACTION = {
    id: 'reload_provider',
    label: 'Reload Provider',
    icon: 'refresh.svg',
};
const PLAYERS_TAKE_OVER_ACTION = {
    id: 'take_over',
    label: 'Take Over',
    icon: 'take-over.svg',
};
const PLAYERS_TAKE_OVER_LEAD_ACTION = {
    id: 'take_over_lead',
    label: 'Take Over + Lead',
    icon: 'group-sync.svg',
};

function applyLocalSyncLeaderFromPlayer(player) {
    if (!player?.player_id || player.player_id !== maClient.playerId) return false;
    const syncedTo = player.synced_to || '';
    const membersKey = (player.group_members || []).join('\0');
    const key = `${syncedTo}\0${membersKey}`;
    if (key === state.lastLocalSyncStateKey) return false;
    state.lastLocalSyncStateKey = key;
    state.localSyncLeaderId = syncedTo || (player.group_members?.length ? player.player_id : '');
    refreshGroupOffsetPollState();
    void refreshLocalPlaybackSyncProfile();
    uiH('schedulePlaybackJoinRecovery', 'sync-membership');
    return true;
}



function playerHasNowPlaying(player) {
    if (!player) return false;
    if (player.current_media) return true;
    return player.playback_state === 'playing' || player.playback_state === 'paused';
}



function isStereoPairRemovable() {
    return isLocalDeviceSyncLeader() && !!state.playersActiveGroup;
}



function isRemovableGroupMember(playerId) {
    if (!isLocalDeviceSyncLeader() || !state.playersActiveGroup) return false;
    if (!playerId || playerId === state.playersActiveGroup.leaderId) return false;
    return state.playersActiveGroup.allIds.includes(playerId);
}



function canTakeOverAndLead(player) {
    const localId = maClient.playerId;
    if (!player || !localId || player.player_id === localId) return false;
    if (!playerHasNowPlaying(player)) return false;
    if (player.synced_to === localId || player.active_group === localId) return false;
    if (!maPlayerSupportsSync(player)) return false;
    const local = state.playersListCache.find((p) => p.player_id === localId);
    if (!local || !maPlayerSupportsSync(local) || local.synced_to) return false;
    const canGroup = new Set([
        ...(local.can_group_with || []),
        ...(player.can_group_with || []),
    ]);
    return canGroup.has(player.player_id) || canGroup.has(localId);
}



function getPlayersRowMenuActions(target) {
    const actions = [];
    if (!target) return actions;
    if (target.kind === 'stereo') {
        if (isStereoPairRemovable()) actions.push(PLAYERS_REMOVE_GROUP_ACTION);
        actions.push(PLAYERS_RELOAD_PROVIDER_ACTION);
        return actions;
    }
    const playerId = target.playerId;
    const player = state.playersListCache.find((p) => p.player_id === playerId);
    const isLocal = playerId === maClient.playerId;
    if (!isLocal && playerHasNowPlaying(player)) actions.push(PLAYERS_TAKE_OVER_ACTION);
    if (canTakeOverAndLead(player)) actions.push(PLAYERS_TAKE_OVER_LEAD_ACTION);
    if (isRemovableGroupMember(playerId)) actions.push(PLAYERS_REMOVE_GROUP_ACTION);
    actions.push(PLAYERS_RELOAD_PROVIDER_ACTION);
    return actions;
}



function getPlayersRowMenuTarget(row) {
    if (!row) return null;
    if (row.classList.contains('stereo-pair-group')) {
        return { kind: 'stereo', playerId: null };
    }
    const playerId = row.dataset.playerId;
    if (!playerId) return null;
    return { kind: 'player', playerId };
}



function closePlayersRowMenu() {
    if (!state.playersRowMenuOpen) return;
    state.playersRowMenuOpen = false;
    state.playersRowMenuIndex = -1;
    state.playersRowMenuTarget = null;
    state.playersRowMenuActions = [];
    state.playersMenuFocusIndex = 0;
    state.playersMenuActionEls = [];
    playersRowMenu.classList.remove('open');
    playersRowMenu.setAttribute('aria-hidden', 'true');
    playersRowMenu.innerHTML = '';
    uiH('resetPanelRowMenuPosition', playersRowMenu);
    uiH('updatePanelFocus');
}



function openPlayersRowMenu(index) {
    const rows = getPlayersListRows();
    const row = rows[index];
    if (!row || !shouldShowPlayersRowMenu(row)) return;
    const target = getPlayersRowMenuTarget(row);
    if (!target) return;
    const actions = getPlayersRowMenuActions(target);
    if (!actions.length) return;
    if (state.playersRowMenuOpen && state.playersRowMenuIndex === index) {
        closePlayersRowMenu();
        return;
    }
    closePlayersRowMenu();
    state.playersRowMenuIndex = index;
    state.playersRowMenuTarget = target;
    state.playersRowMenuActions = actions;
    state.playersMenuFocusIndex = 0;
    state.playersRowMenuOpen = true;
    state.playersMenuActionEls = uiH('renderPanelRowMenu', 
        playersRowMenu,
        actions,
        'players-row-menu-item',
    );
    state.playersMenuActionEls.forEach((btn, actionIndex) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            state.playersMenuFocusIndex = actionIndex;
            void activatePlayersMenuItem();
        });
    });
    playersRowMenu.classList.add('open');
    playersRowMenu.setAttribute('aria-hidden', 'false');
    uiH('positionPanelRowMenu', row, playersRowMenu);
    uiH('updatePanelFocus');
}



function movePlayersMenuFocus(delta) {
    let idx = state.playersMenuFocusIndex + delta;
    if (idx >= 0 && idx < state.playersMenuActionEls.length) {
        state.playersMenuFocusIndex = idx;
        uiH('updatePanelFocus');
    }
}



async function activatePlayersMenuItem() {
    const target = state.playersRowMenuTarget;
    const action = state.playersRowMenuActions[state.playersMenuFocusIndex];
    closePlayersRowMenu();
    if (!target || !action) return;
    switch (action.id) {
        case 'reload_provider': {
            const providerPlayerId = target.kind === 'stereo'
                ? state.playersActiveGroup?.leftId
                : target.playerId;
            if (providerPlayerId) await reloadPlayerProvider(providerPlayerId);
            break;
        }
        case 'take_over':
            if (target.playerId) await takeOverFromPlayer(target.playerId);
            break;
        case 'take_over_lead':
            if (target.playerId) await takeOverAndLeadFromPlayer(target.playerId);
            break;
        case 'remove_from_group':
            if (target.kind === 'stereo') await removeStereoPairFromActiveGroup();
            else if (target.playerId) await removeMemberFromActiveGroup(target.playerId);
            break;
        default:
            break;
    }
}



function maPlayerSupportsSync(player) {
    const features = player?.supported_features || [];
    return features.includes('set_members');
}



function playerProviderDomain(player) {
    const raw = player?.provider || player?.provider_id || player?.provider_instance_id || '';
    return String(raw).split('--')[0].toLowerCase();
}



function isEligibleSyncLeader(playerId, playersById) {
    const player = playersById.get(playerId);
    if (!player || !maPlayerSupportsSync(player)) return false;
    if (player.synced_to) return false;
    if (player.active_group) return false;
    return true;
}



function playersCanSyncTogether(leaderId, memberIds, playersById) {
    const leader = playersById.get(leaderId);
    if (!leader || !maPlayerSupportsSync(leader)) return false;
    if (leader.synced_to || leader.active_group) return false;
    const canGroup = new Set(leader.can_group_with || []);
    return memberIds.every((id) => {
        if (id === leaderId) return true;
        const member = playersById.get(id);
        if (!member || !maPlayerSupportsSync(member)) return false;
        if (member.synced_to || member.active_group) return false;
        return canGroup.has(id);
    });
}



async function waitForPlayersGroupCleared(playerIds, options = {}) {
    const ids = [...new Set((playerIds || []).filter(Boolean))];
    if (!ids.length) return true;
    const maxAttempts = options.maxAttempts ?? 6;
    const stepMs = options.delayMs ?? 350;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        let players;
        try {
            players = await maClient.send('players/all', {});
        } catch (err) {
            console.warn('waitForPlayersGroupCleared failed:', err);
            return false;
        }
        const byId = new Map((Array.isArray(players) ? players : []).map((p) => [p.player_id, p]));
        const pending = ids.filter((id) => {
            const p = byId.get(id);
            return p && (p.synced_to || p.group_members?.length);
        });
        if (!pending.length) return true;
        if (attempt >= maxAttempts - 1) return false;
        for (const id of pending) {
            try {
                await maClient.send('players/cmd/ungroup', { player_id: id });
            } catch (err) {
                console.warn('retry ungroup failed:', id, err);
            }
        }
        await delayMs(stepMs);
    }
    return false;
}



function playerNeedsSequentialCastJoin(playerId, playersById) {
    const player = playersById.get(playerId);
    if (!player) return false;
    return playerProviderDomain(player) === 'chromecast';
}



function memberCastProtocolReady(member) {
    if (!member || playerProviderDomain(member) !== 'chromecast') return true;
    const proto = member.active_output_protocol;
    return !!proto && String(proto).startsWith('spb_') && member.available !== false;
}



function orderMembersForSequentialJoin(memberIds, playersById, stereoPair, leftId, rightId) {
    if (stereoPair && leftId && rightId) {
        const stereoOrder = [leftId, rightId].filter((id) => memberIds.includes(id));
        return [...stereoOrder, ...memberIds.filter((id) => !stereoOrder.includes(id))];
    }
    const castMembers = memberIds.filter((id) => playerNeedsSequentialCastJoin(id, playersById));
    const other = memberIds.filter((id) => !castMembers.includes(id));
    return [...castMembers, ...other];
}



async function waitForMemberSyncedToLeader(leaderId, memberId, options = {}) {
    const maxAttempts = options.maxAttempts ?? CAST_MEMBER_SYNC_MAX_ATTEMPTS;
    const stepMs = options.stepMs ?? CAST_MEMBER_SYNC_STEP_MS;
    const requireCastProtocol = options.requireCastProtocol ?? false;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        let players;
        try {
            players = await maClient.send('players/all', {});
        } catch (err) {
            console.warn('waitForMemberSyncedToLeader failed:', err);
            return false;
        }
        const byId = new Map(players.map((p) => [p.player_id, p]));
        const member = byId.get(memberId);
        const leader = byId.get(leaderId);
        if (!member || !leader) {
            await delayMs(stepMs);
            continue;
        }
        const synced = member.synced_to === leaderId
            || (leader.group_members || []).includes(memberId);
        const castReady = !requireCastProtocol || memberCastProtocolReady(member);
        if (synced && castReady) return true;
        await delayMs(stepMs);
    }
    return false;
}



async function addSyncGroupMembersSequential(leaderId, memberIds, playersById, {
    stereoPair = false,
    leftId = null,
    rightId = null,
} = {}) {
    const ordered = orderMembersForSequentialJoin(memberIds, playersById, stereoPair, leftId, rightId);
    const castMembers = ordered.filter((id) => playerNeedsSequentialCastJoin(id, playersById));
    const otherMembers = ordered.filter((id) => !castMembers.includes(id));

    for (const memberId of castMembers) {
        const name = playerDisplayName(memberId);
        uiH('setStatus', `adding ${name} to sync…`, '');
        await maClient.send('players/cmd/set_members', {
            target_player: leaderId,
            player_ids_to_add: [memberId],
        });
        const ready = await waitForMemberSyncedToLeader(leaderId, memberId, {
            requireCastProtocol: true,
        });
        if (!ready) {
            console.warn('cast member sync wait incomplete:', memberId);
        }
        if (castMembers.indexOf(memberId) < castMembers.length - 1 || otherMembers.length) {
            await delayMs(CAST_MEMBER_JOIN_SETTLE_MS);
        }
    }

    if (otherMembers.length) {
        await maClient.send('players/cmd/set_members', {
            target_player: leaderId,
            player_ids_to_add: otherMembers,
        });
        for (const memberId of otherMembers) {
            await waitForMemberSyncedToLeader(leaderId, memberId, { maxAttempts: 15 });
        }
    }
}



async function collectSyncGroupUngroupIds(group) {
    const ids = new Set(group?.allIds || []);
    if (!group?.leaderId) return [...ids];
    let players;
    try {
        players = await maClient.send('players/all', {});
    } catch (err) {
        console.warn('collectSyncGroupUngroupIds failed:', err);
        return [...ids];
    }
    const byId = new Map(players.map((p) => [p.player_id, p]));
    for (const id of group.allIds) {
        const player = byId.get(id);
        const proto = player?.active_output_protocol;
        if (proto && proto !== 'native') ids.add(proto);
    }
    const leader = byId.get(group.leaderId);
    (leader?.group_members || []).forEach((id) => ids.add(id));
    for (const player of players) {
        if (player.synced_to === group.leaderId) ids.add(player.player_id);
    }
    return [...ids];
}



async function waitForLeaderGroupEmpty(leaderId, options = {}) {
    const maxAttempts = options.maxAttempts ?? GROUP_DISSOLVE_MAX_ATTEMPTS;
    const stepMs = options.stepMs ?? GROUP_DISSOLVE_STEP_MS;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        let players;
        try {
            players = await maClient.send('players/all', {});
        } catch (err) {
            console.warn('waitForLeaderGroupEmpty failed:', err);
            return false;
        }
        const leader = players.find((p) => p.player_id === leaderId);
        const members = (leader?.group_members || []).filter((id) => id !== leaderId);
        const synced = players.filter((p) => p.synced_to === leaderId);
        if (!members.length && !synced.length) return true;
        await delayMs(stepMs);
    }
    return false;
}



async function dissolveSyncGroupFully(group) {
    const ids = await collectSyncGroupUngroupIds(group);
    if (ids.length) {
        await maClient.send('players/cmd/ungroup_many', { player_ids: ids });
        await waitForPlayersGroupCleared(ids, { maxAttempts: 10 });
    }
    const leaderCleared = await waitForLeaderGroupEmpty(group.leaderId);
    if (!leaderCleared) {
        let players = await maClient.send('players/all', {});
        for (const player of players) {
            if (player.synced_to === group.leaderId
                || (player.player_id === group.leaderId && (player.group_members?.length || 0) > 1)) {
                try {
                    await maClient.send('players/cmd/ungroup', { player_id: player.player_id });
                } catch (err) {
                    console.warn('dissolve retry ungroup failed:', player.player_id, err);
                }
            }
        }
        await waitForLeaderGroupEmpty(group.leaderId, { maxAttempts: 10 });
    }
}



async function getSyncGroupLeaderId() {
    if (state.playersActiveGroup?.leaderId) return state.playersActiveGroup.leaderId;
    try {
        await maClient.ensureReady();
        const players = await maClient.send('players/all', {});
        const local = players.find((p) => p.player_id === maClient.playerId);
        if (!local) return null;
        if (local.synced_to) return local.synced_to;
        const members = (local.group_members || []).filter((id) => id !== maClient.playerId);
        if (members.length) return maClient.playerId;
    } catch (err) {
        console.warn('getSyncGroupLeaderId failed:', err);
    }
    if (state.localSyncLeaderId && state.localSyncLeaderId !== maClient.playerId) return state.localSyncLeaderId;
    return null;
}



async function localPlayerInSyncGroup() {
    const leaderId = await getSyncGroupLeaderId();
    if (!leaderId) return false;
    if (leaderId === maClient.playerId) return true;
    try {
        const players = await maClient.send('players/all', {});
        const local = players.find((p) => p.player_id === maClient.playerId);
        return local?.synced_to === leaderId;
    } catch {
        return !!state.localSyncLeaderId;
    }
}



async function pauseSyncGroupPlayback() {
    const leaderId = await getSyncGroupLeaderId();
    if (!leaderId) return;
    const queueId = await resolvePlayerQueueId(leaderId);
    await maClient.send('player_queues/pause', { queue_id: queueId });
}



async function resumeSyncGroupPlayback() {
    const leaderId = await getSyncGroupLeaderId();
    if (!leaderId) return;
    const queueId = await resolvePlayerQueueId(leaderId);
    await maClient.send('player_queues/resume', { queue_id: queueId });
}



async function stopSyncGroupPlayback() {
    const leaderId = await getSyncGroupLeaderId();
    if (!leaderId) return;
    await maClient.send('players/cmd/stop', { player_id: leaderId });
}



function findViableSyncLeader(selectedIds, playersById) {
    const preferred = pickSyncLeader(selectedIds, playersById);
    if (preferred) {
        const members = selectedIds.filter((id) => id !== preferred);
        if (playersCanSyncTogether(preferred, members, playersById)) return preferred;
    }
    const tryOrder = [...selectedIds];
    for (const id of selectedIds) {
        if (!tryOrder.includes(id)) tryOrder.push(id);
    }
    const seen = new Set();
    for (const id of tryOrder) {
        if (seen.has(id)) continue;
        seen.add(id);
        if (!isEligibleSyncLeader(id, playersById)) continue;
        const members = selectedIds.filter((x) => x !== id);
        if (playersCanSyncTogether(id, members, playersById)) return id;
    }
    return null;
}



async function repairSelectedPlayersGroupState(selectedIds) {
    let players = await maClient.send('players/all', {});
    const byId = new Map((Array.isArray(players) ? players : []).map((p) => [p.player_id, p]));
    if (areSelectedPlayersInSameGroup(selectedIds, byId)) {
        return sortMaPlayers(filterMaPlayers(players));
    }
    const needsUngroup = selectedIds.filter((id) => {
        const player = byId.get(id);
        if (!player) return false;
        return !!(player.synced_to || player.group_members?.length);
    });
    if (needsUngroup.length) {
        for (const id of needsUngroup) {
            try {
                await maClient.send('players/cmd/ungroup', { player_id: id });
            } catch (err) {
                console.warn('pre-sync ungroup failed:', id, err);
            }
        }
        await waitForPlayersGroupCleared(needsUngroup);
    }
    players = await maClient.send('players/all', {});
    return sortMaPlayers(filterMaPlayers(players));
}



function activeGroupHasManualSyncOffsets(group) {
    if (!group?.allIds?.length) return false;
    return group.allIds.some((id) => {
        const staticMs = state.playerSyncDelayCache.get(id) ?? 0;
        const trimMs = state.playerGroupTrimCache.get(id) ?? 0;
        return staticMs !== 0 || trimMs !== 0;
    });
}



function isGroupSyncLeader(playerId) {
    return !!(playerId && state.playersActiveGroup?.leaderId === playerId);
}



function isLocalDeviceSyncLeader() {
    const group = state.playersActiveGroup;
    return !!(group && maClient.playerId && maClient.playerId === group.leaderId);
}



function canViewPlayerSyncDelay(playerId) {
    const group = state.playersActiveGroup;
    if (!group?.allIds?.includes(playerId)) return false;
    if (isLocalDeviceSyncLeader()) return true;
    return playerId === maClient.playerId;
}



function canAdjustPlayerSyncDelay(playerId) {
    if (!canViewPlayerSyncDelay(playerId)) return false;
    return !isGroupSyncLeader(playerId);
}



function maPlayerSupportsStereoPair(player) {
    if (!player) return false;
    if (player.type === 'stereo_pair' || player.type === 'group') return false;
    return maPlayerSupportsSync(player);
}



function getPlayersSyncSelectedOrder() {
    return state.playersSyncSelectedOrder.filter((id) => state.playersSyncSelected.has(id));
}



function canFormStereoPair(selectedOrder, playersById) {
    if (selectedOrder.length !== 2) return false;
    const [leftId, rightId] = selectedOrder;
    const left = playersById.get(leftId);
    const right = playersById.get(rightId);
    if (!maPlayerSupportsStereoPair(left) || !maPlayerSupportsStereoPair(right)) return false;
    return playersCanSyncTogether(leftId, [rightId], playersById);
}



function canFormStereoWithLocalLeader(selectedOrder, playersById) {
    const localId = maClient.playerId;
    if (!localId || selectedOrder.length !== 2 || selectedOrder.includes(localId)) return false;
    if (!canFormStereoPair(selectedOrder, playersById)) return false;
    if (!isEligibleSyncLeader(localId, playersById)) return false;
    return playersCanSyncTogether(localId, selectedOrder, playersById);
}



function getActiveOutputProtocolId(playerId) {
    const player = state.playersListCache.find((p) => p.player_id === playerId);
    const protocol = player?.active_output_protocol;
    return protocol && protocol !== 'native' ? protocol : null;
}



function getPlayerConfigCandidateIds(playerId) {
    const ids = [playerId];
    const protocol = getActiveOutputProtocolId(playerId);
    if (protocol) ids.push(protocol);
    return [...new Set(ids.filter(Boolean))];
}



function listPlayerConfigValueKeys(conf, key) {
    const keys = [key];
    const values = conf?.values;
    if (!values) return keys;
    const suffix = `${MA_PROTOCOL_KEY_SPLITTER}${key}`;
    Object.keys(values).forEach((k) => {
        if (k.endsWith(suffix) && !keys.includes(k)) keys.push(k);
    });
    return keys;
}



function extractPlayerConfigRawValue(conf, key) {
    if (!conf) return null;
    const values = conf.values || {};
    for (const lookupKey of listPlayerConfigValueKeys(conf, key)) {
        const raw = values[lookupKey];
        if (raw == null) continue;
        if (typeof raw === 'object' && raw !== null && 'value' in raw) {
            if (raw.value != null) return raw.value;
            continue;
        }
        return raw;
    }
    return null;
}



async function readPlayerConfigForId(playerId) {
    try {
        return await maClient.send('config/players/get', { player_id: playerId });
    } catch {
        return null;
    }
}



async function readPlayerOutputChannels(playerId) {
    for (const id of getPlayerConfigCandidateIds(playerId)) {
        const conf = await readPlayerConfigForId(id);
        const fromConf = extractPlayerConfigRawValue(conf, 'output_channels');
        if (fromConf != null) {
            const ch = String(fromConf).toLowerCase();
            if (ch === 'left' || ch === 'right' || ch === 'mono') return ch;
        }
        try {
            const value = await maClient.send('config/players/get_value', {
                player_id: id,
                key: 'output_channels',
                default: null,
            });
            if (value != null) {
                const ch = String(value).toLowerCase();
                if (ch === 'left' || ch === 'right' || ch === 'mono') return ch;
            }
        } catch {
            /* try next candidate */
        }
    }
    return 'stereo';
}



async function applyPlayerOutputChannels(playerId, channels) {
    await maClient.send('config/players/save', {
        player_id: playerId,
        values: { output_channels: channels },
    });
}



async function resetPlayersOutputChannels(playerIds) {
    await Promise.all(playerIds.map(async (playerId) => {
        try {
            const current = await readPlayerOutputChannels(playerId);
            if (current !== 'stereo') {
                await applyPlayerOutputChannels(playerId, 'stereo');
            }
        } catch (err) {
            console.warn('reset output channels failed:', playerId, err);
        }
    }));
}



async function resolvePlayerSyncDelayKey(playerId) {
    if (state.playerSyncDelayConfigKeyCache.has(playerId)) {
        return state.playerSyncDelayConfigKeyCache.get(playerId);
    }
    try {
        const entries = await maClient.send('config/players/get', { player_id: playerId });
        const list = Array.isArray(entries) ? entries : [];
        const preferred = list.find((entry) => entry.key === SYNC_DELAY_CONFIG_KEY);
        if (preferred) {
            state.playerSyncDelayConfigKeyCache.set(playerId, preferred.key);
            return preferred.key;
        }
        const legacy = list.find((entry) => SYNC_DELAY_LEGACY_KEYS.includes(entry.key));
        if (legacy) {
            state.playerSyncDelayConfigKeyCache.set(playerId, legacy.key);
            return legacy.key;
        }
    } catch (err) {
        console.warn('resolve sync delay key failed:', playerId, err);
    }
    state.playerSyncDelayConfigKeyCache.set(playerId, SYNC_DELAY_CONFIG_KEY);
    return SYNC_DELAY_CONFIG_KEY;
}



const syncDelayAdjustLocks = new Map();

const playerOffsetSaveSettleUntil = new Map();

const PLAYER_OFFSET_SAVE_SETTLE_MS = 1800;

const GROUP_OFFSET_POLL_MS = 2500;
const GROUP_OFFSET_POLL_IDLE_MS = 5500;

let groupOffsetPollTimer = null;

let localOffsetSyncTimer = null;

let groupOffsetDisplaySyncTimer = null;

const pendingOffsetDisplayPlayerIds = new Set();



function playerOffsetSaveSettling(playerId) {
    return (playerOffsetSaveSettleUntil.get(playerId) ?? 0) > Date.now();
}



function readCachedPlayerPlaybackOffsets(playerId) {
    return {
        staticMs: state.playerSyncDelayCache.get(playerId) ?? 0,
        trimMs: state.playerGroupTrimCache.get(playerId) ?? 0,
    };
}



async function readPlayerConfigOffsetValue(playerId, key, clampFn, { allowGetValue = true } = {}) {
    for (const id of getPlayerConfigCandidateIds(playerId)) {
        const conf = await readPlayerConfigForId(id);
        const fromConf = extractPlayerConfigRawValue(conf, key);
        if (fromConf != null && !Number.isNaN(Number(fromConf))) {
            return clampFn(Number(fromConf));
        }
        if (!allowGetValue) continue;
        try {
            const value = await maClient.send('config/players/get_value', {
                player_id: id,
                key,
            });
            if (value != null && !Number.isNaN(Number(value))) {
                return clampFn(Number(value));
            }
        } catch {
            /* optional key may not exist yet */
        }
    }
    return null;
}



async function readPlayerSyncDelayMs(playerId, { bypassCache = false } = {}) {
    if (!bypassCache && state.playerSyncDelayCache.has(playerId)) {
        return state.playerSyncDelayCache.get(playerId);
    }
    if (bypassCache && playerOffsetSaveSettling(playerId) && state.playerSyncDelayCache.has(playerId)) {
        return state.playerSyncDelayCache.get(playerId);
    }
    try {
        const delayKey = await resolvePlayerSyncDelayKey(playerId);
        const ms = await readPlayerConfigOffsetValue(playerId, delayKey, clampStaticDelayMs);
        if (ms != null) {
            state.playerSyncDelayCache.set(playerId, ms);
            return ms;
        }
    } catch (err) {
        console.warn('read static delay failed:', playerId, err);
    }
    state.playerSyncDelayCache.set(playerId, 0);
    return 0;
}



async function readPlayerGroupTrimMs(playerId, { bypassCache = false } = {}) {
    if (!bypassCache && state.playerGroupTrimCache.has(playerId)) {
        return state.playerGroupTrimCache.get(playerId);
    }
    if (bypassCache && playerOffsetSaveSettling(playerId) && state.playerGroupTrimCache.has(playerId)) {
        return state.playerGroupTrimCache.get(playerId);
    }
    try {
        const ms = await readPlayerConfigOffsetValue(
            playerId,
            GROUP_TRIM_CONFIG_KEY,
            clampGroupTrimMs,
            { allowGetValue: false },
        );
        if (ms != null) {
            state.playerGroupTrimCache.set(playerId, ms);
            return ms;
        }
    } catch (err) {
        console.warn('read group trim failed:', playerId, err);
    }
    state.playerGroupTrimCache.set(playerId, 0);
    return 0;
}



async function persistPlayerGroupTrim(playerId, groupTrimMs) {
    const trimMs = clampGroupTrimMs(groupTrimMs);
    const staticMs = state.playerSyncDelayCache.get(playerId) ?? 0;
    await persistPlayerPlaybackOffsetsConfig(playerId, staticMs, trimMs);
    return trimMs;
}



async function persistPlayerPlaybackOffsetsConfig(playerId, staticDelayMs, groupTrimMs) {
    const staticMs = clampStaticDelayMs(staticDelayMs);
    const trimMs = clampGroupTrimMs(groupTrimMs);
    const delayKey = await resolvePlayerSyncDelayKey(playerId);
    await maClient.send('config/players/save', {
        player_id: playerId,
        values: {
            [delayKey]: staticMs,
            [GROUP_TRIM_CONFIG_KEY]: trimMs,
        },
    });
    state.playerSyncDelayCache.set(playerId, staticMs);
    state.playerGroupTrimCache.set(playerId, trimMs);
    return { staticMs, trimMs };
}



async function readPlayerPlaybackOffsets(playerId, { bypassCache = false } = {}) {
    const [staticMs, trimMs] = await Promise.all([
        readPlayerSyncDelayMs(playerId, { bypassCache }),
        readPlayerGroupTrimMs(playerId, { bypassCache }),
    ]);
    return { staticMs, trimMs, netMs: netGroupOffsetMs(staticMs, trimMs) };
}



function getCachedPlayerNetOffset(playerId) {
    const staticMs = state.playerSyncDelayCache.get(playerId) ?? 0;
    const trimMs = state.playerGroupTrimCache.get(playerId) ?? 0;
    return netGroupOffsetMs(staticMs, trimMs);
}



function formatPlayerOffsetLabel(playerId) {
    const staticMs = state.playerSyncDelayCache.get(playerId) ?? 0;
    const trimMs = state.playerGroupTrimCache.get(playerId) ?? 0;
    if (isGroupSyncLeader(playerId)) return '0 ms · anchor';
    return formatNetOffsetLabel(staticMs, trimMs);
}



async function persistPlayerStaticDelay(playerId, staticDelayMs) {
    const staticMs = clampStaticDelayMs(staticDelayMs);
    const trimMs = state.playerGroupTrimCache.get(playerId) ?? 0;
    await persistPlayerPlaybackOffsetsConfig(playerId, staticMs, trimMs);
    return staticMs;
}



function markPlayerOffsetSaveSettle(playerId) {
    playerOffsetSaveSettleUntil.set(playerId, Date.now() + PLAYER_OFFSET_SAVE_SETTLE_MS);
}



async function savePlayerPlaybackOffsets(playerId, staticDelayMs, groupTrimMs) {
    const staticMs = clampStaticDelayMs(staticDelayMs);
    const trimMs = clampGroupTrimMs(groupTrimMs);
    state.playerSyncDelayCache.set(playerId, staticMs);
    state.playerGroupTrimCache.set(playerId, trimMs);
    if (playerId === maClient.playerId) {
        applyLocalPlaybackOffsets(staticMs, trimMs);
    }
    await persistPlayerPlaybackOffsetsConfig(playerId, staticMs, trimMs);
    markPlayerOffsetSaveSettle(playerId);
    return { staticMs, trimMs, netMs: netGroupOffsetMs(staticMs, trimMs) };
}



async function savePlayerStaticDelay(playerId, staticDelayMs) {
    const staticMs = clampStaticDelayMs(staticDelayMs);
    state.playerSyncDelayCache.set(playerId, staticMs);
    if (playerId === maClient.playerId) {
        applyLocalPlayerSyncDelay(staticMs);
    }
    return persistPlayerStaticDelay(playerId, staticMs);
}



function invalidatePlayerSyncDelayCache(playerIds) {
    for (const id of playerIds || []) {
        if (!id) continue;
        state.playerSyncDelayCache.delete(id);
        state.playerGroupTrimCache.delete(id);
        state.playerSyncDelayConfigKeyCache.delete(id);
    }
}



function updateStereoPairDelaySubtitle() {
    const stereoSubtitle = playersList?.querySelector('.stereo-pair-group .panel-row-subtitle');
    const group = state.playersActiveGroup;
    if (!stereoSubtitle || !group?.isStereo || !group.leftId) return;
    const pairNames = formatPlayerNamesTitle([group.leftId, group.rightId]);
    const offsetsSplit = !state.playersStereoPairExpanded && !areStereoPairDelaysSynced(group);
    stereoSubtitle.textContent = offsetsSplit
        ? `${pairNames} · Offsets differ`
        : pairNames;
}



function updatePlayersSyncDelayLabels() {
    if (!playersList) return;
    playersList.querySelectorAll('.panel-row-wrap').forEach((wrap) => {
        const label = wrap.querySelector('.player-sync-delay-label');
        if (!label) return;
        let playerId = wrap.dataset.playerId;
        if (wrap.dataset.stereoPair === 'true' && state.playersActiveGroup?.leftId) {
            playerId = state.playersActiveGroup.leftId;
        }
        if (!playerId) return;
        label.textContent = formatPlayerOffsetLabel(playerId);
    });
}



function formatSyncDelayLabel(playerId) {
    return formatPlayerOffsetLabel(playerId);
}



function getPlaybackBufferAheadSec() {
    const processor = window.playerInstance?.audioProcessor;
    const ctx = window.playerInstance?.audioContext;
    if (!processor || !ctx) return 0;
    return processor.getScheduledAheadSec?.(ctx.currentTime ?? 0) ?? 0;
}



function playbackOffsetMinAheadSec() {
    if (IS_ANDROID && state.playersActiveGroup?.allIds?.includes(maClient.playerId)) {
        return ANDROID_PLAYBACK_BUFFER_MIN_AHEAD_SEC;
    }
    return PLAYBACK_OFFSET_MIN_AHEAD_SEC;
}



function applyLocalPlaybackOffsets(staticDelayMs, groupTrimMs, { immediate = false } = {}) {
    const staticMs = clampStaticDelayMs(staticDelayMs);
    const trimMs = clampGroupTrimMs(groupTrimMs);
    const applyNow = () => {
        try {
            window.playerInstance?.setPlaybackOffsets?.(staticMs, trimMs);
        } catch (err) {
            console.warn('local playback offsets apply failed:', err);
        }
    };
    if (immediate || getPlaybackBufferAheadSec() >= playbackOffsetMinAheadSec()) {
        clearTimeout(state._deferredOffsetApplyTimer);
        state._pendingPlaybackOffsets = null;
        applyNow();
        return;
    }
    state._pendingPlaybackOffsets = { staticMs, trimMs };
    clearTimeout(state._deferredOffsetApplyTimer);
    state._deferredOffsetApplyTimer = setTimeout(async () => {
        state._deferredOffsetApplyTimer = null;
        const pending = state._pendingPlaybackOffsets;
        if (!pending) return;
        const deadline = Date.now() + PLAYBACK_JOIN_BUFFER_WAIT_MS;
        while (Date.now() < deadline) {
            if (getPlaybackBufferAheadSec() >= playbackOffsetMinAheadSec()) {
                state._pendingPlaybackOffsets = null;
                applyLocalPlaybackOffsets(pending.staticMs, pending.trimMs, { immediate: true });
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        state._pendingPlaybackOffsets = null;
        applyLocalPlaybackOffsets(pending.staticMs, pending.trimMs, { immediate: true });
    }, SYNC_DELAY_CUTOVER_DEBOUNCE_MS);
}



function applyLocalPlayerSyncDelay(staticDelayMs) {
    const trimMs = state.playerGroupTrimCache.get(maClient.playerId) ?? 0;
    applyLocalPlaybackOffsets(staticDelayMs, trimMs);
}



function applyLocalGroupCorrectionMode() {
    let inGroup = !!(state.playersActiveGroup?.allIds?.includes(maClient.playerId));
    if (!inGroup && maClient.playerId) {
        const local = state.playersListCache.find((p) => p.player_id === maClient.playerId);
        inGroup = !!(local?.synced_to || local?.group_members?.length);
    }
    uiH('applySyncGroupCorrectionMode', inGroup);
}



function areSelectedPlayersInSameGroup(selectedIds, playersById) {
    if (selectedIds.length < 2) return true;
    let leaderId = null;
    for (const id of selectedIds) {
        const player = playersById.get(id);
        if (!player) return false;
        const playerLeader = player.group_members?.length ? id : (player.synced_to || null);
        if (!playerLeader) return false;
        if (!leaderId) leaderId = playerLeader;
        else if (playerLeader !== leaderId) return false;
    }
    const leader = playersById.get(leaderId);
    if (!leader) return false;
    const groupIds = new Set([leaderId, ...(leader.group_members || [])]);
    if (groupIds.size !== selectedIds.length) return false;
    return selectedIds.every((id) => groupIds.has(id));
}



async function clearPlayerPlaybackOffsets(playerId, { resyncPlayback = false } = {}) {
    try {
        await savePlayerPlaybackOffsets(playerId, 0, 0);
    } catch (err) {
        console.warn('clear playback offsets failed:', playerId, err);
    }
    if (resyncPlayback && playerId === maClient.playerId) {
        triggerLocalSendspinPlaybackResync();
    }
}



async function clearPlayerSyncDelayMs(playerId, options = {}) {
    return clearPlayerPlaybackOffsets(playerId, options);
}



async function clearPlayersSyncDelays(playerIds, options = {}) {
    const ids = [...new Set((playerIds || []).filter(Boolean))];
    if (!ids.length) return;
    await Promise.all(ids.map((id) => clearPlayerSyncDelayMs(id, options)));
}



async function loadGroupSyncDelays(playerIds) {
    const ids = [...new Set((playerIds || []).filter(Boolean))];
    if (!ids.length) return;
    await Promise.all(ids.map((id) => {
        const useCache = syncDelayAdjustLocks.has(id) || playerOffsetSaveSettling(id);
        return readPlayerPlaybackOffsets(id, { bypassCache: !useCache }).catch((err) => {
            console.warn('read playback offsets failed:', id, err);
            return readCachedPlayerPlaybackOffsets(id);
        });
    }));
    updatePlayersSyncDelayLabels();
    updateStereoPairDelaySubtitle();
}



async function refreshLocalPlaybackSyncProfile() {
    if (!maClient.playerId) return;
    applyLocalGroupCorrectionMode();
    try {
        const { staticMs, trimMs } = await readPlayerPlaybackOffsets(maClient.playerId, { bypassCache: true });
        applyLocalPlaybackOffsets(staticMs, trimMs);
        const channels = await readPlayerOutputChannels(maClient.playerId);
        window.playerInstance?.setOutputChannelMode?.(channels);
    } catch (err) {
        console.warn('refresh local playback sync profile failed:', err);
    }
}



function stopGroupOffsetPoll() {
    if (groupOffsetPollTimer) {
        clearInterval(groupOffsetPollTimer);
        groupOffsetPollTimer = null;
    }
}



function startGroupOffsetPoll() {
    stopGroupOffsetPoll();
    if (!localPlayerInMaSyncGroup() && !isLocalDeviceSyncLeader()) return;
    const pollMs = state.playersPanelOpen ? GROUP_OFFSET_POLL_MS : GROUP_OFFSET_POLL_IDLE_MS;
    groupOffsetPollTimer = setInterval(() => {
        if (isLocalDeviceSyncLeader() && state.playersPanelOpen) {
            void syncGroupOffsetDisplayFromMa();
        } else if (localPlayerInMaSyncGroup()) {
            void syncLocalPlaybackOffsetsFromMa();
        } else {
            stopGroupOffsetPoll();
        }
    }, pollMs);
}



function refreshGroupOffsetPollState() {
    if (localPlayerInMaSyncGroup() || isLocalDeviceSyncLeader()) startGroupOffsetPoll();
    else stopGroupOffsetPoll();
}



function localPlayerInMaSyncGroup() {
    if (state.playersActiveGroup?.allIds?.includes(maClient.playerId)) return true;
    const local = state.playersListCache.find((p) => p.player_id === maClient.playerId);
    return !!(local?.synced_to || local?.group_members?.length);
}



async function syncGroupOffsetDisplayFromMa() {
    const group = state.playersActiveGroup;
    if (!group?.allIds?.length || !isLocalDeviceSyncLeader()) return;
    let changed = false;
    for (const id of group.allIds) {
        if (syncDelayAdjustLocks.has(id) || playerOffsetSaveSettling(id)) continue;
        const prevNet = getCachedPlayerNetOffset(id);
        try {
            await readPlayerPlaybackOffsets(id, { bypassCache: true });
        } catch (err) {
            console.warn('read group offset display failed:', id, err);
            continue;
        }
        if (getCachedPlayerNetOffset(id) !== prevNet) changed = true;
    }
    if (changed && state.playersPanelOpen) {
        updatePlayersSyncDelayLabels();
        updateStereoPairDelaySubtitle();
        if (state.playersActiveGroup) updatePlayersSyncUi();
    }
}



function scheduleGroupOffsetDisplaySync(playerId) {
    if (!playerId) return;
    const group = state.playersActiveGroup;
    if (!group?.allIds?.includes(playerId)) return;
    pendingOffsetDisplayPlayerIds.add(playerId);
    clearTimeout(groupOffsetDisplaySyncTimer);
    groupOffsetDisplaySyncTimer = setTimeout(() => {
        groupOffsetDisplaySyncTimer = null;
        const ids = [...pendingOffsetDisplayPlayerIds];
        pendingOffsetDisplayPlayerIds.clear();
        void refreshGroupOffsetDisplay(ids);
    }, 250);
}



async function refreshGroupOffsetDisplay(playerIds) {
    if (!state.playersPanelOpen) return;
    let changed = false;
    for (const id of playerIds) {
        if (syncDelayAdjustLocks.has(id) || playerOffsetSaveSettling(id)) continue;
        const prevNet = getCachedPlayerNetOffset(id);
        try {
            await readPlayerPlaybackOffsets(id, { bypassCache: true });
        } catch (err) {
            console.warn('refresh group offset display failed:', id, err);
            continue;
        }
        if (getCachedPlayerNetOffset(id) !== prevNet) changed = true;
    }
    if (changed) {
        updatePlayersSyncDelayLabels();
        updateStereoPairDelaySubtitle();
        if (state.playersActiveGroup) updatePlayersSyncUi();
    }
}



function scheduleLocalPlaybackOffsetsSync() {
    clearTimeout(localOffsetSyncTimer);
    localOffsetSyncTimer = setTimeout(() => {
        localOffsetSyncTimer = null;
        void syncLocalPlaybackOffsetsFromMa();
    }, 350);
}



async function syncLocalPlaybackOffsetsFromMa() {
    if (!maClient.playerId) return;
    try {
        const { staticMs, trimMs } = await readPlayerPlaybackOffsets(maClient.playerId, {
            bypassCache: state.playersPanelOpen,
        });
        const prevStatic = state.playerSyncDelayCache.get(maClient.playerId) ?? 0;
        const prevTrim = state.playerGroupTrimCache.get(maClient.playerId) ?? 0;
        applyLocalPlaybackOffsets(staticMs, trimMs);
        if (staticMs !== prevStatic || trimMs !== prevTrim) {
            if (state.playersPanelOpen) {
                updatePlayersSyncDelayLabels();
                updateStereoPairDelaySubtitle();
                if (state.playersActiveGroup) updatePlayersSyncUi();
            }
        }
    } catch (err) {
        console.warn('sync local playback offsets failed:', err);
    }
}

async function adjustPlayerSyncDelay(playerId, deltaMs) {
    if (syncDelayAdjustLocks.has(playerId)) {
        return syncDelayAdjustLocks.get(playerId);
    }
    const run = adjustPlayerSyncDelayInner(playerId, deltaMs);
    syncDelayAdjustLocks.set(playerId, run);
    try {
        return await run;
    } finally {
        if (syncDelayAdjustLocks.get(playerId) === run) {
            syncDelayAdjustLocks.delete(playerId);
        }
    }
}

function applyGroupOffsetDelta(staticMs, trimMs, deltaMs) {
    let staticDelay = clampStaticDelayMs(staticMs);
    let groupTrim = clampGroupTrimMs(trimMs);
    if (deltaMs > 0) {
        let remaining = deltaMs;
        if (staticDelay > 0) {
            const reduce = Math.min(staticDelay, remaining);
            staticDelay -= reduce;
            remaining -= reduce;
        }
        if (remaining > 0) {
            groupTrim = clampGroupTrimMs(groupTrim + remaining);
        }
    } else if (deltaMs < 0) {
        let remaining = -deltaMs;
        if (groupTrim > 0) {
            const reduce = Math.min(groupTrim, remaining);
            groupTrim -= reduce;
            remaining -= reduce;
        }
        if (remaining > 0) {
            staticDelay = clampStaticDelayMs(staticDelay + remaining);
        }
    }
    return { staticMs: staticDelay, trimMs: groupTrim };
}



async function adjustPlayerSyncDelayInner(playerId, deltaMs) {
    if (!canAdjustPlayerSyncDelay(playerId)) {
        return getCachedPlayerNetOffset(playerId);
    }
    const group = state.playersActiveGroup;
    if (group?.allIds?.includes(playerId)) {
        const playersById = new Map(state.playersListCache.map((p) => [p.player_id, p]));
        if (!isPlayerInSyncGroup(playerId, group, playersById)) {
            const name = playerDisplayName(playerId);
            playersPanelHint.textContent = `${name} not in sync group — refresh sync or re-add before tuning offset`;
            uiH('setStatus', `${name} not in group`, 'error');
            return getCachedPlayerNetOffset(playerId);
        }
        const player = playersById.get(playerId);
        if (player?.available === false) {
            const name = playerDisplayName(playerId);
            playersPanelHint.textContent = `${name} unavailable — wait for reconnect before tuning offset`;
            uiH('setStatus', `${name} unavailable`, 'error');
            return getCachedPlayerNetOffset(playerId);
        }
    }
    const currentStatic = state.playerSyncDelayCache.has(playerId)
        ? state.playerSyncDelayCache.get(playerId)
        : (await readPlayerSyncDelayMs(playerId, { bypassCache: true }));
    const currentTrim = state.playerGroupTrimCache.has(playerId)
        ? state.playerGroupTrimCache.get(playerId)
        : (await readPlayerGroupTrimMs(playerId, { bypassCache: true }));
    const next = applyGroupOffsetDelta(currentStatic, currentTrim, deltaMs);
    const name = playerDisplayName(playerId);
    if (playerId === maClient.playerId) {
        applyLocalPlaybackOffsets(next.staticMs, next.trimMs);
    }
    state.playerSyncDelayCache.set(playerId, next.staticMs);
    state.playerGroupTrimCache.set(playerId, next.trimMs);
    updatePlayersSyncDelayLabels();
    uiH('setStatus', `${name} · ${formatNetOffsetLabel(next.staticMs, next.trimMs)}`, 'connected');
    try {
        await savePlayerPlaybackOffsets(playerId, next.staticMs, next.trimMs);
        updatePlayersSyncUi();
        return netGroupOffsetMs(next.staticMs, next.trimMs);
    } catch (err) {
        console.warn('adjust sync delay failed:', playerId, err);
        if (playerId === maClient.playerId) {
            updatePlayersSyncDelayLabels();
            return netGroupOffsetMs(next.staticMs, next.trimMs);
        }
        uiH('setStatus', 'sync delay adjust failed', 'error');
        return netGroupOffsetMs(currentStatic, currentTrim);
    }
}



async function resolveStereoPairIds(playerIds) {
    const entries = await Promise.all(playerIds.map(async (playerId) => ({
        playerId,
        channels: await readPlayerOutputChannels(playerId),
    })));
    const leftId = entries.find((e) => e.channels === 'left')?.playerId || playerIds[0];
    const rightId = entries.find((e) => e.channels === 'right')?.playerId || playerIds.find((id) => id !== leftId) || playerIds[1];
    return { leftId, rightId };
}



async function detectStereoPairGroup(group) {
    if (!group?.allIds?.length) return group;
    const channelEntries = await Promise.all(group.allIds.map(async (id) => ({
        id,
        channels: await readPlayerOutputChannels(id),
    })));
    const leftId = channelEntries.find((e) => e.channels === 'left')?.id || null;
    const rightId = channelEntries.find((e) => e.channels === 'right')?.id || null;
    if (!leftId || !rightId) return group;
    const isStereoWithLocalLeader = group.allIds.length > 2
        && group.leaderId !== leftId
        && group.leaderId !== rightId;
    return {
        ...group,
        isStereo: true,
        leftId,
        rightId,
        isStereoWithLocalLeader,
    };
}



async function enrichActiveGroupFromMa() {
    if (!state.playersActiveGroup) return;
    state.playersActiveGroup = await detectStereoPairGroup(state.playersActiveGroup);
    if (state.playersActiveGroup.isStereo && state.playersActiveGroup.leftId && state.playersActiveGroup.rightId) {
        state.playersSyncSelectedOrder = state.playersActiveGroup.isStereoWithLocalLeader
            ? [state.playersActiveGroup.leftId, state.playersActiveGroup.rightId]
            : [state.playersActiveGroup.leftId, state.playersActiveGroup.rightId];
    }
}



function filterMaPlayers(players) {
    return (Array.isArray(players) ? players : []).filter((p) => {
        if (!p?.player_id) return false;
        if (p.hidden) return false;
        if (p.enabled === false) return false;
        if (p.available === false) return false;
        if (p.type === 'protocol') return false;
        return true;
    });
}



function getPlayerActivityTier(player, activeGroupIds) {
    if (player.player_id === maClient.playerId) return 0;
    if (activeGroupIds?.has(player.player_id)) return 1;
    const state = player.playback_state || 'idle';
    if (state === 'playing') return 2;
    if (state === 'paused' && player.current_media) return 3;
    if (state === 'buffering') return 4;
    if (player.synced_to) return 5;
    if (player.current_media) return 6;
    if (state === 'paused') return 7;
    return 8;
}



function sortMaPlayers(players, activeGroupIds = null) {
    const groupSet = activeGroupIds instanceof Set
        ? activeGroupIds
        : new Set(Array.isArray(activeGroupIds) ? activeGroupIds : []);
    return [...players].sort((a, b) => {
        const aTier = getPlayerActivityTier(a, groupSet);
        const bTier = getPlayerActivityTier(b, groupSet);
        if (aTier !== bTier) return aTier - bTier;
        const aName = (a.display_name || a.name || a.player_id || '').toLowerCase();
        const bName = (b.display_name || b.name || b.player_id || '').toLowerCase();
        return aName.localeCompare(bName);
    });
}



function playerMaProviderIcon(provider) {
    if (!provider) return 'grid.svg';
    const dom = String(provider).split('--')[0].toLowerCase();
    const aliases = {
        sendspin: 'sendspin',
        sonos: 'sonos',
        chromecast: 'chromecast',
        airplay: 'airplay',
        snapcast: 'snapcast',
        squeezebox: 'squeezebox',
        universal: 'universal_group',
    };
    const mapped = aliases[dom] || dom;
    return `providers/${mapped}.svg`;
}



function playerStateLabel(player) {
    const state = player?.playback_state || 'idle';
    if (state === 'playing') return 'Playing';
    if (state === 'paused') return 'Paused';
    if (state === 'buffering') return 'Buffering';
    if (player?.synced_to) return 'Synced';
    if (player?.available === false) return 'Unavailable';
    return 'Idle';
}



function playerNowPlayingSubtitle(player) {
    const media = player?.current_media;
    if (!media?.title && !media?.name) return playerStateLabel(player);
    const queueItem = player.player_id === maClient.playerId
        ? maClient.activeQueue?.current_item
        : null;
    const stationMedia = queueItem?.media_item || media;
    if (isRadioMedia(stationMedia) || isRadioMedia(media)) {
        const np = uiH('resolveRadioNowPlaying', null, stationMedia, queueItem, media);
        if (np.hasTrackMeta) {
            if (np.subtitle) return `${np.title} · ${np.subtitle}`;
            return np.title || playerStateLabel(player);
        }
        return uiH('formatRadioStationFullLine', stationMedia) || playerStateLabel(player);
    }
    const artist = media.artist || media.album || '';
    return artist ? `${media.title} · ${artist}` : media.title;
}



function localQueueHasContent() {
    const q = maClient.activeQueue;
    if (!q) return false;
    if (q.current_item) return true;
    return (q.items ?? 0) > 0;
}



function playerHasActiveQueue(player) {
    if (!player) return false;
    return player.playback_state === 'playing'
        || player.current_media
        || (player.playback_state === 'paused' && player.current_media);
}



async function findQueueSourceAmongSelected(selectedIds, playersById, leaderId) {
    if (leaderId && playerHasActiveQueue(playersById.get(leaderId))) {
        return resolvePlayerQueueId(leaderId);
    }
    for (const id of selectedIds) {
        if (id === leaderId) continue;
        if (playerHasActiveQueue(playersById.get(id))) {
            return resolvePlayerQueueId(id);
        }
    }
    if (leaderId) {
        return resolvePlayerQueueId(leaderId);
    }
    if (localQueueHasContent() && maClient.queueId) return maClient.queueId;
    return null;
}



async function resolvePlayerQueueId(playerId) {
    const queue = await maClient.send('player_queues/get_active_queue', { player_id: playerId });
    return queue?.queue_id || playerId;
}



async function fetchMaPlayers(activeGroupIds = null) {
    await maClient.ensureReady();
    const players = await maClient.send('players/all', {});
    return sortMaPlayers(filterMaPlayers(players), activeGroupIds);
}



function buildSyncGroup(leaderId, memberIds, localInGroup, extras = {}) {
    const members = memberIds || [];
    const allIds = [leaderId, ...members.filter((id) => id !== leaderId)];
    if (localInGroup && maClient.playerId && !allIds.includes(maClient.playerId)) {
        allIds.push(maClient.playerId);
    }
    return {
        leaderId,
        memberIds: members,
        allIds,
        localInGroup: !!localInGroup,
        isStereo: !!extras.isStereo,
        leftId: extras.leftId || null,
        rightId: extras.rightId || null,
    };
}



function resolveSyncGroups(players) {
    const byId = new Map(players.map((p) => [p.player_id, p]));
    let localGroup = null;
    for (const p of players) {
        const members = p.group_members || [];
        if (!members.length) continue;
        const allIds = [p.player_id, ...members];
        if (allIds.includes(maClient.playerId)) {
            localGroup = buildSyncGroup(p.player_id, members, true);
            break;
        }
    }
    if (!localGroup) {
        const local = byId.get(maClient.playerId);
        if (local?.synced_to) {
            const leader = byId.get(local.synced_to);
            const members = leader?.group_members || [];
            localGroup = buildSyncGroup(local.synced_to, members, true);
        }
    }
    let remoteGroup = null;
    for (const p of players) {
        const members = p.group_members || [];
        if (!members.length) continue;
        const allIds = [p.player_id, ...members];
        if (localGroup && allIds.includes(maClient.playerId)) continue;
        if (!allIds.includes(maClient.playerId)) {
            remoteGroup = buildSyncGroup(p.player_id, members, false);
            break;
        }
    }
    return { localGroup, remoteGroup };
}



function refreshPlayersSyncSelectionFromMa(players) {
    const { localGroup, remoteGroup } = resolveSyncGroups(players);
    state.playersActiveGroup = localGroup;
    state.playersRemoteGroup = remoteGroup;
    applyLocalGroupCorrectionMode();
    refreshGroupOffsetPollState();
    state.playersSyncSelected.clear();
    state.playersSyncSelectedOrder = [];
    if (localGroup) {
        localGroup.allIds.forEach((id) => state.playersSyncSelected.add(id));
        state.playersSyncSelectedOrder = [...localGroup.allIds];
    }
}



function playerDisplayName(playerId) {
    const p = state.playersListCache.find((x) => x.player_id === playerId);
    return p?.display_name || p?.name || playerId;
}



function toTitleCaseWords(text) {
    return String(text || '').trim().split(/\s+/).filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}



function formatPlayerNamesTitle(playerIds) {
    return playerIds.map((id) => toTitleCaseWords(playerDisplayName(id))).join(' · ');
}



function formatActiveGroupModeLabel(group) {
    if (group?.isStereoWithLocalLeader) return 'Stereo · Lead Here';
    if (group?.isStereo) return 'Stereo Pair';
    return 'Synced';
}



function shouldHideStereoPairMembers() {
    if (!isLocalDeviceSyncLeader()) return false;
    const group = state.playersActiveGroup;
    return !!(group?.isStereo && group.leftId && group.rightId
        && group.allIds.includes(group.leftId)
        && group.allIds.includes(group.rightId)
        && !state.playersStereoPairExpanded);
}



function shouldShowStereoPairHeader() {
    const group = state.playersActiveGroup;
    return !!(group?.isStereo && group.leftId && group.rightId
        && group.allIds.includes(group.leftId)
        && group.allIds.includes(group.rightId));
}



function areStereoPairDelaysSynced(group = state.playersActiveGroup) {
    if (!group?.leftId || !group?.rightId) return true;
    const leftNet = getCachedPlayerNetOffset(group.leftId);
    const rightNet = getCachedPlayerNetOffset(group.rightId);
    if (state.playerSyncDelayCache.get(group.leftId) === undefined
        || state.playerSyncDelayCache.get(group.rightId) === undefined) {
        return true;
    }
    return leftNet === rightNet;
}



async function getStereoPairPlaybackOffsets() {
    const { leftId, rightId } = state.playersActiveGroup || {};
    if (!leftId || !rightId) return { staticMs: 0, trimMs: 0, netMs: 0 };
    if (state.playerSyncDelayCache.has(leftId) && state.playerGroupTrimCache.has(leftId)) {
        const staticMs = state.playerSyncDelayCache.get(leftId) ?? 0;
        const trimMs = state.playerGroupTrimCache.get(leftId) ?? 0;
        return { staticMs, trimMs, netMs: netGroupOffsetMs(staticMs, trimMs) };
    }
    return readPlayerPlaybackOffsets(leftId);
}



async function adjustStereoPairSyncDelay(deltaMs) {
    if (!isLocalDeviceSyncLeader()) return;
    const { leftId, rightId } = state.playersActiveGroup || {};
    if (!leftId || !rightId) return;
    const current = await getStereoPairPlaybackOffsets();
    const next = applyGroupOffsetDelta(current.staticMs, current.trimMs, deltaMs);
    try {
        await Promise.all([leftId, rightId].map((playerId) => (
            savePlayerPlaybackOffsets(playerId, next.staticMs, next.trimMs)
        )));
        const names = formatPlayerNamesTitle([leftId, rightId]);
        uiH('setStatus', `Stereo Pair · ${formatNetOffsetLabel(next.staticMs, next.trimMs)}`, 'connected');
        updatePlayersSyncDelayLabels();
        updatePlayersSyncUi();
    } catch (err) {
        console.warn('adjust stereo pair sync delay failed:', err);
        uiH('setStatus', 'sync delay adjust failed', 'error');
    }
}



function getAnyMaSyncGroup() {
    return state.playersActiveGroup || state.playersRemoteGroup;
}



function canLeaveActiveSyncGroup() {
    const group = state.playersActiveGroup;
    const localId = maClient.playerId;
    if (!group || !localId) return false;
    if (!group.allIds.includes(localId) || localId === group.leaderId) return false;
    const local = state.playersListCache.find((p) => p.player_id === localId);
    return !!local?.synced_to;
}



function shouldShowPlayersRowMenu(wrap) {
    // The device menu is always available (reload provider applies to any
    // device). Take-over and remove are gated per-action in
    // getPlayersRowMenuActions(). Stereo-pair member sub-rows are excluded.
    if (wrap.classList.contains('stereo-pair-member')) return false;
    if (wrap.classList.contains('stereo-pair-group')) return true;
    return !!wrap.dataset.playerId;
}



function getVisiblePlayersActionButtons() {
    if (state.playersActiveGroup) {
        const buttons = [];
        if (activeGroupHasManualSyncOffsets(state.playersActiveGroup)) buttons.push(playersResetOffsetsBtn);
        else buttons.push(playersRefreshBtn);
        if (canLeaveActiveSyncGroup()) buttons.push(playersLeaveBtn);
        buttons.push(playersSplitBtn);
        return buttons.filter((b) => b && !b.hidden);
    }
    if (state.playersRemoteGroup) {
        return [playersJoinBtn, playersSplitBtn].filter((b) => b && !b.hidden);
    }
    if (state.playersSyncSelected.size >= 2) {
        const buttons = [playersSyncBtn];
        if (state.playersSyncSelected.size === 2) {
            buttons.push(playersStereoBtn);
            if (canFormStereoWithLocalLeader(
                getPlayersSyncSelectedOrder(),
                new Map(state.playersListCache.map((p) => [p.player_id, p])),
            )) {
                buttons.push(playersStereoLeadBtn);
            }
        }
        return buttons.filter((b) => b && !b.hidden);
    }
    return [];
}



function activatePlayersAction() {
    const btn = getVisiblePlayersActionButtons()[state.playersActionFocusIndex];
    if (!btn) return;
    if (btn === playersRefreshBtn) void refreshActiveSyncGroup();
    else if (btn === playersResetOffsetsBtn) void resetActiveGroupOffsets();
    else if (btn === playersLeaveBtn) void leaveActiveSyncGroup();
    else if (btn === playersSplitBtn) void splitActiveSyncGroup();
    else if (btn === playersJoinBtn) void joinRemoteSyncGroup();
    else if (btn === playersStereoBtn) void stereoPairSelectedPlayers();
    else if (btn === playersStereoLeadBtn) void stereoPairWithLocalLeader();
    else if (btn === playersSyncBtn) void syncSelectedPlayers();
}



function updatePlayersSyncUi() {
    const count = state.playersSyncSelected.size;
    const playersById = new Map(state.playersListCache.map((p) => [p.player_id, p]));
    const stereoOrder = getPlayersSyncSelectedOrder();
    playersSyncBtn.hidden = true;
    playersStereoBtn.hidden = true;
    playersStereoLeadBtn.hidden = true;
    playersJoinBtn.hidden = true;
    playersRefreshBtn.hidden = true;
    playersResetOffsetsBtn.hidden = true;
    playersLeaveBtn.hidden = true;
    playersSplitBtn.hidden = true;
    if (state.playersActiveGroup) {
        const names = formatPlayerNamesTitle(state.playersActiveGroup.allIds);
        const modeLabel = formatActiveGroupModeLabel(state.playersActiveGroup);
        const playersById = new Map(state.playersListCache.map((p) => [p.player_id, p]));
        const membershipWarn = getActiveGroupMembershipWarning(state.playersActiveGroup, playersById);
        playersPanelHint.textContent = membershipWarn
            ? `${names} · ${modeLabel} · ${membershipWarn}`
            : `${names} · ${modeLabel}`;
        const hasManualOffsets = activeGroupHasManualSyncOffsets(state.playersActiveGroup);
        playersRefreshBtn.hidden = hasManualOffsets;
        playersResetOffsetsBtn.hidden = !hasManualOffsets;
        playersLeaveBtn.hidden = !canLeaveActiveSyncGroup();
        playersSplitBtn.hidden = false;
        playersRefreshBtn.disabled = state.playersLoading;
        playersResetOffsetsBtn.disabled = state.playersLoading;
        playersLeaveBtn.disabled = state.playersLoading;
        playersSplitBtn.disabled = state.playersLoading;
        playersSyncActions.setAttribute('aria-hidden', 'false');
        state.playersActionFocusIndex = Math.min(
            state.playersActionFocusIndex,
            Math.max(0, getVisiblePlayersActionButtons().length - 1),
        );
        return;
    }
    if (state.playersRemoteGroup) {
        const names = formatPlayerNamesTitle(state.playersRemoteGroup.allIds);
        playersPanelHint.textContent = `${names} · Synced — Join to add this device`;
        playersJoinBtn.hidden = false;
        playersSplitBtn.hidden = false;
        const local = state.playersListCache.find((p) => p.player_id === maClient.playerId);
        playersJoinBtn.disabled = state.playersLoading
            || !maPlayerSupportsSync(local)
            || local?.available === false;
        playersSplitBtn.disabled = state.playersLoading;
        playersSyncActions.setAttribute('aria-hidden', 'false');
        state.playersActionFocusIndex = Math.min(
            state.playersActionFocusIndex,
            Math.max(0, getVisiblePlayersActionButtons().length - 1),
        );
        return;
    }
    const stereoLeadOk = count === 2 && canFormStereoWithLocalLeader(stereoOrder, playersById);
    playersPanelHint.textContent = count === 2
        ? (stereoLeadOk
            ? 'Tap to transfer queue · Check 2 speakers (1st=L, 2nd=R) · Stereo + Lead Here keeps playback on this device'
            : 'Tap a player to transfer queue · Check 2 for sync or stereo (1st = leader / L, 2nd = R)')
        : 'Tap a player to transfer queue · Check players to sync (1st checked = leader)';
    playersSyncBtn.hidden = false;
    if (playersSyncLabel) {
        playersSyncLabel.textContent = count > 0 ? `Sync selected (${count})` : 'Sync selected';
    }
    playersSyncBtn.disabled = count < 2 || state.playersLoading;
    if (count === 2) {
        playersStereoBtn.hidden = false;
        playersStereoBtn.disabled = state.playersLoading || !canFormStereoPair(stereoOrder, playersById);
        playersStereoLeadBtn.hidden = !stereoLeadOk;
        playersStereoLeadBtn.disabled = state.playersLoading || !stereoLeadOk;
    }
    playersSyncActions.setAttribute('aria-hidden', count >= 2 ? 'false' : 'true');
    state.playersActionFocusIndex = Math.min(
        state.playersActionFocusIndex,
        Math.max(0, getVisiblePlayersActionButtons().length - 1),
    );
    syncAllAndroidChipSections();
}



function togglePlayerSyncSelection(playerId, enabled = true) {
    if (state.playersActiveGroup) {
        state.playersActiveGroup = null;
        state.playersRemoteGroup = null;
    }
    if (!enabled) {
        state.playersSyncSelected.delete(playerId);
        state.playersSyncSelectedOrder = state.playersSyncSelectedOrder.filter((id) => id !== playerId);
    } else if (state.playersSyncSelected.has(playerId)) {
        state.playersSyncSelected.delete(playerId);
        state.playersSyncSelectedOrder = state.playersSyncSelectedOrder.filter((id) => id !== playerId);
    } else {
        state.playersSyncSelected.add(playerId);
        state.playersSyncSelectedOrder.push(playerId);
    }
    updatePlayersSyncUi();
    renderPlayersPanel();
}



function appendPlayersRowSubTargets(targets, row) {
    const minus = row.querySelector('.player-sync-delay-minus');
    const plus = row.querySelector('.player-sync-delay-plus');
    const menu = row.querySelector('[data-sub="menu"]');
    if (minus) targets.push(minus);
    if (plus) targets.push(plus);
    if (menu) targets.push(menu);
}



function getActiveGroupMembershipWarning(group, playersById) {
    if (!group?.allIds?.length) return null;
    const missing = group.allIds.filter((id) => !isPlayerInSyncGroup(id, group, playersById));
    if (missing.length) {
        const names = missing.map((id) => playerDisplayName(id)).join(', ');
        return `Not in group: ${names} — refresh sync or re-add`;
    }
    const unavailable = group.allIds.filter((id) => playersById.get(id)?.available === false);
    if (unavailable.length) {
        const names = unavailable.map((id) => playerDisplayName(id)).join(', ');
        return `Unavailable: ${names}`;
    }
    return null;
}



function getPlayersListRows() {
    return Array.from(playersList.querySelectorAll('.panel-row-wrap'));
}



function getPlayersRowSubTargets(row) {
    if (!row) return [];
    if (row.classList.contains('stereo-pair-group')) {
        const targets = [row.querySelector('.panel-row-main')].filter(Boolean);
        appendPlayersRowSubTargets(targets, row);
        return targets;
    }
    const targets = [row.querySelector('.player-sync-check')].filter(Boolean);
    const main = row.querySelector('.panel-row-main');
    if (main) targets.push(main);
    appendPlayersRowSubTargets(targets, row);
    return targets;
}



function movePlayersRowSubFocus(delta) {
    const row = getPlayersListRows()[state.panelFocusIndex];
    if (!row) return false;
    state.playersRowSubFocus = Math.max(
        0,
        Math.min(state.playersRowSubFocus + delta, getPlayersRowSubFocusMax(row)),
    );
    uiH('updatePanelFocus');
    return true;
}



function toggleStereoPairExpanded(displayIndex) {
    state.panelFocusIndex = displayIndex;
    state.playersRowSubFocus = 0;
    state.playersStereoPairExpanded = !state.playersStereoPairExpanded;
    renderPlayersPanel();
    uiH('updatePanelFocus');
}



function getPlayersRowSubFocusMax(row) {
    return Math.max(0, getPlayersRowSubTargets(row).length - 1);
}



function schedulePlayersPanelRefresh() {
    clearTimeout(state.playersRefreshTimer);
    state.playersRefreshTimer = setTimeout(() => {
        if (!state.playersPanelOpen) return;
        if (syncDelayAdjustLocks.size > 0) {
            schedulePlayersPanelRefresh();
            return;
        }
        void loadPlayersList(true);
    }, 450);
}



function playersPanelDisplayFingerprint() {
    const group = state.playersActiveGroup;
    return JSON.stringify({
        players: state.playersListCache.map((p) => [
            p.player_id,
            p.playback_state,
            p.display_name || p.name,
            playerNowPlayingSubtitle(p),
            p.available,
            p.synced_to,
            (p.group_members || []).length,
        ]),
        syncSel: [...state.playersSyncSelected].sort(),
        group: group
            ? {
                isStereo: group.isStereo,
                allIds: group.allIds,
                leftId: group.leftId,
                rightId: group.rightId,
            }
            : null,
        stereoExpanded: state.playersStereoPairExpanded,
        hideMembers: shouldHideStereoPairMembers(),
        showHeader: shouldShowStereoPairHeader(),
    });
}



function updatePlayersPanelInPlace() {
    let missingRow = false;
    for (const player of state.playersListCache) {
        const wrap = playersList.querySelector(`.panel-row-wrap[data-player-id="${CSS.escape(player.player_id)}"]`);
        if (!wrap) {
            missingRow = true;
            break;
        }
        wrap.classList.toggle('playing', player.playback_state === 'playing');
        const subtitle = wrap.querySelector('.panel-row-subtitle');
        if (subtitle) subtitle.textContent = playerNowPlayingSubtitle(player);
    }
    if (missingRow) {
        renderPlayersPanel();
        return;
    }
    updatePlayersSyncDelayLabels();
    updateStereoPairDelaySubtitle();
    uiH('updatePanelFocus');
}



function patchPlayersListFromMaEvent(player) {
    if (!player?.player_id) return false;
    const idx = state.playersListCache.findIndex((p) => p.player_id === player.player_id);
    if (idx >= 0) {
        state.playersListCache[idx] = { ...state.playersListCache[idx], ...player };
    } else {
        state.playersListCache.push(player);
        return false;
    }
    if (!state.playersPanelOpen) return true;
    const prevKey = state.playersPanelRenderKey;
    const nextKey = playersPanelDisplayFingerprint();
    state.playersPanelRenderKey = nextKey;
    if (prevKey === nextKey) updatePlayersPanelInPlace();
    else renderPlayersPanel();
    return true;
}



async function loadPlayersList(silent = false) {
    if (!state.playersPanelOpen) return;
    if (!silent) state.playersLoading = true;
    try {
        state.playersListCache = await fetchMaPlayers();
        refreshPlayersSyncSelectionFromMa(state.playersListCache);
        await enrichActiveGroupFromMa();
        if (state.playersActiveGroup?.allIds?.length) {
            await loadGroupSyncDelays(state.playersActiveGroup.allIds);
        }
        const boostIds = state.playersActiveGroup?.allIds || state.playersRemoteGroup?.allIds || [];
        state.playersListCache = sortMaPlayers(state.playersListCache, boostIds);
        const nextKey = playersPanelDisplayFingerprint();
        const prevKey = state.playersPanelRenderKey;
        state.playersPanelRenderKey = nextKey;
        if (silent && prevKey === nextKey) updatePlayersPanelInPlace();
        else renderPlayersPanel();
        void refreshLocalPlaybackSyncProfile();
    } catch (err) {
        console.warn('load players failed:', err);
        if (!silent) uiH('setStatus', 'could not load players', 'error');
    } finally {
        state.playersLoading = false;
        updatePlayersSyncUi();
    }
}



function appendPlayerSyncDelayBar(wrap, playerId, onAdjust) {
    const isLeader = isGroupSyncLeader(playerId);
    const canAdjust = canAdjustPlayerSyncDelay(playerId);
    const delayBar = document.createElement('div');
    delayBar.className = 'player-sync-delay-bar';
    if (isLeader) delayBar.classList.add('player-sync-delay-anchor');
    const minusBtn = document.createElement('button');
    minusBtn.type = 'button';
    minusBtn.className = 'player-sync-delay-btn player-sync-delay-minus';
    minusBtn.tabIndex = -1;
    minusBtn.disabled = !canAdjust;
    minusBtn.setAttribute('aria-label', `Play ${SYNC_DELAY_STEP_MS} ms earlier (catch up)`);
    minusBtn.textContent = '−';
    minusBtn.title = canAdjust ? 'Behind (−)' : 'Leader anchor';
    minusBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!canAdjust) return;
        void onAdjust(-SYNC_DELAY_STEP_MS);
    });
    const delayLabel = document.createElement('span');
    delayLabel.className = 'player-sync-delay-label';
    delayLabel.textContent = formatPlayerOffsetLabel(playerId);
    void readPlayerPlaybackOffsets(playerId).then(() => {
        delayLabel.textContent = formatPlayerOffsetLabel(playerId);
    });
    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.className = 'player-sync-delay-btn player-sync-delay-plus';
    plusBtn.tabIndex = -1;
    plusBtn.disabled = !canAdjust;
    plusBtn.setAttribute('aria-label', `Play ${SYNC_DELAY_STEP_MS} ms later (delay)`);
    plusBtn.textContent = '+';
    plusBtn.title = canAdjust ? 'Ahead (+)' : 'Leader anchor';
    plusBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!canAdjust) return;
        void onAdjust(SYNC_DELAY_STEP_MS);
    });
    delayBar.appendChild(minusBtn);
    delayBar.appendChild(delayLabel);
    delayBar.appendChild(plusBtn);
    wrap.appendChild(delayBar);
}



function appendPlayersRowMenuAction(wrap) {
    const actions = document.createElement('div');
    actions.className = 'panel-row-actions';
    const menuAction = document.createElement('button');
    menuAction.type = 'button';
    menuAction.className = 'panel-row-action';
    menuAction.dataset.sub = 'menu';
    menuAction.tabIndex = -1;
    menuAction.setAttribute('aria-label', 'Player group actions');
    menuAction.innerHTML = '<img src="icons/info.svg" alt="">';
    menuAction.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (Date.now() < uiH('getIgnoreClickUntil')) return;
        const rowIndex = Number(wrap.dataset.index);
        if (!Number.isNaN(rowIndex)) {
            state.panelFocusIndex = rowIndex;
            state.playersRowSubFocus = getPlayersRowSubTargets(wrap).length - 1;
            openPlayersRowMenu(rowIndex);
        }
    });
    actions.appendChild(menuAction);
    wrap.appendChild(actions);
}



function renderPlayersPanel() {
    const preserveScroll = !uiH('panelKeyboardFocusActive');
    const savedScrollTop = playersList.scrollTop;
    playersList.textContent = '';
    if (!state.playersListCache.length) {
        const empty = document.createElement('div');
        empty.className = 'panel-divider panel-status';
        if (state.playersLoading) uiH('setPanelStatusText', empty, 'Loading players');
        else empty.textContent = 'No players found';
        playersList.appendChild(empty);
        return;
    }

    const hideStereoMembers = shouldHideStereoPairMembers();
    const showStereoHeader = shouldShowStereoPairHeader();
    const group = state.playersActiveGroup;
    let stereoGroupInserted = false;
    const displayItems = [];

    state.playersListCache.forEach((player, index) => {
        const id = player.player_id;
        const isLeft = group?.leftId === id;
        const isRight = group?.rightId === id;
        const isStereoMember = isLeft || isRight;
        if (showStereoHeader && isStereoMember && !stereoGroupInserted) {
            displayItems.push({ kind: 'stereo-group', index });
            stereoGroupInserted = true;
        }
        if (hideStereoMembers && isStereoMember) return;
        displayItems.push({
            kind: 'player',
            player,
            index,
            stereoMember: !!(group?.isStereo && state.playersStereoPairExpanded && isStereoMember),
        });
    });

    displayItems.forEach((item, displayIndex) => {
        if (item.kind === 'stereo-group') {
            const wrap = document.createElement('div');
            wrap.className = 'panel-row-wrap stereo-pair-group in-sync-group'
                + (state.playersStereoPairExpanded ? ' expanded' : ' collapsed');
            wrap.dataset.index = String(displayIndex);
            wrap.dataset.stereoPair = 'true';

            const main = document.createElement('button');
            main.type = 'button';
            main.className = 'panel-row-main';
            main.setAttribute('aria-label', state.playersStereoPairExpanded ? 'Collapse stereo pair' : 'Expand stereo pair');
            const chevron = document.createElement('img');
            chevron.className = 'player-stereo-pair-chevron';
            chevron.src = 'icons/back.svg';
            chevron.alt = '';
            const icon = document.createElement('img');
            icon.className = 'panel-row-icon';
            icon.src = 'icons/stereo-pair.svg';
            icon.alt = '';
            const text = document.createElement('span');
            text.className = 'panel-row-text';
            const title = document.createElement('span');
            title.className = 'panel-row-title';
            title.textContent = 'Stereo Pair';
            const subtitle = document.createElement('span');
            subtitle.className = 'panel-row-subtitle';
            const pairNames = formatPlayerNamesTitle([group.leftId, group.rightId]);
            const offsetsSplit = !state.playersStereoPairExpanded && !areStereoPairDelaysSynced(group);
            subtitle.textContent = offsetsSplit
                ? `${pairNames} · Offsets differ`
                : pairNames;
            text.appendChild(title);
            text.appendChild(subtitle);
            main.appendChild(chevron);
            main.appendChild(icon);
            main.appendChild(text);
            main.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (Date.now() < uiH('getIgnoreClickUntil')) return;
                toggleStereoPairExpanded(displayIndex);
            });

            wrap.appendChild(main);
            const showPairDelay = isLocalDeviceSyncLeader()
                && !state.playersStereoPairExpanded
                && areStereoPairDelaysSynced(group);
            if (showPairDelay) {
                appendPlayerSyncDelayBar(wrap, group.leftId, (delta) => adjustStereoPairSyncDelay(delta));
                const delayLabel = wrap.querySelector('.player-sync-delay-label');
                if (delayLabel) {
                    delayLabel.textContent = formatPlayerOffsetLabel(group.leftId);
                    void getStereoPairPlaybackOffsets().then(() => {
                        delayLabel.textContent = formatPlayerOffsetLabel(group.leftId);
                    });
                }
            }
            if (shouldShowPlayersRowMenu(wrap)) appendPlayersRowMenuAction(wrap);
            playersList.appendChild(wrap);
            return;
        }

        const player = item.player;
        const index = item.index;
        const isLocal = player.player_id === maClient.playerId;
        const canSync = maPlayerSupportsSync(player) && player.available !== false;
        const isChecked = state.playersSyncSelected.has(player.player_id);
        const stereoOrder = getPlayersSyncSelectedOrder();
        const stereoIndex = stereoOrder.indexOf(player.player_id);
        const isStereoLeft = state.playersActiveGroup?.isStereo && player.player_id === state.playersActiveGroup.leftId;
        const isStereoRight = state.playersActiveGroup?.isStereo && player.player_id === state.playersActiveGroup.rightId;
        const showStereoLabels = (state.playersActiveGroup?.isStereo && (isStereoLeft || isStereoRight))
            || (!state.playersActiveGroup && isChecked && stereoOrder.length === 2);
        const highlightGroup = state.playersActiveGroup || state.playersRemoteGroup;
        const inActiveGroup = highlightGroup?.allIds.includes(player.player_id);
        const wrap = document.createElement('div');
        wrap.className = 'panel-row-wrap';
        wrap.dataset.index = String(displayIndex);
        wrap.dataset.playerId = player.player_id;
        if (item.stereoMember) wrap.classList.add('stereo-pair-member');
        if (isLocal) wrap.classList.add('this-device');
        if (inActiveGroup) wrap.classList.add('in-sync-group');
        if (player.playback_state === 'playing') wrap.classList.add('playing');

        const syncBtn = document.createElement('button');
        syncBtn.type = 'button';
        syncBtn.className = 'player-sync-check';
        syncBtn.tabIndex = -1;
        syncBtn.setAttribute('aria-label', isChecked ? 'Selected for sync' : 'Select for sync');
        syncBtn.classList.toggle('selected', isChecked);
        syncBtn.classList.toggle('stereo-left', showStereoLabels && (stereoIndex === 0 || isStereoLeft));
        syncBtn.classList.toggle('stereo-right', showStereoLabels && (stereoIndex === 1 || isStereoRight));
        syncBtn.disabled = !canSync;
        const syncBox = document.createElement('span');
        syncBox.className = 'player-sync-box';
        if (showStereoLabels && (stereoIndex === 0 || isStereoLeft)) syncBox.textContent = 'L';
        else if (showStereoLabels && (stereoIndex === 1 || isStereoRight)) syncBox.textContent = 'R';
        else syncBox.textContent = isChecked ? '✓' : '';
        syncBtn.appendChild(syncBox);
        syncBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (Date.now() < uiH('getIgnoreClickUntil')) return;
            state.panelFocusIndex = displayIndex;
            state.playersRowSubFocus = 0;
            togglePlayerSyncSelection(player.player_id, canSync);
            uiH('updatePanelFocus');
        });

        const main = document.createElement('button');
        main.type = 'button';
        main.className = 'panel-row-main';
        main.tabIndex = -1;
        const icon = document.createElement('img');
        icon.className = 'panel-row-icon';
        icon.src = `icons/${playerMaProviderIcon(player.provider)}`;
        icon.alt = '';
        const text = document.createElement('span');
        text.className = 'panel-row-text';
        const title = document.createElement('span');
        title.className = 'panel-row-title';
        const name = toTitleCaseWords(player.display_name || player.name || player.player_id);
        title.textContent = name;
        if (isLocal) {
            const badge = document.createElement('span');
            badge.className = 'player-device-badge';
            badge.textContent = 'This device';
            title.appendChild(badge);
        }
        const subtitle = document.createElement('span');
        subtitle.className = 'panel-row-subtitle';
        subtitle.textContent = playerNowPlayingSubtitle(player);
        text.appendChild(title);
        text.appendChild(subtitle);
        main.appendChild(icon);
        main.appendChild(text);
        main.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (Date.now() < uiH('getIgnoreClickUntil')) return;
            state.panelFocusIndex = displayIndex;
            const row = getPlayersListRows()[displayIndex];
            const targets = getPlayersRowSubTargets(row);
            const mainIdx = targets.findIndex((el) => el?.classList?.contains('panel-row-main'));
            state.playersRowSubFocus = mainIdx >= 0 ? mainIdx : 0;
            void transferQueueToPlayer(player.player_id);
        });

        wrap.appendChild(syncBtn);
        wrap.appendChild(main);
        if (inActiveGroup && state.playersActiveGroup && canAdjustPlayerSyncDelay(player.player_id)) {
            appendPlayerSyncDelayBar(wrap, player.player_id, (delta) => adjustPlayerSyncDelay(player.player_id, delta));
        }
        if (shouldShowPlayersRowMenu(wrap)) appendPlayersRowMenuAction(wrap);
        playersList.appendChild(wrap);
    });
    const rows = getPlayersListRows();
    state.panelFocusIndex = Math.max(0, Math.min(state.panelFocusIndex, Math.max(0, rows.length - 1)));
    uiH('updatePanelFocus');
    if (preserveScroll) playersList.scrollTop = savedScrollTop;
}



async function transferQueueToPlayer(targetPlayerId) {
    if (!targetPlayerId || targetPlayerId === maClient.playerId) return;
    const playerName = getDefaultPlayerName();
    try {
        await maClient.ensureReady();
        if (!localQueueHasContent()) {
            uiH('setStatus', 'nothing to transfer', 'error');
            setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
            return;
        }
        const sourceQueueId = maClient.queueId || await resolvePlayerQueueId(maClient.playerId);
        const targetQueueId = await resolvePlayerQueueId(targetPlayerId);
        if (!sourceQueueId || !targetQueueId) throw new Error('queue unavailable');
        uiH('setStatus', 'transferring queue…', '');
        await maClient.send('player_queues/transfer', {
            source_queue_id: sourceQueueId,
            target_queue_id: targetQueueId,
            auto_play: true,
        });
        await maClient.refreshActiveQueue();
        if (state.queuePanelOpen) loadQueueItems(true);
        requestNowPlayingVisuals('transfer', { force: true });
        const target = state.playersListCache.find((p) => p.player_id === targetPlayerId);
        const targetName = target?.display_name || target?.name || 'player';
        uiH('setStatus', `queue transferred to ${targetName}`, 'connected');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
        void loadPlayersList(true);
    } catch (err) {
        console.warn('transfer queue failed:', err);
        uiH('setStatus', 'transfer failed', 'error');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
    }
}



async function reloadPlayerProvider(playerId) {
    const player = state.playersListCache.find((p) => p.player_id === playerId);
    const instanceId = player?.provider;
    const playerName = getDefaultPlayerName();
    if (!instanceId) {
        uiH('setStatus', 'provider unknown', 'error');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
        return;
    }
    try {
        await maClient.ensureReady();
        uiH('setStatus', 'reloading provider…', '');
        await maClient.send('config/providers/reload', { instance_id: instanceId });
        uiH('setStatus', 'provider reloaded', 'connected');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
        void loadPlayersList(true);
    } catch (err) {
        console.warn('reload provider failed:', err);
        uiH('setStatus', 'reload failed — admin role required?', 'error');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
    }
}



async function takeOverFromPlayer(sourcePlayerId) {
    if (!sourcePlayerId || sourcePlayerId === maClient.playerId) return;
    const playerName = getDefaultPlayerName();
    try {
        await maClient.ensureReady();
        const sourceQueueId = await resolvePlayerQueueId(sourcePlayerId);
        const targetQueueId = maClient.queueId || await resolvePlayerQueueId(maClient.playerId);
        if (!sourceQueueId || !targetQueueId) throw new Error('queue unavailable');
        uiH('setStatus', 'taking over queue…', '');
        await maClient.send('player_queues/transfer', {
            source_queue_id: sourceQueueId,
            target_queue_id: targetQueueId,
            auto_play: true,
        });
        await maClient.refreshActiveQueue();
        if (state.queuePanelOpen) loadQueueItems(true);
        requestNowPlayingVisuals('takeover', { force: true });
        const source = state.playersListCache.find((p) => p.player_id === sourcePlayerId);
        const sourceName = source?.display_name || source?.name || 'player';
        uiH('setStatus', `took over from ${sourceName}`, 'connected');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
        void loadPlayersList(true);
    } catch (err) {
        console.warn('take over failed:', err);
        uiH('setStatus', 'take over failed', 'error');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
    }
}



async function takeOverAndLeadFromPlayer(sourcePlayerId) {
    const localId = maClient.playerId;
    if (!sourcePlayerId || !localId || sourcePlayerId === localId) return;
    const playerName = getDefaultPlayerName();
    try {
        await maClient.ensureReady();
        state.playersLoading = true;
        updatePlayersSyncUi();
        const players = await fetchMaPlayers();
        const byId = new Map(players.map((p) => [p.player_id, p]));
        const local = byId.get(localId);
        const source = byId.get(sourcePlayerId);
        if (!local || !source) throw new Error('player unavailable');
        if (!maPlayerSupportsSync(local) || local.synced_to) {
            uiH('setStatus', 'this device can\u2019t lead a sync group', 'error');
            setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
            return;
        }
        if (!maPlayerSupportsSync(source)) throw new Error('source cannot sync');
        const sourceQueueId = await resolvePlayerQueueId(sourcePlayerId);
        const leaderQueueId = maClient.queueId || await resolvePlayerQueueId(localId);
        if (!sourceQueueId || !leaderQueueId) throw new Error('queue unavailable');
        let queueTransferred = false;
        if (sourceQueueId !== leaderQueueId) {
            uiH('setStatus', 'taking over queue…', '');
            await maClient.send('player_queues/transfer', {
                source_queue_id: sourceQueueId,
                target_queue_id: leaderQueueId,
                auto_play: true,
            });
            queueTransferred = true;
        }
        uiH('setStatus', 'syncing players…', '');
        await resetPlayersOutputChannels([localId, sourcePlayerId]);
        if (playerNeedsSequentialCastJoin(sourcePlayerId, byId)) {
            await addSyncGroupMembersSequential(localId, [sourcePlayerId], byId);
        } else {
            await maClient.send('players/cmd/set_members', {
                target_player: localId,
                player_ids_to_add: [sourcePlayerId],
            });
            await waitForMemberSyncedToLeader(localId, sourcePlayerId, { maxAttempts: 15 });
        }
        await finalizeSyncGroupPlayback(localId, { queueTransferred });
        await maClient.refreshActiveQueue();
        if (state.queuePanelOpen) loadQueueItems(true);
        uiH('scheduleLocalPlayerVisualCatchup', 'sync');
        requestNowPlayingVisuals('takeover', { force: true });
        const sourceName = source.display_name || source.name || 'player';
        uiH('setStatus', `took over + leading ${sourceName}`, 'connected');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
        void loadPlayersList(true);
    } catch (err) {
        console.warn('take over + lead failed:', err);
        uiH('setStatus', 'take over + lead failed', 'error');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
    } finally {
        state.playersLoading = false;
        updatePlayersSyncUi();
    }
}



async function resetActiveGroupOffsets() {
    const group = state.playersActiveGroup;
    if (!group?.allIds?.length) return;
    const playerName = getDefaultPlayerName();
    try {
        await maClient.ensureReady();
        state.playersLoading = true;
        updatePlayersSyncUi();
        uiH('setStatus', 'resetting offsets…', '');
        invalidatePlayerSyncDelayCache(group.allIds);
        await clearPlayersSyncDelays(group.allIds);
        if (maClient.playerId && group.allIds.includes(maClient.playerId)) {
            triggerLocalSendspinPlaybackResync();
        }
        uiH('setStatus', 'offsets reset', 'connected');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
    } catch (err) {
        console.warn('reset offsets failed:', err);
        uiH('setStatus', 'reset offsets failed', 'error');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
    } finally {
        state.playersLoading = false;
        void loadPlayersList(true);
    }
}



function pickSyncLeader(selectedIds, playersById) {
    const supports = (id) => maPlayerSupportsSync(playersById.get(id));
    const eligible = (id) => isEligibleSyncLeader(id, playersById);
    const first = selectedIds[0];
    if (first && eligible(first)) {
        const members = selectedIds.filter((id) => id !== first);
        if (playersCanSyncTogether(first, members, playersById)) return first;
    }
    for (const id of selectedIds) {
        if (!eligible(id)) continue;
        const members = selectedIds.filter((x) => x !== id);
        if (playersCanSyncTogether(id, members, playersById)) return id;
    }
    return selectedIds.find(eligible) || selectedIds.find(supports) || null;
}



function computeMaQueueElapsedSec(queue) {
    if (!queue || queue.elapsed_time == null) return null;
    let elapsed = Number(queue.elapsed_time);
    if (queue.state === 'playing') {
        const lastUp = queue.elapsed_time_last_updated;
        if (lastUp > 0) elapsed += (Date.now() / 1000) - lastUp;
    }
    return Math.max(0, elapsed);
}



async function resyncLeaderPlaybackProgress(leaderId) {
    const leaderQueueId = await resolvePlayerQueueId(leaderId);
    const queue = await maClient.send('player_queues/get_active_queue', { player_id: leaderId });
    if (!queue?.current_item) {
        throw new Error('nothing playing to resync');
    }
    const dur = Number(queue.current_item.duration ?? queue.current_item.media_item?.duration ?? 0);
    const canSeek = Number.isFinite(dur) && dur > 0;
    if (queue.state === 'playing') {
        const pos = computeMaQueueElapsedSec(queue);
        if (pos == null) throw new Error('no playback position');
        const seekPos = canSeek
            ? Math.min(Math.round(pos), Math.floor(dur))
            : Math.max(0, Math.round(pos));
        if (canSeek) {
            await maClient.send('player_queues/seek', {
                queue_id: leaderQueueId,
                position: seekPos,
            });
        }
        return seekPos;
    }
    if (queue.state === 'paused') {
        const pos = computeMaQueueElapsedSec(queue);
        if (pos == null) throw new Error('no playback position');
        const seekPos = canSeek
            ? Math.min(Math.round(pos), Math.floor(dur))
            : Math.max(0, Math.round(pos));
        if (canSeek) {
            await maClient.send('player_queues/seek', {
                queue_id: leaderQueueId,
                position: seekPos,
            });
        }
        await maClient.send('player_queues/pause', { queue_id: leaderQueueId });
        return seekPos;
    }
    throw new Error('leader is idle');
}



function isPlayerInSyncGroup(playerId, group, playersById) {
    if (playerId === group.leaderId) return true;
    const player = playersById.get(playerId);
    if (!player) return false;
    if (player.synced_to === group.leaderId) return true;
    const leader = playersById.get(group.leaderId);
    return (leader?.group_members || []).includes(playerId);
}



async function reaffirmSyncGroupMembership(group, playersById) {
    const leaderId = group.leaderId;
    const leader = playersById.get(leaderId);
    if (!leader || !maPlayerSupportsSync(leader)) return false;
    const outOfSync = group.allIds.filter((id) => id !== leaderId && !isPlayerInSyncGroup(id, group, playersById));
    if (!outOfSync.length) return false;
    await maClient.send('players/cmd/set_members', {
        target_player: leaderId,
        player_ids_to_add: outOfSync,
    });
    return true;
}



function verifySyncGroupAligned(group, playersById) {
    const leader = playersById.get(group.leaderId);
    if (!leader) return false;
    const leaderActive = leader.playback_state === 'playing' || leader.playback_state === 'paused';
    if (!leaderActive) return false;
    return group.allIds.every((id) => isPlayerInSyncGroup(id, group, playersById));
}



function delayMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}



function triggerLocalSendspinPlaybackResync() {
    try {
        window.playerInstance?.forcePlaybackResync?.();
    } catch (err) {
        console.warn('local sendspin resync failed:', err);
    }
}



async function refreshActiveSyncGroup() {
    const group = state.playersActiveGroup;
    if (!group?.leaderId) return;
    const playerName = getDefaultPlayerName();
    const names = group.allIds.map((id) => playerDisplayName(id)).join(' · ');
    try {
        await maClient.ensureReady();
        state.playersLoading = true;
        updatePlayersSyncUi();
        playersPanelHint.textContent = `${names} · resyncing playback…`;
        uiH('setStatus', 'resyncing playback…', '');

        let players = await fetchMaPlayers(group.allIds);
        let playersById = new Map(players.map((p) => [p.player_id, p]));
        if (await reaffirmSyncGroupMembership(group, playersById)) {
            await delayMs(400);
            players = await fetchMaPlayers(group.allIds);
            playersById = new Map(players.map((p) => [p.player_id, p]));
        }

        let aligned = verifySyncGroupAligned(group, playersById);
        if (!aligned) {
            try {
                await resyncLeaderPlaybackProgress(group.leaderId);
                await delayMs(500);
                players = await fetchMaPlayers(group.allIds);
                playersById = new Map(players.map((p) => [p.player_id, p]));
                aligned = verifySyncGroupAligned(group, playersById);
            } catch (err) {
                console.warn('refresh sync leader realign failed:', err);
            }
        } else if (maClient.playerId && group.allIds.includes(maClient.playerId)) {
            triggerLocalSendspinPlaybackResync();
        }

        await maClient.refreshActiveQueue();
        syncProgressFromMaQueue(true);
        if (state.queuePanelOpen) loadQueueItems(true);
        uiH('scheduleLocalPlayerVisualCatchup', 'refresh-sync');

        if (aligned) {
            playersPanelHint.textContent = `${names} · playback realigned`;
            uiH('setStatus', 'playback realigned', 'connected');
        } else {
            playersPanelHint.textContent = `${names} · resync incomplete — try again`;
            uiH('setStatus', 'resync incomplete', 'error');
        }
        setTimeout(() => {
            if (state.playersPanelOpen) updatePlayersSyncUi();
            uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : '');
        }, 2500);
        void loadPlayersList(true);
    } catch (err) {
        console.warn('refresh sync group failed:', err);
        playersPanelHint.textContent = `${names} · resync failed`;
        uiH('setStatus', 'refresh sync failed', 'error');
        setTimeout(() => {
            if (state.playersPanelOpen) updatePlayersSyncUi();
            uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : '');
        }, 2500);
    } finally {
        state.playersLoading = false;
        updatePlayersSyncUi();
    }
}



async function joinRemoteSyncGroup() {
    const group = state.playersRemoteGroup;
    if (!group?.leaderId || !maClient.playerId) return;
    const playerName = getDefaultPlayerName();
    try {
        await maClient.ensureReady();
        state.playersLoading = true;
        updatePlayersSyncUi();
        uiH('setStatus', 'joining sync group…', '');
        await maClient.send('players/cmd/set_members', {
            target_player: group.leaderId,
            player_ids_to_add: [maClient.playerId],
        });
        await waitForMemberSyncedToLeader(group.leaderId, maClient.playerId, { maxAttempts: 20 });
        invalidatePlayerSyncDelayCache([maClient.playerId]);
        await loadGroupSyncDelays(group.allIds);
        await maClient.refreshActiveQueue();
        if (state.queuePanelOpen) loadQueueItems(true);
        uiH('schedulePlaybackJoinRecovery', 'join-sync');
        uiH('scheduleLocalPlayerVisualCatchup', 'join-sync');
        const leaderName = playerDisplayName(group.leaderId);
        uiH('setStatus', `joined ${leaderName} group`, 'connected');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
        void loadPlayersList(true);
    } catch (err) {
        console.warn('join sync group failed:', err);
        uiH('setStatus', 'join failed', 'error');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
    } finally {
        state.playersLoading = false;
        updatePlayersSyncUi();
    }
}



async function finalizeSyncGroupPlayback(leaderId, { queueTransferred = false } = {}) {
    const isLocalLeader = !!(leaderId && maClient.playerId === leaderId);
    if (!queueTransferred && isLocalLeader) {
        try {
            await resyncLeaderPlaybackProgress(leaderId);
        } catch (err) {
            console.warn('sync playback align failed:', err);
        }
    }
}



async function removeStereoPairFromActiveGroup() {
    const group = state.playersActiveGroup;
    if (!group?.isStereo || !isLocalDeviceSyncLeader()) return;
    const ids = [group.leftId, group.rightId].filter(Boolean);
    if (!ids.length) return;
    const playerName = getDefaultPlayerName();
    try {
        await maClient.ensureReady();
        state.playersLoading = true;
        closePlayersRowMenu();
        updatePlayersSyncUi();
        uiH('setStatus', 'removing stereo pair…', '');
        for (const id of ids) {
            await maClient.send('players/cmd/ungroup', { player_id: id });
        }
        await waitForPlayersGroupCleared(ids);
        await resetPlayersOutputChannels(ids);
        await maClient.refreshActiveQueue();
        if (state.queuePanelOpen) loadQueueItems(true);
        uiH('scheduleLocalPlayerVisualCatchup', 'remove-stereo-pair');
        uiH('setStatus', 'stereo pair removed', 'connected');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
        void loadPlayersList(true);
    } catch (err) {
        console.warn('remove stereo pair failed:', err);
        uiH('setStatus', 'remove failed', 'error');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
    } finally {
        state.playersLoading = false;
        updatePlayersSyncUi();
    }
}



async function removeMemberFromActiveGroup(playerId) {
    const group = state.playersActiveGroup;
    if (!group || !playerId || !isLocalDeviceSyncLeader()) return;
    if (playerId === group.leaderId) return;
    if (group.isStereo && (playerId === group.leftId || playerId === group.rightId)) {
        await removeStereoPairFromActiveGroup();
        return;
    }
    const playerName = getDefaultPlayerName();
    const name = playerDisplayName(playerId);
    try {
        await maClient.ensureReady();
        state.playersLoading = true;
        closePlayersRowMenu();
        updatePlayersSyncUi();
        uiH('setStatus', `removing ${name}…`, '');
        await maClient.send('players/cmd/ungroup', { player_id: playerId });
        await waitForPlayersGroupCleared([playerId]);
        await maClient.refreshActiveQueue();
        if (state.queuePanelOpen) loadQueueItems(true);
        uiH('scheduleLocalPlayerVisualCatchup', 'remove-member');
        uiH('setStatus', `${name} removed`, 'connected');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
        void loadPlayersList(true);
    } catch (err) {
        console.warn('remove group member failed:', err);
        uiH('setStatus', 'remove failed', 'error');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
    } finally {
        state.playersLoading = false;
        updatePlayersSyncUi();
    }
}



async function leaveActiveSyncGroup() {
    if (!canLeaveActiveSyncGroup()) return;
    const playerName = getDefaultPlayerName();
    const localId = maClient.playerId;
    const group = state.playersActiveGroup;
    const stereoIds = group?.isStereo
        ? [group.leftId, group.rightId].filter(Boolean)
        : [];
    const wasStereoMember = stereoIds.includes(localId);
    try {
        await maClient.ensureReady();
        state.playersLoading = true;
        updatePlayersSyncUi();
        uiH('setStatus', 'leaving sync group…', '');
        await maClient.send('players/cmd/ungroup', { player_id: localId });
        await waitForPlayersGroupCleared([localId]);
        if (wasStereoMember && stereoIds.length) {
            await resetPlayersOutputChannels(stereoIds);
        }
        await maClient.refreshActiveQueue();
        if (state.queuePanelOpen) loadQueueItems(true);
        requestNowPlayingVisuals('unsync', { force: true });
        state.playersSyncSelected.clear();
        state.playersSyncSelectedOrder = [];
        state.playersActiveGroup = null;
        state.playersRemoteGroup = null;
        applyLocalGroupCorrectionMode();
        uiH('setStatus', 'left sync group', 'connected');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
        void loadPlayersList(true);
    } catch (err) {
        console.warn('leave sync group failed:', err);
        uiH('setStatus', 'leave group failed', 'error');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
    } finally {
        state.playersLoading = false;
        updatePlayersSyncUi();
    }
}



async function splitActiveSyncGroup() {
    const group = getAnyMaSyncGroup();
    if (!group?.leaderId) return;
    const playerName = getDefaultPlayerName();
    const clearIds = [...group.allIds];
    const resetIds = group.isStereo
        ? [group.leftId, group.rightId].filter(Boolean)
        : [];
    try {
        await maClient.ensureReady();
        state.playersLoading = true;
        updatePlayersSyncUi();
        uiH('setStatus', 'splitting sync group…', '');
        await dissolveSyncGroupFully(group);
        await clearPlayersSyncDelays(clearIds);
        if (resetIds.length) await resetPlayersOutputChannels(resetIds);
        await maClient.refreshActiveQueue();
        if (state.queuePanelOpen) loadQueueItems(true);
        requestNowPlayingVisuals('unsync', { force: true });
        state.playersSyncSelected.clear();
        state.playersSyncSelectedOrder = [];
        state.playersActiveGroup = null;
        state.playersRemoteGroup = null;
        applyLocalGroupCorrectionMode();
        uiH('setStatus', group.isStereo ? 'stereo pair split' : 'sync group split', 'connected');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
        void loadPlayersList(true);
    } catch (err) {
        console.warn('split sync group failed:', err);
        uiH('setStatus', 'split failed', 'error');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
    } finally {
        state.playersLoading = false;
        updatePlayersSyncUi();
    }
}



async function syncPlayersGroup(selectedIds, {
    leaderId: forcedLeaderId = null,
    stereoPair = false,
    stereoWithLocalLeader = false,
} = {}) {
    if (selectedIds.length < 2) return;
    const playerName = getDefaultPlayerName();
    const statusStereo = stereoWithLocalLeader ? 'stereo + lead here' : 'stereo pair';
    try {
        await maClient.ensureReady();
        state.playersLoading = true;
        updatePlayersSyncUi();
        let players = await repairSelectedPlayersGroupState(selectedIds);
        const playersById = new Map(players.map((p) => [p.player_id, p]));
        let speakerIds = selectedIds;
        let leaderId = forcedLeaderId || null;
        if (stereoWithLocalLeader) {
            const localId = maClient.playerId;
            if (!localId || selectedIds.includes(localId) || selectedIds.length !== 2) {
                uiH('setStatus', 'selected players cannot sync together', 'error');
                setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
                return;
            }
            leaderId = localId;
            speakerIds = selectedIds;
        }
        if (leaderId && !stereoWithLocalLeader) {
            const members = selectedIds.filter((id) => id !== leaderId);
            if (!isEligibleSyncLeader(leaderId, playersById)
                || !playersCanSyncTogether(leaderId, members, playersById)) {
                leaderId = null;
            }
        }
        if (!leaderId) leaderId = findViableSyncLeader(selectedIds, playersById);
        if (!leaderId) {
            uiH('setStatus', 'selected players cannot sync together', 'error');
            setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
            return;
        }
        const groupIds = stereoWithLocalLeader
            ? [leaderId, ...speakerIds]
            : selectedIds;
        if (!playersCanSyncTogether(leaderId, groupIds.filter((id) => id !== leaderId), playersById)) {
            uiH('setStatus', 'selected players cannot sync together', 'error');
            setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
            return;
        }
        let leftId = null;
        let rightId = null;
        if (stereoPair) {
            if (stereoWithLocalLeader) {
                [leftId, rightId] = speakerIds;
            } else {
                [leftId, rightId] = selectedIds;
                leaderId = leftId;
            }
            uiH('setStatus', 'configuring stereo channels…', '');
            await applyPlayerOutputChannels(leftId, 'left');
            await applyPlayerOutputChannels(rightId, 'right');
            if (stereoWithLocalLeader) {
                await resetPlayersOutputChannels([leaderId]);
            }
        } else {
            await resetPlayersOutputChannels(groupIds);
        }
        const memberIds = groupIds.filter((id) => id !== leaderId);
        const leaderQueueId = await resolvePlayerQueueId(leaderId);
        const sourceQueueId = await findQueueSourceAmongSelected(groupIds, playersById, leaderId);
        let queueTransferred = false;
        if (sourceQueueId && sourceQueueId !== leaderQueueId) {
            uiH('setStatus', 'moving queue to sync leader…', '');
            await maClient.send('player_queues/transfer', {
                source_queue_id: sourceQueueId,
                target_queue_id: leaderQueueId,
                auto_play: true,
            });
            queueTransferred = true;
        } else if (!localQueueHasContent() && !sourceQueueId) {
            uiH('setStatus', 'nothing playing to sync', 'error');
            setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
            return;
        }
        if (memberIds.length) {
            uiH('setStatus', stereoPair ? `creating ${statusStereo}…` : 'syncing players…', '');
            const freshPlayers = await fetchMaPlayers();
            const freshById = new Map(freshPlayers.map((p) => [p.player_id, p]));
            const needsSequential = memberIds.some((id) => playerNeedsSequentialCastJoin(id, freshById));
            if (needsSequential) {
                await addSyncGroupMembersSequential(leaderId, memberIds, freshById, {
                    stereoPair,
                    leftId,
                    rightId,
                });
            } else {
                await maClient.send('players/cmd/set_members', {
                    target_player: leaderId,
                    player_ids_to_add: memberIds,
                });
                for (const memberId of memberIds) {
                    await waitForMemberSyncedToLeader(leaderId, memberId, { maxAttempts: 20 });
                }
            }
        }
        await finalizeSyncGroupPlayback(leaderId, { queueTransferred });
        await loadGroupSyncDelays(groupIds);
        if (groupIds.includes(maClient.playerId)) {
            await refreshLocalPlaybackSyncProfile();
            uiH('schedulePlaybackJoinRecovery', stereoPair ? 'stereo-pair' : 'sync');
        }
        await maClient.refreshActiveQueue();
        if (state.queuePanelOpen) loadQueueItems(true);
        uiH('scheduleLocalPlayerVisualCatchup', stereoPair ? 'stereo-pair' : 'sync');
        requestNowPlayingVisuals(stereoPair ? 'stereo-pair' : 'sync', { force: true });
        const leader = playersById.get(leaderId);
        const leaderName = leader?.display_name || leader?.name || 'leader';
        const okLabel = stereoWithLocalLeader
            ? `${statusStereo} · ${leaderName}`
            : stereoPair ? `stereo pair on ${leaderName}` : `synced on ${leaderName}`;
        uiH('setStatus', okLabel, 'connected');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
        void loadPlayersList(true);
    } catch (err) {
        console.warn(stereoPair ? `${statusStereo} failed:` : 'sync players failed:', err);
        uiH('setStatus', stereoPair ? `${statusStereo} failed` : 'sync failed', 'error');
        setTimeout(() => uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : ''), 2500);
    } finally {
        state.playersLoading = false;
        updatePlayersSyncUi();
    }
}



async function syncSelectedPlayers() {
    const selectedIds = getPlayersSyncSelectedOrder();
    if (selectedIds.length < 2) return;
    await syncPlayersGroup(selectedIds, { leaderId: selectedIds[0], stereoPair: false });
}



async function stereoPairSelectedPlayers() {
    const selectedIds = getPlayersSyncSelectedOrder();
    if (selectedIds.length !== 2) return;
    await syncPlayersGroup(selectedIds, { leaderId: selectedIds[0], stereoPair: true });
}



async function stereoPairWithLocalLeader() {
    const speakerIds = getPlayersSyncSelectedOrder();
    if (speakerIds.length !== 2 || !maClient.playerId) return;
    await syncPlayersGroup(speakerIds, {
        leaderId: maClient.playerId,
        stereoPair: true,
        stereoWithLocalLeader: true,
    });
}



function activatePlayersRow(index) {
    const rows = getPlayersListRows();
    const row = rows[index];
    if (!row) return;
    const targets = getPlayersRowSubTargets(row);
    const target = targets[state.playersRowSubFocus];
    if (target?.dataset?.sub === 'menu') {
        openPlayersRowMenu(index);
        return;
    }
    if (row.classList.contains('stereo-pair-group')) {
        if (state.playersRowSubFocus === 0) {
            state.playersStereoPairExpanded = !state.playersStereoPairExpanded;
            renderPlayersPanel();
            uiH('updatePanelFocus');
            return;
        }
        if (target?.classList?.contains('player-sync-delay-minus')) {
            void adjustStereoPairSyncDelay(-SYNC_DELAY_STEP_MS);
            return;
        }
        if (target?.classList?.contains('player-sync-delay-plus')) {
            void adjustStereoPairSyncDelay(SYNC_DELAY_STEP_MS);
            return;
        }
        return;
    }
    if (state.playersRowSubFocus === 0) {
        const playerId = row.dataset.playerId;
        const player = state.playersListCache.find((p) => p.player_id === playerId);
        togglePlayerSyncSelection(playerId, maPlayerSupportsSync(player) && player?.available !== false);
        return;
    }
    if (target?.classList?.contains('player-sync-delay-minus')) {
        void adjustPlayerSyncDelay(row.dataset.playerId, -SYNC_DELAY_STEP_MS);
        return;
    }
    if (target?.classList?.contains('player-sync-delay-plus')) {
        void adjustPlayerSyncDelay(row.dataset.playerId, SYNC_DELAY_STEP_MS);
        return;
    }
    if (target?.classList?.contains('panel-row-main')) {
        void transferQueueToPlayer(row.dataset.playerId);
    }
}



function closePlayersPanel() {
    if (!state.playersPanelOpen) return;
    closePlayersRowMenu();
    state.playersPanelOpen = false;
    state.playersFocusZone = 'list';
    state.playersRowSubFocus = 0;
    state.playersStereoPairExpanded = false;
    state.playersSyncSelected.clear();
    state.playersSyncSelectedOrder = [];
    state.playersActiveGroup = null;
    state.playersRemoteGroup = null;
    clearTimeout(state.playersRefreshTimer);
    clearTimeout(groupOffsetDisplaySyncTimer);
    pendingOffsetDisplayPlayerIds.clear();
    playersPanel.classList.remove('open');
    playersPanel.setAttribute('aria-hidden', 'true');
    playersBtn?.classList.remove('active');
    mainBody.classList.remove('players-open');
    if (!state.browsePanelOpen && !state.queuePanelOpen && !state.detailsPanelOpen) mainBody.classList.remove('panel-open');
    uiH('schedulePlaybackStackRelayoutAfterStage');
    uiH('resumeUiHideTimer');
    uiH('updateFloatState');
    updatePlayersSyncUi();
    refreshGroupOffsetPollState();
}



function openPlayersPanel() {
    uiH('closeSettingsMenu');
    uiH('closeNavMenu');
    uiH('closeVolumeMenu');
    uiH('closeEqPresetsMenu');
    uiH('closeVizModesMenu');
    uiH('closeBrowsePanel');
    uiH('closeQueuePanel');
    uiH('closeDetailsPanel');
    uiH('syncPanelInputModeForOpen');
    state.playersPanelOpen = true;
    state.playersFocusZone = 'list';
    state.panelFocusIndex = 0;
    state.playersRowSubFocus = 0;
    state.playersStereoPairExpanded = false;
    state.playersSyncSelected.clear();
    state.playersSyncSelectedOrder = [];
    state.playersActiveGroup = null;
    state.playersRemoteGroup = null;
    playersPanel.classList.add('open');
    playersPanel.setAttribute('aria-hidden', 'false');
    playersBtn?.classList.add('active');
    mainBody.classList.add('show-ui', 'panel-open', 'players-open');
    uiH('syncIdleProgressVisibility');
    uiH('refreshTitleLayout');
    uiH('pauseUiHideTimer');
    uiH('stopDvdFloater');
    updatePlayersSyncUi();
    void loadPlayersList().then(() => refreshGroupOffsetPollState());
    uiH('updateFloatState');
}



function applyPlayerVolumeState(player) {
    if (!player) return;
    if (player.volume_level != null) state.playerVolumeLevel = player.volume_level;
    if (player.volume_muted != null) state.playerVolumeMuted = !!player.volume_muted;
    if (player.volume_control != null) state.playerVolumeControl = player.volume_control;
    uiH('syncVolumeUi');
}



async function refreshPlayerVolume() {
    if (!maClient.playerId) return;
    try {
        const player = await maClient.send('players/get', { player_id: maClient.playerId });
        applyPlayerVolumeState(player);
    } catch (err) {
        console.warn('refresh player volume failed:', err);
    }
}



function getSavedPlayerVolume() {
    const raw = localStorage.getItem(PLAYER_VOLUME_KEY);
    if (raw == null || raw === '') return null;
    const level = Number(raw);
    if (!Number.isFinite(level)) return null;
    return Math.round(Math.max(0, Math.min(100, level)));
}



function savePlayerVolume(level) {
    localStorage.setItem(PLAYER_VOLUME_KEY, String(Math.round(level)));
}



async function applyDefaultPlayerVolume() {
    if (state._defaultVolumeApplied || !maClient.playerId) return;
    try {
        await maClient.ensureReady();
        const player = await maClient.send('players/get', { player_id: maClient.playerId });
        applyPlayerVolumeState(player);
        if (!uiH('isVolumeControllable')) return;
        const saved = getSavedPlayerVolume();
        if (saved != null) {
            await uiH('commitVolumeSet', saved, { persist: false });
        } else {
            await uiH('commitVolumeSet', DEFAULT_PLAYER_VOLUME, { persist: true });
        }
        state._defaultVolumeApplied = true;
    } catch (err) {
        console.warn('apply default volume failed:', err);
    }
}


export {
    applyLocalSyncLeaderFromPlayer,
    patchPlayersListFromMaEvent,
    schedulePlayersPanelRefresh,
    scheduleGroupOffsetDisplaySync,
    scheduleLocalPlaybackOffsetsSync,
    syncLocalPlaybackOffsetsFromMa,
    syncGroupOffsetDisplayFromMa,
    readPlayerSyncDelayMs,
    readPlayerGroupTrimMs,
    readPlayerPlaybackOffsets,
    applyLocalPlayerSyncDelay,
    applyLocalPlaybackOffsets,
    applyPlayerVolumeState,
    refreshPlayerVolume,
    applyDefaultPlayerVolume,
    getSavedPlayerVolume,
    savePlayerVolume,
    resolveSyncGroups,
    openPlayersPanel,
    closePlayersPanel,
    closePlayersRowMenu,
    openPlayersRowMenu,
    movePlayersMenuFocus,
    activatePlayersRow,
    activatePlayersMenuItem,
    activatePlayersAction,
    syncSelectedPlayers,
    stereoPairSelectedPlayers,
    stereoPairWithLocalLeader,
    joinRemoteSyncGroup,
    refreshActiveSyncGroup,
    resetActiveGroupOffsets,
    leaveActiveSyncGroup,
    splitActiveSyncGroup,
    getPlayersListRows,
    getPlayersRowSubTargets,
    getPlayersRowSubFocusMax,
    movePlayersRowSubFocus,
    refreshLocalPlaybackSyncProfile,
    getVisiblePlayersActionButtons,
    loadPlayersList,
    renderPlayersPanel,
    updatePlayersSyncUi,
    updatePlayersSyncDelayLabels,
    updateStereoPairDelaySubtitle,
    localPlayerInSyncGroup,
    pauseSyncGroupPlayback,
    resumeSyncGroupPlayback,
    stopSyncGroupPlayback,
};
