/** Android portrait: collapsible chip sections (default expanded). */
import { IS_ANDROID } from '../constants.js';
import { state } from '../state.js';

const CHIP_SECTIONS_STORAGE_KEY = 'spinstage_android_chip_sections';

const SECTIONS = [
    { barId: 'browse-artist-providers', key: 'artistProviders', label: 'Sources' },
    { barId: 'browse-alpha-view-bar', key: 'alphaView', label: 'Browse by letter' },
    { barId: 'browse-container-actions', key: 'containerActions', label: 'Actions' },
    { barId: 'queue-sync-actions', key: 'queueActions', label: 'Queue actions' },
    { barId: 'players-sync-actions', key: 'playersActions', label: 'Sync actions' },
];

function loadChipSectionsCollapsed() {
    if (!IS_ANDROID) return;
    try {
        const raw = localStorage.getItem(CHIP_SECTIONS_STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
            Object.assign(state.androidChipSectionsCollapsed, saved);
        }
    } catch {
        /* ignore corrupt prefs */
    }
}

function saveChipSectionsCollapsed() {
    if (!IS_ANDROID) return;
    try {
        localStorage.setItem(
            CHIP_SECTIONS_STORAGE_KEY,
            JSON.stringify(state.androidChipSectionsCollapsed),
        );
    } catch {
        /* ignore quota errors */
    }
}

function isBarVisible(bar) {
    return !!(bar && bar.style.display !== 'none' && bar.children.length > 0
        && bar.getAttribute('aria-hidden') !== 'true');
}

function isCollapsed(key) {
    return state.androidChipSectionsCollapsed[key] === true;
}

function setCollapsed(key, collapsed) {
    state.androidChipSectionsCollapsed[key] = collapsed === true;
    saveChipSectionsCollapsed();
}

function getToggleForKey(key) {
    const section = SECTIONS.find((s) => s.key === key);
    if (!section) return null;
    const bar = document.getElementById(section.barId);
    const toggle = bar?.previousElementSibling;
    return toggle?.classList?.contains('android-chip-section-toggle') ? toggle : null;
}

function syncToggle(section, bar, toggle) {
    const visible = isBarVisible(bar);
    toggle.hidden = !visible;
    if (!visible) return;
    const collapsed = isCollapsed(section.key);
    bar.classList.toggle('android-chip-section-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.setAttribute('aria-label', collapsed ? `Show ${section.label}` : `Hide ${section.label}`);
    const icon = toggle.querySelector('.android-chip-section-toggle-icon');
    if (icon) icon.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(90deg)';
}

function ensureToggle(section) {
    const bar = document.getElementById(section.barId);
    if (!bar || !IS_ANDROID) return;
    let toggle = bar.previousElementSibling;
    if (!toggle?.classList?.contains('android-chip-section-toggle')) {
        toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'android-chip-section-toggle';
        toggle.dataset.chipSection = section.key;
        toggle.innerHTML = `<span class="android-chip-section-toggle-label">${section.label}</span>`
            + '<img class="android-chip-section-toggle-icon" src="icons/back.svg" alt="" aria-hidden="true">';
        toggle.addEventListener('click', () => {
            setCollapsed(section.key, !isCollapsed(section.key));
            syncAllAndroidChipSections();
        });
        bar.parentNode.insertBefore(toggle, bar);
    }
    syncToggle(section, bar, toggle);
}

export function isChipSectionToggleVisible(key) {
    if (!IS_ANDROID) return false;
    const toggle = getToggleForKey(key);
    return !!(toggle && !toggle.hidden);
}

export function focusChipSectionToggle(key, focused) {
    const toggle = getToggleForKey(key);
    if (!toggle) return;
    toggle.classList.toggle('focused', !!focused);
    if (focused) {
        toggle.focus?.({ preventScroll: true });
        toggle.scrollIntoView?.({ block: 'nearest' });
    }
}

export function activateChipSectionToggle(key) {
    setCollapsed(key, !isCollapsed(key));
    syncAllAndroidChipSections();
}

export function syncAllAndroidChipSections() {
    if (!IS_ANDROID) return;
    for (const section of SECTIONS) ensureToggle(section);
}

export function initAndroidChipSections() {
    if (!IS_ANDROID) return;
    loadChipSectionsCollapsed();
    syncAllAndroidChipSections();
}
