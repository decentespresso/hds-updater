import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/js', { recursive: true });
await cp('index.html', 'dist/index.html');
await cp('css', 'dist/css', { recursive: true });

for (const file of await readdir('js')) {
    if (file !== 'dependencies.js') {
        await cp(`js/${file}`, `dist/js/${file}`);
    }
}

await build({
    entryPoints: ['js/dependencies.js'],
    bundle: true,
    format: 'iife',
    minify: true,
    outfile: 'dist/js/dependencies.js',
    platform: 'browser',
    target: ['chrome89', 'edge89'],
    legalComments: 'none'
});
