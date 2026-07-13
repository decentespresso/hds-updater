import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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

const html = await readFile('dist/index.html', 'utf8');
const assets = [...html.matchAll(/(?:href|src)="([^"]+\.(?:css|js))"/g)].map(match => match[1]);
const versions = await Promise.all(assets.map(async asset => [
    asset,
    createHash('sha256').update(await readFile(`dist/${asset}`)).digest('hex').slice(0, 12)
]));
const versionedHtml = versions.reduce(
    (content, [asset, version]) => content.replaceAll(`"${asset}"`, `"${asset}?v=${version}"`),
    html
);

await writeFile('dist/index.html', versionedHtml);
