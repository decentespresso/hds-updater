import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const port = 4173;
const server = spawn(process.execPath, ['test/server.mjs', String(port)], { stdio: 'ignore' });

try {
    const html = await readFile('dist/index.html', 'utf8');
    const assets = [...html.matchAll(/(?:href|src)="((?:css|js)\/[^"]+\.(?:css|js)(?:\?v=[a-f0-9]{12})?)"/g)]
        .map(match => match[1]);
    assert.equal(assets.length, 8);
    assert.ok(assets.every(asset => /\?v=[a-f0-9]{12}$/.test(asset)));

    await new Promise(resolve => setTimeout(resolve, 300));
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://api.github.com/**', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([{
            id: 1,
            name: '<img id="injected" src=x onerror=alert(1)>',
            prerelease: false,
            assets: [{ name: 'HDS.zip', browser_download_url: 'https://github.com/example/HDS.zip' }]
        }])
    }));
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.title(), 'Half Decent Scale Updater');
    assert.equal(await page.evaluate(() => Buffer.from('SERT', 'base64').toString('binary')), 'HDS');
    await page.locator('#version-select option').nth(1).waitFor({ state: 'attached' });
    assert.equal(await page.locator('#version-select option').nth(1).textContent(),
        '<img id="injected" src=x onerror=alert(1)>');
    assert.equal(await page.locator('#injected').count(), 0);
    assert.deepEqual(errors, []);
    await browser.close();
} finally {
    server.kill();
}
