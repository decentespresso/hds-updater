const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const workflow = fs.readFileSync('.github/workflows/static.yml', 'utf8');

test('Pages deployment is manual, tested, dist-only, and SHA-pinned', () => {
    assert.match(workflow, /^on:\s*\n  workflow_dispatch:/m);
    assert.doesNotMatch(workflow, /\bpush:/);
    assert.match(workflow, /npm run check/);
    assert.match(workflow, /path: dist/);
    assert.match(workflow, /environment:\s*\n      name: github-pages/);
    for (const reference of workflow.matchAll(/uses: ([^\s]+)/g)) {
        assert.match(reference[1], /@[0-9a-f]{40}$/);
    }
});
