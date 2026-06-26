#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginJava = path.join(
    root,
    'node_modules/@jofr/capacitor-media-session/android/src/main/java/io/github/jofr/capacitor/mediasessionplugin/MediaSessionPlugin.java',
);

if (!existsSync(pluginJava)) {
    console.warn('MediaSession plugin not installed; skip native patches');
    process.exit(0);
}

const oldBlock = `        final JSArray artworkArray = call.getArray("artwork");
        final List<JSONObject> artworkList = artworkArray.toList();
        for (JSONObject artwork : artworkList) {
            String src = artwork.getString("src");
            if (src != null) {
                this.artwork = urlToBitmap(src);
            }
        }

        if (service != null) { updateServiceMetadata(); };
        call.resolve();`;

const newBlock = `        final JSArray artworkArray = call.getArray("artwork");
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
        call.resolve();`;

let src = readFileSync(pluginJava, 'utf8');
if (src.includes('Failed to load artwork:')) {
    console.log('MediaSession plugin already patched');
    process.exit(0);
}
if (!src.includes(oldBlock)) {
    console.warn('MediaSession plugin layout changed; manual patch may be needed');
    process.exit(0);
}
src = src.replace(oldBlock, newBlock);
writeFileSync(pluginJava, src);
console.log('Patched MediaSession plugin for resilient notification metadata');
