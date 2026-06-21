// One-off OG image generator that does NOT need ImageMagick (absent on this
// host). Renders an SVG to the Meridian Build charter and rasterizes it with
// `sharp` (a transitive dep already in node_modules). Mirrors the layout of
// scripts/generate-og-images.mjs.
//
//   node scripts/generate-og-image-sharp.mjs <slug>
//
// Reads the title from src/content/blog/<slug>.md frontmatter, writes
// public/og/<slug>.png (1200x630).

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Brand palette (matches src/styles/global.css)
const BG = '#1a1815';
const CREAM = '#faf7f5';
const ACCENT = '#c4703f';
const MUTED = '#8a827b';
const FONT = 'Liberation Sans, DejaVu Sans, Arial, sans-serif';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node scripts/generate-og-image-sharp.mjs <slug>');
  process.exit(1);
}

const md = readFileSync(join(root, 'src/content/blog', `${slug}.md`), 'utf8');
const block = md.match(/^---\n([\s\S]*?)\n---/)[1];
const title = block.match(/^title:\s*(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');

// Greedy word wrap targeting ~26 chars/line (bold 50pt within a 1000px band).
function wrap(text, max = 26) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line && (line + ' ' + w).length > max) {
      lines.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const lines = wrap(title);
const lineHeight = 64;
const blockHeight = lines.length * lineHeight;
const startY = 315 - blockHeight / 2 + 46; // vertically centered, baseline-adjusted

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const tspans = lines
  .map((l, i) => `<text x="100" y="${startY + i * lineHeight}" font-family="${FONT}" font-size="50" font-weight="bold" fill="${CREAM}">${esc(l)}</text>`)
  .join('\n  ');

const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="${BG}"/>
  <rect x="100" y="84" width="56" height="8" fill="${ACCENT}"/>
  <text x="100" y="138" font-family="${FONT}" font-size="26" font-weight="bold" fill="${ACCENT}" letter-spacing="1">MERIDIAN BUILD</text>
  ${tspans}
  <text x="100" y="556" font-family="${FONT}" font-size="26" fill="${MUTED}">meridianbuild.dev</text>
</svg>`;

const outFile = join(root, 'public/og', `${slug}.png`);
const png = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync(outFile, png);
console.log(`Wrote public/og/${slug}.png (${lines.length} title lines)`);
