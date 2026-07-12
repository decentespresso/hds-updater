import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/js', { recursive: true });
await cp('index.html', 'dist/index.html');
await cp('js', 'dist/js', { recursive: true });
