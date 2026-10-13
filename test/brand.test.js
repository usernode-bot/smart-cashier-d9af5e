'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// The app icon is declared in dapp.json: the image first, the emoji kept as fallback.
test('dapp.json declares the icon image with the emoji fallback', () => {
  const dapp = JSON.parse(fs.readFileSync(path.join(ROOT, 'dapp.json'), 'utf8'));
  assert.strictEqual(dapp.icon.image, 'brand/icon.png');
  assert.strictEqual(dapp.icon.emoji, '🧾');
});

function pngSize(buf) {
  // PNG signature (8 bytes) + IHDR length (4) + "IHDR" (4), then width and height, big-endian.
  assert.ok(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'not a PNG');
  assert.strictEqual(buf.readUInt32BE(12), 0x49484452, 'first chunk is not IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const EXPECTED = {
  'brand/icon.png': { width: 512, height: 512 },
  'brand/featured-light.png': { width: 1600, height: 900 },
  'brand/featured-dark.png': { width: 1600, height: 900 },
};

for (const [file, dims] of Object.entries(EXPECTED)) {
  test(`${file} is a valid PNG at ${dims.width}x${dims.height} within the size limit`, () => {
    const buf = fs.readFileSync(path.join(ROOT, file));
    assert.deepStrictEqual(pngSize(buf), dims);
    assert.ok(buf.length <= 262144, `${buf.length} bytes exceeds the 256 KB limit`);
  });
}

// The brand framework palette; the SVG sources may use only these colours,
// flat fills only (no text, no gradients, no filters).
const PALETTE = new Set([
  'fffeea', 'ffee6f', '3090e1', 'a9cf97',
  'ffffff', 'fcfab3', '000000', 'b9b9b9',
]);

for (const file of ['brand/icon.svg', 'brand/featured-light.svg', 'brand/featured-dark.svg']) {
  test(`${file} uses only brand palette colours, flat fills only`, () => {
    const svg = fs
      .readFileSync(path.join(ROOT, file), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, ''); // comments may name the rules; check the markup itself
    const hexes = svg.match(/#[0-9a-fA-F]{6}\b/g) || [];
    assert.ok(hexes.length > 0, 'no colours found');
    for (const hex of hexes) {
      assert.ok(PALETTE.has(hex.slice(1).toLowerCase()), `${hex} is not in the brand palette`);
    }
    assert.ok(!/<text/i.test(svg), 'no text allowed in the icons');
    assert.ok(!/gradient/i.test(svg), 'no gradients allowed in the icons');
    assert.ok(!/filter/i.test(svg), 'no filters allowed in the icons');
  });
}
