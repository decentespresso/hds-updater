import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const port = 4173;
const screenshotRoot = resolve(tmpdir());
let server;
let screenshots;
let browser;

async function assertResponsive(page, width) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true,
        `Page overflows at ${width}px`);
    assert.deepEqual(await page.locator('.topbar-inner, .section, .button, select, input[type="file"], .console, .progress-bar')
        .evaluateAll(elements => elements.filter(element => {
            const bounds = element.getBoundingClientRect();
            return bounds.width && (bounds.left < 0 || bounds.right > document.documentElement.clientWidth + 1);
        }).map(element => element.id || element.className)), [], `Control overflows at ${width}px`);
    const firmware = await page.locator('#firmware-heading').boundingBox();
    const flash = await page.locator('#flash-heading').boundingBox();
    assert.equal(width > 930 ? flash.x > firmware.x : flash.y > firmware.y, true);
}

try {
    screenshots = await mkdtemp(join(screenshotRoot, 'hds-updater-'));
    server = spawn(process.execPath, ['test/server.mjs', String(port)], { stdio: 'ignore' });
    const html = await readFile('dist/index.html', 'utf8');
    const assets = [...html.matchAll(/(?:href|src)="((?:css|js)\/[^"]+\.(?:css|js)(?:\?v=[a-f0-9]{12})?)"/g)]
        .map(match => match[1]);
    assert.equal(assets.length, 10);
    assert.ok(assets.every(asset => /\?v=[a-f0-9]{12}$/.test(asset)));

    await new Promise(resolve => setTimeout(resolve, 300));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ colorScheme: 'light' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error' && message.text() !==
            "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.") {
            errors.push(message.text());
        }
    });
    await page.route('https://api.github.com/**', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([{
            id: 1,
            name: '<img id="injected" src=x onerror=alert(1)>',
            prerelease: false,
            assets: [{ name: 'HDS.zip', browser_download_url: 'https://github.com/example/HDS.zip' }]
        }, {
            id: 2,
            name: 'v3.1.14',
            prerelease: false,
            assets: ['HDS_FW_v3.1.14_PCB_V0.1.zip', 'HDS_FW_v3.1.14_PCB_V0.2.zip'].map(name => ({
                name, browser_download_url: `https://github.com/decentespresso/openscale/releases/download/v3.1.14/${name}`
            }))
        }])
    }));
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.title(), 'Half Decent Scale Updater');
    assert.equal(await page.getByRole('link', { name: 'Open source repository' }).count(), 0);
    assert.equal(await page.evaluate(() => Buffer.from('SERT', 'base64').toString('binary')), 'HDS');
    await page.locator('#version-select option').nth(1).waitFor({ state: 'attached' });
    assert.equal(await page.locator('#version-select option').nth(1).textContent(),
        '<img id="injected" src=x onerror=alert(1)>');
    assert.equal(await page.locator('#injected').count(), 0);
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await page.locator('#version-select').selectOption('2');
    assert.equal(await page.locator('#asset-group').isVisible(), true);
    assert.equal(await page.locator('#download-btn').isEnabled(), true);
    assert.equal(await page.locator('#flash-btn').isEnabled(), false);

    for (const theme of ['light', 'dark']) {
        if (theme === 'dark') await page.locator('#theme-toggle').click();
        assert.equal(await page.locator('#theme-toggle').getAttribute('aria-pressed'), String(theme === 'dark'));
        for (const width of [1440, 1024, 931, 930, 768, 640, 390, 320]) {
            await assertResponsive(page, width);
            if ([1440, 390].includes(width)) {
                await page.screenshot({ path: join(screenshots, `${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
            }
        }
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');

    await page.locator('#zip-upload').setInputFiles({ name: 'invalid.zip', mimeType: 'application/zip', buffer: Buffer.from('invalid') });
    await page.locator('#download-status.error').waitFor();
    assert.equal(await page.locator('#flash-btn').isEnabled(), false);
    await page.evaluate(() => {
        Flasher.connectDevice = async () => ({ type: 'ESP32-S3', macAddress: '00:11:22:33:44:55', flashSizeLabel: '8 MiB' });
        Flasher.disconnectDevice = async () => {};
    });
    await page.locator('#connect-btn').click();
    await page.locator('#device-info').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#chip-type').textContent(), 'ESP32-S3');
    assert.equal(await page.locator('#disconnect-btn').isEnabled(), true);
    assert.equal(await page.locator('#flash-btn').isEnabled(), false);
    await page.locator('.flash-details summary').click();
    assert.equal(await page.locator('.offset-table').isVisible(), true);
    await page.evaluate(() => {
        App.showProgress();
        App.updateProgress(42, { currentFile: 3, totalFiles: 4, currentFileName: 'firmware.bin' });
        App.log('A'.repeat(300), 'warning');
    });
    assert.equal(await page.locator('#progress-label').textContent(), '3/4: firmware.bin (42%)');
    assert.equal(await page.locator('#progress-label').evaluate(element => getComputedStyle(element).transform), 'none');
    assert.equal(await page.locator('#progress-label').getAttribute('aria-live'), null);
    const progressBar = page.getByRole('progressbar', { name: 'Flash firmware' });
    assert.equal(await progressBar.getAttribute('aria-valuenow'), '42');
    assert.equal(await progressBar.getAttribute('aria-valuetext'), '3/4: firmware.bin (42%)');
    assert.equal(await progressBar.getAttribute('aria-live'), null);
    const announcements = await page.locator('[aria-live], [role="log"]').allTextContents();
    await page.evaluate(() => {
        for (let percent = 43; percent <= 100; percent++) App.updateProgress(percent);
    });
    assert.equal(await page.locator('#progress-label').textContent(), '100%');
    assert.equal(await progressBar.getAttribute('aria-valuenow'), '100');
    assert.deepEqual(await page.locator('[aria-live], [role="log"]').allTextContents(), announcements);
    for (const width of [1440, 390, 320]) await assertResponsive(page, width);
    await page.locator('#disconnect-btn').click();
    assert.equal(await page.locator('#device-info').isVisible(), false);
    assert.equal(await page.locator('#connect-btn').isEnabled(), true);

    const deniedStorage = await browser.newPage({ colorScheme: 'dark' });
    await deniedStorage.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
    });
    await deniedStorage.route('https://api.github.com/**', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
    await deniedStorage.goto(`http://127.0.0.1:${port}`);
    assert.equal(await deniedStorage.locator('html').getAttribute('data-theme'), 'dark');
    await deniedStorage.locator('#theme-toggle').click();
    assert.equal(await deniedStorage.locator('html').getAttribute('data-theme'), 'light');
    await deniedStorage.close();
    assert.deepEqual(errors, []);
    console.log('Browser checks passed.');
} finally {
    try {
        await browser?.close();
    } finally {
        server?.kill();
        if (screenshots) {
            assert.equal(dirname(screenshots), screenshotRoot);
            await rm(screenshots, { recursive: true, force: true });
        }
    }
}
