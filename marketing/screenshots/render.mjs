// Renders every page in src/ to App Store PNGs:
//   out/6.9/NN.png  1320 x 2868  (iPhone 6.9")
//   out/6.7/NN.png  1290 x 2796  (iPhone 6.7"), re-laid out at that size via ?size=6.7, not resized
// PNGs are written without an alpha channel. Also checks the headline (max 2 lines), the subline (1 line),
// that every phone (after its 3D tilt) stays at least 24 px inside the canvas, and that the text block stays clear of it.
// Run: node marketing/screenshots/build.mjs && node marketing/screenshots/render.mjs [01 02 ...]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SHOT_SRC || path.join(here, 'src');
const OUT = process.env.SHOT_OUT || path.join(here, 'out');

const SIZES = [
  { name: '6.9', width: 1320, height: 2868, query: '' },
  { name: '6.7', width: 1290, height: 2796, query: '?size=6.7' },
].filter((s) => !process.env.SHOT_SIZES || process.env.SHOT_SIZES.split(',').includes(s.name));

const only = process.argv.slice(2);
const pages = fs
  .readdirSync(SRC)
  .filter((f) => /^\d\d-.*\.html$/.test(f))
  .filter((f) => only.length === 0 || only.includes(f.slice(0, 2)))
  .sort();

/** Re-encodes a PNG as 8-bit RGB (colour type 2): App Store Connect rejects screenshots with alpha. */
function stripAlpha(buf) {
  const png = PNG.sync.read(buf);
  return PNG.sync.write(png, { colorType: 2, inputHasAlpha: true });
}

const browser = await chromium.launch();
let failures = 0;
try {
  for (const size of SIZES) {
    fs.mkdirSync(path.join(OUT, size.name), { recursive: true });
    // A full run replaces the set: drop PNGs left over from pages that no longer exist.
    if (only.length === 0) for (const f of fs.readdirSync(path.join(OUT, size.name))) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, size.name, f));
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
    for (const file of pages) {
      const n = file.slice(0, 2);
      await page.goto(pathToFileURL(path.join(SRC, file)).href + size.query);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r))))));
      const report = await page.evaluate(() => {
        const zoom = document.body.classList.contains('s67') ? 0.977273 : 1;
        const h1 = document.querySelector('h1');
        const sub = document.querySelector('.sub');
        const hr = h1.getBoundingClientRect();
        const sr = sub.getBoundingClientRect();
        // getBoundingClientRect of a 3D-transformed element is the box of its projected outline.
        const phones = [...document.querySelectorAll('.phone')].map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        });
        return {
          W: window.innerWidth,
          H: window.innerHeight,
          h1Lines: Math.round(hr.height / (parseFloat(getComputedStyle(h1).lineHeight) * zoom)),
          subLines: Math.round(sr.height / (parseFloat(getComputedStyle(sub).lineHeight) * zoom)),
          subOverflow: sub.scrollWidth > sub.clientWidth + 1 || sr.right > window.innerWidth - 24,
          text: { left: Math.min(hr.left, sr.left), top: hr.top, right: Math.max(hr.right, sr.right), bottom: sr.bottom },
          phones,
          fit: document.body.dataset.fit,
          missingFonts: [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family),
        };
      });
      const problems = [];
      const M = 24;
      if (report.h1Lines > 2) problems.push(`headline is ${report.h1Lines} lines`);
      if (report.subLines > 1 || report.subOverflow) problems.push('subline wraps or overflows');
      const t = report.text;
      const margins = report.phones.map((p) => ({
        l: Math.round(p.left),
        r: Math.round(report.W - p.right),
        t: Math.round(p.top),
        b: Math.round(report.H - p.bottom),
      }));
      margins.forEach((m, i) => {
        if (m.l < M || m.r < M || m.t < M || m.b < M) problems.push(`phone ${i + 1} margin under ${M} px (L${m.l} R${m.r} T${m.t} B${m.b})`);
      });
      report.phones.forEach((p, i) => {
        // Text block, grown by the margin, must not intersect the phone's projected box.
        const hit = p.left < t.right + M && p.right > t.left - M && p.top < t.bottom + M && p.bottom > t.top - M;
        if (hit) problems.push(`text block runs into phone ${i + 1}`);
      });
      if (report.missingFonts.length) problems.push(`fonts failed: ${report.missingFonts.join(', ')}`);
      const png = await page.screenshot({ type: 'png', fullPage: false });
      const dest = path.join(OUT, size.name, `${n}.png`);
      fs.writeFileSync(dest, stripAlpha(png));
      const gap = Math.round(Math.min(...report.phones.map((p) => p.top)) - t.bottom);
      console.log(
        `${size.name} ${n}  fit ${report.fit}  headline ${report.h1Lines} line(s), phones ${margins.map((m) => `L${m.l} R${m.r} T${m.t} B${m.b}`).join(' | ')}, text-to-phone ${gap}px` +
          (problems.length ? `  PROBLEM: ${problems.join('; ')}` : '  ok'),
      );
      failures += problems.length;
    }
    await page.close();
  }
} finally {
  await browser.close();
}
if (failures) {
  console.error(`${failures} problem(s) found.`);
  process.exitCode = 1;
}
