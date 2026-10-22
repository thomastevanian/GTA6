// One-off: splits a single-file Vicehaven build (index.html with
// <script data-src="..."> / <style data-src="..."> blocks) into src/.
// Usage: node tools/unbundle.mjs <bundle.html> <outDir>
import fs from 'node:fs';
import path from 'node:path';

const [, , input, outDir] = process.argv;
const lines = fs.readFileSync(input, 'utf8').split('\n');
const OPEN = /^(\s*)<(script|style) data-src="([^"]+)">$/;
const CLOSE = /^\s*<\/(script|style)>\s*$/;

const template = [];
const files = [];
for (let i = 0; i < lines.length; i++) {
  const m = OPEN.exec(lines[i]);
  if (!m) { template.push(lines[i]); continue; }
  const [, , tag, src] = m;
  let j = i + 1;
  while (j < lines.length && !CLOSE.test(lines[j])) j++;
  if (j >= lines.length) throw new Error('unterminated block ' + src);
  let body = lines.slice(i + 1, j);
  if (tag === 'script') {
    const last = body[body.length - 1];
    if (last !== `//# sourceURL=${src}`) throw new Error('missing sourceURL on ' + src);
    body = body.slice(0, -1);
  }
  files.push(src);
  fs.mkdirSync(path.dirname(path.join(outDir, src)), { recursive: true });
  fs.writeFileSync(path.join(outDir, src), body.join('\n') + '\n');
  template.push(lines[i], `@@include ${src}`, lines[j]);
  i = j;
}
fs.writeFileSync(path.join(outDir, 'index.html'), template.join('\n'));
console.log(`split ${files.length} files into ${outDir}`);
