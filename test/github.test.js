const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({ URL });
vm.runInContext(fs.readFileSync('js/github.js', 'utf8'), context);
const github = vm.runInContext('GitHub', context);

test('accepts only HTTPS GitHub release download URLs', () => {
    assert.equal(github.validateDownloadUrl('https://github.com/decentespresso/openscale/releases/file.zip'),
        'https://github.com/decentespresso/openscale/releases/file.zip');
    assert.throws(() => github.validateDownloadUrl('javascript:alert(1)'), /not trusted/);
    assert.throws(() => github.validateDownloadUrl('https://example.com/file.zip'), /not trusted/);
});
