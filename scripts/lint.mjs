import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const directories = ['js', 'scripts', 'test'];
const files = [];

for (const directory of directories) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isFile() && /\.[cm]?js$/.test(entry.name)) {
            files.push(`${directory}/${entry.name}`);
        }
    }
}

for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}
