// Renders every page in src/ to App Store PNGs:
//   out/6.9/NN.png  1320 x 2868  (iPhone 6.9")
//   out/6.7/NN.png  1290 x 2796  (iPhone 6.7"), re-laid out at that size via ?size=6.7, not resized
// PNGs are written without an alpha channel. Also checks the headline (max 2 lines), the subline (1 line)
// and that the phone frame keeps its side margins.
// Run: node marketing/screenshots/build.mjs && node marketing/screenshots/render.mjs [01 02 ...]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, 'src');
const OUT = path.join(here, 'out');

const SIZES = [
  { name: '6.9', width: 1320, height: 2868, query: '' },
  { name: '6.7', width: 1290, height: 2796, query: '?size=6.7' },
];

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
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
    for (const file of pages) {
      const n = file.slice(0, 2);
      await page.goto(pathToFileURL(path.join(SRC, file)).href + size.query);
      await page.evaluate(() => document.fonts.ready);
      const report = await page.evaluate(() => {
        const lines = (el) => (el ? Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight) / (window.devicePixelRatio || 1)) : 0);
        const h1 = document.querySelector('h1');
        const sub = document.querySelector('.sub');
        const zoom = document.body.classList.contains('s67') ? 0.977273 : 1;
        const hr = h1.getBoundingClientRect();
        const phone = document.querySelector('.phone').getBoundingClientRect();
        const subBox = sub?.getBoundingClientRect();
        return {
          h1Lines: Math.round(hr.height / (parseFloat(getComputedStyle(h1).lineHeight) * zoom)),
          subLines: sub ? Math.round(subBox.height / (parseFloat(getComputedStyle(sub).lineHeight) * zoom)) : 0,
          subOverflow: sub ? sub.scrollWidth > sub.clientWidth + 1 || subBox.left < 24 || subBox.right > window.innerWidth - 24 : false,
          phoneLeft: Math.round(phone.left),
          phoneRight: Math.round(window.innerWidth - phone.right),
          phoneTop: Math.round(phone.top),
          phoneBottom: Math.round(window.innerHeight - phone.bottom),
          headBottom: Math.round((sub ?? h1).getBoundingClientRect().bottom),
          missingFonts: [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family),
          lines,
        };
      });
      const problems = [];
      if (report.h1Lines > 2) problems.push(`headline is ${report.h1Lines} lines`);
      if (report.subLines > 1 || report.subOverflow) problems.push('subline wraps or overflows');
      if (report.phoneLeft < 24 || report.phoneRight < 24 || report.phoneBottom < 24) problems.push('phone margins under 24 px');
      if (Math.abs(report.phoneLeft - report.phoneRight) > 2) problems.push('phone not centred');
      if (report.headBottom > report.phoneTop - 24) problems.push('headline block runs into the phone');
      if (report.missingFonts.length) problems.push(`fonts failed: ${report.missingFonts.join(', ')}`);
      const png = await page.screenshot({ type: 'png', fullPage: false });
      const dest = path.join(OUT, size.name, `${n}.png`);
      fs.writeFileSync(dest, stripAlpha(png));
      console.log(
        `${size.name} ${n}  headline ${report.h1Lines} line(s), phone L${report.phoneLeft} R${report.phoneRight} B${report.phoneBottom}, gap ${report.phoneTop - report.headBottom}px` +
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
