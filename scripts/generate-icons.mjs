// Generates the PWA/app icons in /public (plus app/icon.png and app/apple-icon.png) from inline SVG sources.
// Run with: node scripts/generate-icons.mjs
//
// The mark is a yin-yang: one half holds a shopping bag (spending), the other a piggy bank (saving) —
// both matter and each completes the other.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

const OUTLINE = '#111111';

const DEFS = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#22a35a" />
      <stop offset="1" stop-color="#0a5730" />
    </linearGradient>
    <linearGradient id="gold" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#fde68a" />
      <stop offset="0.5" stop-color="#f5b014" />
      <stop offset="1" stop-color="#c27803" />
    </linearGradient>
    <linearGradient id="white" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#ffffff" />
      <stop offset="1" stop-color="#e8efe9" />
    </linearGradient>
  </defs>
`;

/** Shopping bag centred on 0,0. */
function bag(fill) {
  return `
    <path d="M-16 -30 V-42 A16 16 0 0 1 16 -42 V-30" fill="none" stroke="${fill}" stroke-width="9" stroke-linecap="round" />
    <path d="M-34 -32 H34 L40 32 H-40 Z" fill="${fill}" stroke="${fill}" stroke-width="8" stroke-linejoin="round" />
  `;
}

/** Piggy bank centred on 0,0, facing right; `hole` colours the coin slot and the eye. */
function piggy(fill, hole) {
  return `
    <path d="M-58 -6 C-76 -8 -78 -28 -64 -28" fill="none" stroke="${fill}" stroke-width="7" stroke-linecap="round" />
    <path d="M8 -36 L24 -64 L38 -32 Z" fill="${fill}" stroke="${fill}" stroke-width="6" stroke-linejoin="round" />
    <rect x="-40" y="22" width="20" height="34" rx="8" fill="${fill}" />
    <rect x="16" y="22" width="20" height="34" rx="8" fill="${fill}" />
    <ellipse cx="0" cy="2" rx="62" ry="46" fill="${fill}" />
    <ellipse cx="62" cy="2" rx="14" ry="19" fill="${fill}" />
    <path d="M-18 -34 H8" stroke="${hole}" stroke-width="7" stroke-linecap="round" />
    <circle cx="36" cy="-12" r="5.5" fill="${hole}" />
  `;
}

const HALF = 'M256 92 A164 164 0 0 1 256 420 A82 82 0 0 1 256 256 A82 82 0 0 0 256 92 Z';

/** Keeps a symbol upright inside the tilted yin-yang. */
function upright(x, y, scale, inner) {
  return `<g transform="translate(${x} ${y}) rotate(20) scale(${scale})">${inner}</g>`;
}

/** The yin-yang, centred on 256,256; `scale` shrinks it for safe zones. */
function mark(scale) {
  return `
    <g transform="translate(256 256) scale(${scale}) translate(-256 -256) rotate(-20 256 256)">
      <circle cx="256" cy="256" r="164" fill="url(#white)" />
      <path d="${HALF}" fill="url(#gold)" />
      ${upright(256, 178, 0.95, bag('url(#gold)'))}
      ${upright(250, 340, 0.82, piggy('url(#white)', 'url(#gold)'))}
      <circle cx="256" cy="256" r="164" fill="none" stroke="${OUTLINE}" stroke-width="10" />
    </g>
  `;
}

/** Full-bleed background (required for maskable icons and iOS, which apply their own mask/corners). */
function fullBleedSvg(markScale) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      ${DEFS}
      <rect width="512" height="512" fill="url(#bg)" />
      ${mark(markScale)}
    </svg>
  `;
}

/** Rounded-square variant for the "any" purpose icon and favicon. */
function roundedSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      ${DEFS}
      <rect width="512" height="512" rx="112" fill="url(#bg)" />
      ${mark(1)}
    </svg>
  `;
}

/**
 * Notification badge (Android status bar): the system only uses the alpha channel, so it is the
 * yin-yang in white on transparency — the piggy's half solid with the piggy cut out, the bag's
 * half empty with the bag drawn in.
 */
function badgeSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>
        <mask id="cut">
          <rect width="512" height="512" fill="#fff" />
          ${upright(250, 340, 0.82, piggy('#000', '#fff'))}
        </mask>
      </defs>
      <g transform="translate(256 256) scale(1.4) translate(-256 -256) rotate(-20 256 256)">
        <path d="${HALF}" fill="#fff" mask="url(#cut)" />
        ${upright(256, 178, 0.95, bag('#fff'))}
        <circle cx="256" cy="256" r="164" fill="none" stroke="#fff" stroke-width="14" />
      </g>
    </svg>
  `;
}

async function render(svg, size, outFile) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(rootDir, outFile));
  console.log('wrote', outFile);
}

async function main() {
  await mkdir(publicDir, { recursive: true });

  await render(roundedSvg(), 512, 'public/icon-512.png');
  await render(roundedSvg(), 192, 'public/icon-192.png');
  await render(roundedSvg(), 512, 'app/icon.png');
  // Maskable icons need the mark inside the ~80% "safe zone", full-bleed background.
  await render(fullBleedSvg(0.8), 512, 'public/icon-maskable-512.png');
  await render(fullBleedSvg(0.8), 192, 'public/icon-maskable-192.png');
  // iOS home-screen icon: no transparency, iOS applies its own rounding.
  await render(fullBleedSvg(0.95), 180, 'public/apple-touch-icon.png');
  await render(fullBleedSvg(0.95), 180, 'app/apple-icon.png');
  await render(badgeSvg(), 96, 'public/badge-96.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
