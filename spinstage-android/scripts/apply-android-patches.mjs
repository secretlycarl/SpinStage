#!/usr/bin/env node
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(root, '..');
const pluginDir = path.join(
    root,
    'node_modules/@jofr/capacitor-media-session/android/src/main/java/io/github/jofr/capacitor/mediasessionplugin',
);
const pluginJava = path.join(pluginDir, 'MediaSessionPlugin.java');
const serviceJava = path.join(pluginDir, 'MediaSessionService.java');
const faviconSrc = path.join(repoRoot, 'spinstage-webui', 'favicon.png');
const notificationIconDest = path.join(
    root,
    'android/app/src/main/res/drawable/ic_spinstage_notification.png',
);

function syncNotificationIconAsset() {
    if (!existsSync(faviconSrc)) {
        console.warn('favicon.png missing; skip notification icon asset copy');
        return;
    }
    mkdirSync(path.dirname(notificationIconDest), { recursive: true });
    copyFileSync(faviconSrc, notificationIconDest);
    console.log('Synced favicon -> ic_spinstage_notification.png');
}

function patchFile(filePath, oldBlock, newBlock, label) {
    if (!existsSync(filePath)) {
        console.warn(`${label}: file missing`);
        return false;
    }
    let src = readFileSync(filePath, 'utf8');
    if (src.includes(newBlock)) {
        console.log(`${label}: already patched`);
        return true;
    }
    if (!src.includes(oldBlock)) {
        console.warn(`${label}: layout changed; manual patch may be needed`);
        return false;
    }
    src = src.replace(oldBlock, newBlock);
    writeFileSync(filePath, src);
    console.log(`${label}: patched`);
    return true;
}

syncNotificationIconAsset();

if (!existsSync(pluginJava)) {
    console.warn('MediaSession plugin not installed; skip native patches');
    process.exit(0);
}

patchFile(
    pluginJava,
    `        final JSArray artworkArray = call.getArray("artwork");
        final List<JSONObject> artworkList = artworkArray.toList();
        for (JSONObject artwork : artworkList) {
            String src = artwork.getString("src");
            if (src != null) {
                this.artwork = urlToBitmap(src);
            }
        }

        if (service != null) { updateServiceMetadata(); };
        call.resolve();`,
    `        final JSArray artworkArray = call.getArray("artwork");
        if (artworkArray != null) {
            final List<JSONObject> artworkList = artworkArray.toList();
            for (JSONObject artwork : artworkList) {
                try {
                    String src = artwork.getString("src");
                    if (src != null) {
                        Bitmap loaded = urlToBitmap(src);
                        if (loaded != null) {
                            this.artwork = loaded;
                        }
                    }
                } catch (IOException err) {
                    Log.w(TAG, "Failed to load artwork: " + err.getMessage());
                }
            }
        }

        if (service != null) { updateServiceMetadata(); }
        call.resolve();`,
    'MediaSessionPlugin metadata',
);

if (existsSync(serviceJava)) {
    patchFile(
        serviceJava,
        `        notificationBuilder = new NotificationCompat.Builder(this, "playback")
                .setStyle(notificationStyle)
                .setSmallIcon(R.drawable.ic_baseline_volume_up_24)
                .setContentIntent(PendingIntent.getActivity(getApplicationContext(), 0, intent, PendingIntent.FLAG_IMMUTABLE))
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);`,
        `        int notificationIconId = getApplicationContext().getResources().getIdentifier(
                "ic_spinstage_notification", "drawable", getApplicationContext().getPackageName());
        if (notificationIconId == 0) {
            notificationIconId = R.drawable.ic_baseline_volume_up_24;
        }

        notificationBuilder = new NotificationCompat.Builder(this, "playback")
                .setStyle(notificationStyle)
                .setSmallIcon(notificationIconId)
                .setContentIntent(PendingIntent.getActivity(getApplicationContext(), 0, intent, PendingIntent.FLAG_IMMUTABLE))
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);`,
        'MediaSessionService notification icon',
    );
}
