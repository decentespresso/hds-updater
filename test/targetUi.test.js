const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const main = fs.readFileSync('js/main.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

test('unknown board identity requires exact confirmation and clears it at lifecycle boundaries', () => {
    assert.match(html, />Confirm this is a Half Decent Scale by typing FLASH HDS</);
    assert.match(main, /event\.target\.value === 'FLASH HDS'/);
    assert.match(main, /async onConnect\(\) \{\s*this\.clearTargetConfirmation\(\)/);
    assert.match(main, /async onDisconnect\(\)[\s\S]*this\.clearTargetConfirmation\(\)/);
    assert.match(main, /finally \{[\s\S]*this\.clearTargetConfirmation\(\)/);
});
