import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const localProps = join(root, 'android', 'local.properties');

function escapeSdkPath(p) {
    return p.replace(/\\/g, '/');
}

function sdkCandidates() {
    const paths = [];
    if (process.env.ANDROID_HOME) paths.push(process.env.ANDROID_HOME);
    if (process.env.ANDROID_SDK_ROOT) paths.push(process.env.ANDROID_SDK_ROOT);
    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
        paths.push(join(process.env.LOCALAPPDATA, 'Android', 'Sdk'));
    }
    paths.push(join(homedir(), 'Android', 'Sdk'));
    paths.push(join(homedir(), 'Library', 'Android', 'sdk'));
    return [...new Set(paths.filter(Boolean))];
}

function isValidSdk(path) {
    return path && existsSync(join(path, 'platform-tools'));
}

function findSdk() {
    for (const candidate of sdkCandidates()) {
        if (isValidSdk(candidate)) return candidate;
    }
    return null;
}

function readExistingSdk() {
    if (!existsSync(localProps)) return null;
    const match = readFileSync(localProps, 'utf8').match(/^sdk\.dir=(.+)$/m);
    return match ? match[1].trim() : null;
}

const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const existing = readExistingSdk();
const discovered = findSdk();
const sdk = (fromEnv && isValidSdk(fromEnv) ? fromEnv : null)
    || (existing && isValidSdk(existing) ? existing : null)
    || discovered;

if (!sdk) {
    console.error('\nAndroid SDK not found.\n');
    console.error('Install Android Studio, open it once (SDK Manager downloads the SDK), then either:\n');
    console.error('1. Set environment variable ANDROID_HOME to your SDK folder, e.g.:');
    console.error('   Windows: C:\\Users\\YOU\\AppData\\Local\\Android\\Sdk');
    console.error('   PowerShell:');
    console.error('     $env:ANDROID_HOME = "$env:LOCALAPPDATA\\Android\\Sdk"');
    console.error('\n2. Or create android\\local.properties manually:');
    console.error('   sdk.dir=C:\\\\Users\\\\YOU\\\\AppData\\\\Local\\\\Android\\\\Sdk');
    console.error('\nVerify the folder contains platform-tools\\adb.exe\n');
    process.exit(1);
}

const next = `sdk.dir=${escapeSdkPath(sdk)}\n`;
if (!existsSync(localProps) || readFileSync(localProps, 'utf8') !== next) {
    writeFileSync(localProps, next);
    console.log(`Android SDK: ${sdk}`);
    console.log(`Wrote android/local.properties`);
} else {
    console.log(`Android SDK: ${sdk}`);
}
