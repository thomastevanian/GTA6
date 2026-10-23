// Builds the single-file game (index.html at the repo root) from src/.
// Usage: node tools/build.mjs [out.html]
//   src/index.html     the page, with "@@include js/foo.js" lines inside the
//                      <script data-src> / <style data-src> blocks
//   src/js, src/css    the files those lines pull in
// Edit src/, then run this; never edit the built index.html by hand.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');
const out = process.argv[2] || path.join(root, 'index.html');

const OPEN = /^\s*<(script|style) data-src="([^"]+)">$/;
const lines = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8').split('\n');
const result = [];
let tag = null;
let src = null;
for (const line of lines) {
  const m = OPEN.exec(line);
  if (m) { tag = m[1]; src = m[2]; result.push(line); continue; }
  const inc = /^@@include (.+)$/.exec(line);
  if (inc) {
    if (inc[1] !== src) throw new Error(`include ${inc[1]} sits inside block ${src}`);
    const body = fs.readFileSync(path.join(srcDir, src), 'utf8').replace(/\n$/, '');
    result.push(body);
    if (tag === 'script') result.push(`//# sourceURL=${src}`);
    continue;
  }
  result.push(line);
}
fs.writeFileSync(out, result.join('\n'));
console.log(`built ${path.relative(root, out)} (${(fs.statSync(out).size / 1048576).toFixed(2)} MB)`);
