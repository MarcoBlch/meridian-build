// Generates social share images (1200x630) as committed static assets.
//
// Why committed and not built in CI: the deploy pipeline is not guaranteed to
// have ImageMagick (and `sharp` is only a transitive dep), so OG images are
// rendered locally and checked into /public/og/. Re-run after adding/renaming
// a post or changing a title:
//
//   node scripts/generate-og-images.mjs
//
// Requires ImageMagick `convert` on the local machine.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const blogDir = join(root, 'src/content/blog');
const outDir = join(root, 'public/og');

// Brand palette (matches src/styles/global.css)
const BG = '#1a1815';
const CREAM = '#faf7f5';
const ACCENT = '#c4703f';
const MUTED = '#8a827b';

const FONT_BOLD = [
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
].find(existsSync);
const FONT_REG = [
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
].find(existsSync);

if (!FONT_BOLD || !FONT_REG) {
  console.error('No suitable font found (Liberation Sans / DejaVu Sans).');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

// Parse `title` out of the YAML frontmatter block, plus the draft flag.
function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const block = m[1];
  const title = block.match(/^title:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
  const draft = /^draft:\s*true\s*$/m.test(block);
  return { title, draft };
}

function render(title, outFile) {
  // Title is passed inline as a single argv entry (execFileSync, no shell), so
  // quotes/colons/ampersands need no escaping. ImageMagick's @-file indirection
  // is blocked by the default policy.xml, which is why we don't read from a file.
  execFileSync('convert', [
    '-size', '1200x630', `xc:${BG}`,
    // accent bar (brand mark)
    '-fill', ACCENT, '-draw', 'rectangle 100,84 156,92',
    // eyebrow label
    '-font', FONT_BOLD, '-pointsize', '26', '-fill', ACCENT,
    '-gravity', 'NorthWest', '-annotate', '+100+112', 'MERIDIAN BUILD',
    // title block: fixed 50pt headline, wrapped within a 1000px-wide band and
    // vertically centered. Fixed point size (rather than caption auto-fit, which
    // is width-bound and renders small) gives consistent, bold headlines across
    // titles of different lengths.
    '(', '-background', 'none', '-fill', CREAM, '-font', FONT_BOLD,
    '-pointsize', '50', '-size', '1000x300', '-gravity', 'West', `caption:${title}`, ')',
    '-gravity', 'West', '-geometry', '+100+24', '-composite',
    // footer
    '-font', FONT_REG, '-pointsize', '26', '-fill', MUTED,
    '-gravity', 'SouthWest', '-annotate', '+100+62', 'meridianbuild.dev',
    outFile,
  ]);
  console.log(`  ${outFile.replace(root + '/', '')}`);
}

console.log('Generating OG images...');

// Default / fallback image used by every non-article page.
render('Building digital products, one at a time', join(outDir, 'default.png'));

// One image per published post, keyed by slug.
for (const file of readdirSync(blogDir).filter((f) => f.endsWith('.md'))) {
  const { title, draft } = frontmatter(readFileSync(join(blogDir, file), 'utf8'));
  if (!title || draft) continue;
  const slug = file.replace(/\.md$/, '');
  render(title, join(outDir, `${slug}.png`));
}

console.log('Done.');
