import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const port = Number(process.argv[2]);
const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript' };

createServer((request, response) => {
    const path = normalize(join('dist', request.url === '/' ? 'index.html' : request.url));
    response.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    createReadStream(path).on('error', () => {
        response.statusCode = 404;
        response.end();
    }).pipe(response);
}).listen(port, '127.0.0.1');
