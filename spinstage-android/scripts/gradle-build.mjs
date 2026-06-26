import { spawnSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const androidDir = join(rootDir, 'android');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const task = process.argv[2] || 'assembleDebug';

const result = spawnSync(gradlew, [task], { cwd: androidDir, stdio: 'inherit', shell: true });
if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
}

const version = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')).version;

function copyVersionedApk(variant, defaultName, destName) {
    const src = join(androidDir, `app/build/outputs/apk/${variant}/${defaultName}`);
    if (!existsSync(src)) return;
    const outDir = join(androidDir, `app/build/outputs/apk/${variant}`);
    const dest = join(outDir, destName);
    copyFileSync(src, dest);
    console.log(`Versioned APK: ${dest}`);
    const distDir = join(rootDir, 'dist');
    mkdirSync(distDir, { recursive: true });
    const distDest = join(distDir, destName);
    copyFileSync(src, distDest);
    console.log(`Release artifact: ${distDest}`);
}

if (task === 'assembleDebug') {
    copyVersionedApk('debug', 'app-debug.apk', `spinstage-v${version}-debug.apk`);
}

if (task === 'assembleRelease') {
    copyVersionedApk('release', 'app-release.apk', `spinstage-${version}.apk`);
}

process.exit(0);
