import { spawnSync } from 'child_process';

function parseMajor(versionOutput) {
    const match = String(versionOutput).match(/version "([^"]+)"/);
    if (!match) return 0;
    const parts = match[1].split('.');
    const first = Number(parts[0]);
    if (first === 1 && parts[1]) return Number(parts[1]);
    return first;
}

const result = spawnSync('java', ['-version'], { encoding: 'utf8' });
const output = `${result.stderr || ''}${result.stdout || ''}`;
const major = parseMajor(output);

if (major < 17) {
    console.error('\nSpinStage Android build requires Java 17 or newer.');
    console.error(`Detected Java version output:\n${output.trim()}\n`);
    console.error('Gradle is probably using an old JDK (Java 8). Fix JAVA_HOME, then retry.\n');
    console.error('Windows (Android Studio installed):');
    console.error('  $env:JAVA_HOME = "C:\\Program Files\\Android\\Android Studio\\jbr"');
    console.error('  npm run build:debug\n');
    console.error('Or install JDK 17+ and point JAVA_HOME at it.');
    console.error('Verify: java -version\n');
    process.exit(1);
}

console.log(`Java OK (${output.match(/version "[^"]+"/)?.[0] || '17+'})`);
