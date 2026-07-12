const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('production HTML has a restrictive CSP and no runtime CDN dependencies', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert.match(html, /default-src 'none'/);
    assert.match(html, /connect-src https:\/\/api\.github\.com/);
    assert.doesNotMatch(html, /<script(?![^>]+src=)|<style|importmap|cdn\.jsdelivr|esm\.sh/);
    assert.doesNotMatch(html, /\sstyle=/);
    assert.match(fs.readFileSync('js/dependencies.js', 'utf8'), /useWebWorkers: false/);
    assert.match(fs.readFileSync('js/dependencies.js', 'utf8'), /atob\(value\)/);
});
