import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = 4173;
const server = spawn(process.execPath, ['test/server.mjs', String(port)], { stdio: 'ignore' });

try {
    await new Promise(resolve => setTimeout(resolve, 300));
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.title(), 'Half Decent Scale Updater');
    await browser.close();
} finally {
    server.kill();
}
