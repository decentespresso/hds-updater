const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const main = fs.readFileSync('js/main.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

test('archive and release strings never reach HTML parsing sinks', () => {
    assert.doesNotMatch(main, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    assert.match(main, /option\.textContent = label/);
    assert.match(main, /downloadStatus\.textContent = message/);
    assert.match(main, /line\.textContent =/);
});

test('custom flash-address editing is absent and the trusted map is read-only', () => {
    assert.doesNotMatch(`${html}\n${main}`, /custom offset|advanced-mode|offset-input/i);
    assert.match(html, /bootloader\.bin<\/td><td>0x000000/);
    assert.match(html, /littlefs\.bin<\/td><td>0x670000/);
});
