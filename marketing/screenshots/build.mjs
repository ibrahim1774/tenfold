// Builds the five App Store screenshot pages (src/NN-slug.html) from one set of shared styles.
// Every screen is drawn at the iPhone 6.9" logical size (440 x 956 pt) with the app's own tokens
// (src/design/tokens.ts), then scaled into a phone frame with CSS zoom and tilted with CSS 3D transforms.
// Video areas show frames from licensed stock footage (footage/, see FOOTAGE.md).
// Run: node marketing/screenshots/build.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'src');
fs.mkdirSync(OUT, { recursive: true });
// Start clean so render.mjs only sees the pages written below.
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.html')) fs.unlinkSync(path.join(OUT, f));

// ---------------------------------------------------------------------------------------------
// Tokens (src/design/tokens.ts)
const C = {
  bg: '#000000',
  bgRaised: '#0C0C0E',
  card: '#141416',
  cardHigh: '#1E1E21',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  overlay: 'rgba(0,0,0,0.72)',
  text: '#ECECEF', // soft white (tokens `textPrimary`); pure white is the accent
  edge: 'rgba(255,255,255,0.10)',
  text2: '#9C9CA3',
  muted: '#6B6B72',
  // Black and white only (2026-09-29): the app's accent token is white.
  accent: '#FFFFFF',
  accentSoft: 'rgba(255,255,255,0.14)',
  danger: '#FF453A',
  dangerSoft: 'rgba(255,69,58,0.16)',
  success: '#30D158',
  ruler: '#6B6B72',
  waveform: '#8E8E95',
  // Timeline tracks (src/design/tokens.ts `track`)
  tText: '#F4D993', tTextIcon: '#FFF2DB', tTextInk: '#3A2E10',
  tAudio: '#D6C5FB', tAudioIcon: '#EFE8FF', tAudioInk: '#2C2146', tAudioWave: '#6A559E',
};

const SW = 440; // screen width, pt
const SH = 956; // screen height, pt
const TOP = 62; // safe area top
const BOTTOM = 34; // safe area bottom
const Z = 2.3; // pt -> px inside the phone frame

// ---------------------------------------------------------------------------------------------
// Deterministic noise
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Speech-like loudness 0..1 at time t (syllables with short gaps). */
function speech(t, seed = 1) {
  const s = Math.abs(Math.sin(t * 7.1 + seed)) * Math.abs(Math.sin(t * 2.3 + seed * 0.7));
  const phrase = 0.55 + 0.45 * Math.sin(t * 0.9 + seed * 1.3);
  return Math.max(0.05, Math.min(1, s * phrase * 1.25 + 0.08));
}

// ---------------------------------------------------------------------------------------------
// SF Symbols stand-ins: 24 x 24, regular weight, monochrome (docs/DESIGN.md §0).
const txt = (x, y, size, str, weight = 500, anchor = 'middle', fill = 'currentColor') =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}" stroke="none" font-family="-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif">${str}</text>`;
const dot = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;
const ICONS = {
  chevL: '<path d="M14.5 5L7.5 12l7 7"/>',
  chevR: '<path d="M9.5 5l7 7-7 7"/>',
  ellipsis: dot(5, 12, 1.8) + dot(12, 12, 1.8) + dot(19, 12, 1.8),
  plus: '<path d="M12 4.5v15M4.5 12h15"/>',
  minus: '<path d="M4.5 12h15"/>',
  undo: '<path d="M8.5 4.5L4 9l4.5 4.5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  redo: '<path d="M15.5 4.5L20 9l-4.5 4.5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>',
  play: '<path d="M7 4.6v14.8c0 .9 1 1.4 1.7 1l11.6-7.4c.7-.4.7-1.4 0-1.9L8.7 3.6C8 3.1 7 3.7 7 4.6z" fill="currentColor" stroke="none"/>',
  scissors: '<circle cx="6" cy="6.5" r="2.8"/><circle cx="6" cy="17.5" r="2.8"/><path d="M8.4 8.1L20.5 17.5M8.4 15.9L20.5 6.5"/>',
  trash: '<path d="M4 6.5h16M9.3 6.5V4.8c0-.5.4-.9.9-.9h3.6c.5 0 .9.4.9.9v1.7M6 6.5l.9 12.7c.1 1 .9 1.8 1.9 1.8h6.4c1 0 1.8-.8 1.9-1.8L18 6.5M10 10.5v6.5M14 10.5v6.5"/>',
  check: '<path d="M5 12.8l4.4 4.4L19 7.5"/>',
  textquote: '<path d="M4.5 5v14"/><path d="M9 7h11M9 12h11M9 17h7"/>',
  captions:
    '<path d="M5.5 4h13a3 3 0 013 3v7.5a3 3 0 01-3 3h-7.8L6 21v-3.5h-.5a3 3 0 01-3-3V7a3 3 0 013-3z"/><path d="M7 9h4M13.5 9H17M7 12.8h7.5"/>',
  textformat: txt(12, 17.2, 14.5, 'Aa', 500),
  zoom: '<circle cx="10.5" cy="10.5" r="6.8"/><path d="M15.5 15.5l5 5M10.5 7.5v6M7.5 10.5h6"/>',
  crop: '<path d="M6.5 2.5V16a1.5 1.5 0 001.5 1.5h13.5"/><path d="M2.5 6.5H16a1.5 1.5 0 011.5 1.5v13.5"/>',
  waveform: '<path d="M3 10.5v3M6.5 7.5v9M10 4v16M13.5 7v10M17 9v6M20.5 11v2"/>',
  download: '<path d="M12 3.2v11.3M7.8 10.4l4.2 4.2 4.2-4.2"/><path d="M8.2 7.8H6.5a2 2 0 00-2 2v8.7a2 2 0 002 2h11a2 2 0 002-2V9.8a2 2 0 00-2-2h-1.7"/>',
  speaker: '<path d="M3.5 9.3v5.4h3.6l5 4.3V5l-5 4.3z" fill="currentColor"/><path d="M15.5 9.2a4 4 0 010 5.6M18.2 6.6a7.6 7.6 0 010 10.8"/>',
  wavePath: '<path d="M2 12c1.7-4.7 3.4-4.7 5 0s3.3 4.7 5 0 3.3-4.7 5 0 3.3 4.7 5 0"/>',
  repeat: '<path d="M4 11.5V10a3 3 0 013-3h12.5"/><path d="M16.5 4l3 3-3 3"/><path d="M20 12.5V14a3 3 0 01-3 3H4.5"/><path d="M7.5 20l-3-3 3-3"/>',
  personWave: '<circle cx="9" cy="8" r="3.3"/><path d="M2.8 20.3c.5-3.7 3-5.8 6.2-5.8s5.7 2.1 6.2 5.8"/><path d="M16.3 5.6a4.2 4.2 0 010 5.8M18.9 3.4a7.6 7.6 0 010 10.2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21"/>',
  note: '<path d="M9.5 17.5V5.8l10-2.3v11.8"/><circle cx="7" cy="17.6" r="2.5" fill="currentColor"/><circle cx="17" cy="15.3" r="2.5" fill="currentColor"/>',
  ibeam: txt(8.5, 17.5, 15, 'A', 500) + '<path d="M18 4.5v15M16 4.5h4M16 19.5h4"/>',
  toLine: '<path d="M3 12h12.5M11 7.5l4.5 4.5-4.5 4.5M20 5v14"/>',
  eyeSlash: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="3"/><path d="M4.5 4.5l15 15"/>',
  textSize: txt(7, 18, 10, 'A', 500) + txt(16, 18, 17, 'A', 500),
  aSquare: '<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4.5" fill="currentColor" stroke="none"/>' + txt(12, 16.6, 12.5, 'A', 700, 'middle', '#000'),
  alignCenter: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  crownFill: '<path d="M4.5 15.5L3 7.3l5 3.6 4-6 4 6 5-3.6-1.5 8.2z" fill="currentColor"/><path d="M4.5 19h15"/>',
  video: '<rect x="2.5" y="6" width="13" height="12" rx="2.8"/><path d="M15.5 10.4L21 7.4v9.2l-5.5-3z"/>',
  iphone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><path d="M10.6 5.2h2.8"/>',
  speakerSlash: '<path d="M3.5 9.3v5.4h3.6l5 4.3V5l-5 4.3z" fill="currentColor"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>',
  houseFill: '<path d="M2.8 11.3L12 3.8l9.2 7.5"/><path d="M5.3 9.6V19a1.3 1.3 0 001.3 1.3h3.6v-5.6h3.6v5.6h3.6a1.3 1.3 0 001.3-1.3V9.6L12 4.2z" fill="currentColor"/>',
  filmStack: '<rect x="3" y="7.5" width="18" height="12.8" rx="2.5"/><path d="M5.8 4.6h12.4"/><path d="M7.8 7.5v12.8M16.2 7.5v12.8M3 13.9h4.8M16.2 13.9H21"/>',
  gear:
    '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.8"/>' +
    Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      const x1 = 12 + Math.cos(a) * 6.8;
      const y1 = 12 + Math.sin(a) * 6.8;
      const x2 = 12 + Math.cos(a) * 9.4;
      const y2 = 12 + Math.sin(a) * 9.4;
      return `<path d="M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}" stroke-width="2.6"/>`;
    }).join(''),
  photos: '<rect x="2.5" y="6.5" width="15" height="13" rx="2.5"/><path d="M6.5 3.5h12a3 3 0 013 3v9"/><path d="M2.5 16.5l4.2-4 3.3 3 2.6-2.3 5.4 4.8"/>',
  triDown: '<path d="M3.5 5.5h17l-8.5 13z" fill="currentColor" stroke="none"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
  shift: '<path d="M12 4l7.5 8H15v7H9v-7H4.5z"/>',
  del: '<path d="M8.5 5.5H20a1.5 1.5 0 011.5 1.5v10a1.5 1.5 0 01-1.5 1.5H8.5L2.8 12z"/><path d="M11.5 9.5l5 5M16.5 9.5l-5 5"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14.3c2.2 2.4 5.8 2.4 8 0"/>' + dot(9, 9.6, 1.2) + dot(15, 9.6, 1.2),
};
function ic(name, size = 22, color = C.text, sw = 1.7, extra = '') {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="color:${color};${extra}">${ICONS[name]}</svg>`;
}

// ---------------------------------------------------------------------------------------------
// Neutral "clip" area: no footage, just a soft charcoal field with a quiet abstract shape.
let gid = 0;
function clipArt(seed = 1, { frame = false, dim = 0 } = {}) {
  const r = rng(seed * 97 + 13);
  const id = `g${++gid}`;
  const cx = 30 + r() * 40;
  const cy = 30 + r() * 30;
  const rad = 38 + r() * 20;
  const arcY = 95 + r() * 30;
  return `<div class="clipart" style="background:linear-gradient(${150 + Math.round(r() * 40)}deg,#1A1A1E 0%,#131316 55%,#0E0E10 100%)">
    <svg viewBox="0 0 90 160" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
      <defs><radialGradient id="${id}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.075"/><stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient></defs>
      <circle cx="${cx}" cy="${cy}" r="${rad}" fill="url(#${id})"/>
      <path d="M-5 ${arcY} C 25 ${arcY - 22}, 60 ${arcY + 18}, 95 ${arcY - 8}" stroke="#FFFFFF" stroke-opacity="0.05" stroke-width="0.8" fill="none"/>
      <path d="M-5 ${arcY + 9} C 30 ${arcY - 10}, 58 ${arcY + 26}, 95 ${arcY + 2}" stroke="#FFFFFF" stroke-opacity="0.035" stroke-width="0.6" fill="none"/>
      ${frame ? `<rect x="20" y="24" width="50" height="88.9" rx="3" fill="none" stroke="#FFFFFF" stroke-opacity="0.09" stroke-width="0.6" stroke-dasharray="2 2"/>` : ''}
    </svg>
    ${dim ? `<div class="fill" style="background:rgba(0,0,0,${dim})"></div>` : ''}
  </div>`;
}

// ---------------------------------------------------------------------------------------------
// Footage: a still frame from a stock clip, filling its container (object-fit: cover).
const FOOT = {
  a1: 'mixkit-34487-1_8s', // vlogger with a phone on a gimbal, outdoors
  a2: 'mixkit-34487-4_2s',
  a3: 'mixkit-34487-6_0s',
  a4: 'mixkit-34487-8_2s',
  b2: 'mixkit-42319-4_9s', // redhead talking to her phone, cereal-box wall (UGC style)
  b4: 'mixkit-42319-7_7s',
  c1: 'mixkit-42323-12_6s', // close selfie, curly hair, cereal-box wall
  c2: 'mixkit-42323-2_5s',
  c3: 'mixkit-41290-2_0s', // close-up of a man talking into the camera, blue light
  d1: 'mixkit-39813-0_5s', // woman with an earbud, balcony at dusk
  d2: 'mixkit-39813-3_2s',
  d3: 'mixkit-39813-7_0s',
  d4: 'mixkit-39813-8_3s',
  e1: 'mixkit-39814-3_0s', // same woman, a second take
  e2: 'mixkit-39814-5_5s',
  e3: 'mixkit-39814-6_5s',
};
const footSrc = (k) => `../footage/${FOOT[k]}.jpg`;
function foot(k, pos = '50% 35%') {
  return `<img class="foot" src="${footSrc(k)}" alt="" style="object-position:${pos}">`;
}

// ---------------------------------------------------------------------------------------------
// Shared CSS
const CSS = `
@font-face{font-family:'TikTok Sans';src:url('../../../assets/fonts/TikTokSans_800ExtraBold.ttf');font-weight:800}
@font-face{font-family:'Poppins';src:url('../../../assets/fonts/Poppins_700Bold.ttf');font-weight:700}
@font-face{font-family:'Comic Neue';src:url('../../../assets/fonts/ComicNeue_700Bold.ttf');font-weight:700}
@font-face{font-family:'Inter Black';src:url('../../../assets/fonts/Inter_900Black.ttf');font-weight:900}
@font-face{font-family:'Inter';src:url('../../../assets/fonts/Inter_400Regular.ttf');font-weight:400}
@font-face{font-family:'Inter';src:url('../../../assets/fonts/Inter_500Medium.ttf');font-weight:500}
@font-face{font-family:'Inter';src:url('../../../assets/fonts/Inter_600SemiBold.ttf');font-weight:600}
@font-face{font-family:'Inter';src:url('../../../assets/fonts/Inter_700Bold.ttf');font-weight:700}
@font-face{font-family:'Bebas Neue';src:url('../../../assets/fonts/BebasNeue_400Regular.ttf');font-weight:400}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#0A0B0D}
body{font-family:Inter,sans-serif;color:#fff;-webkit-font-smoothing:antialiased;overflow:hidden}
.stage{position:relative;width:1320px;height:2868px;overflow:hidden;background:linear-gradient(180deg,#0F1114 0%,#0A0B0D 100%)}
body.s67 .stage{zoom:0.977273;height:2861px}
.head{position:absolute;left:96px;right:96px;top:168px;text-align:left;z-index:5}
h1{font-family:Inter,sans-serif;font-size:92px;line-height:104px;font-weight:600;letter-spacing:-3px;color:#fff}
h1 span{white-space:nowrap}
h1 em{font-style:normal;color:#8E8E93}
.sub{margin-top:28px;font-size:38px;line-height:48px;color:#A0A3A8;font-weight:400;letter-spacing:-0.6px;white-space:nowrap}
/* Phone: a flat device, tilted in 3D. The wrapper holds the perspective; the device carries the transform. */
.pw{position:absolute;left:0;top:0;width:1320px;height:2868px;perspective:3400px;pointer-events:none}
.phone{position:absolute;width:${SW * Z + 44}px;height:${SH * Z + 44}px;border-radius:118px;padding:22px;transform-style:preserve-3d;
  background:linear-gradient(135deg,#3A3B40 0%,#1B1C20 18%,#121316 50%,#1B1C20 82%,#34353A 100%);
  box-shadow:inset 0 0 0 2px rgba(255,255,255,.10),inset 0 0 0 7px #0B0B0D,inset 0 0 0 8px rgba(255,255,255,.05),0 80px 160px rgba(0,0,0,.55),0 30px 60px rgba(0,0,0,.45)}
.phone .edge3d{position:absolute;inset:0;border-radius:118px;background:#0C0D0F;transform:translateZ(-26px);box-shadow:0 0 0 1px rgba(255,255,255,.06)}
.phone .btnL,.phone .btnR{position:absolute;width:8px;border-radius:4px;background:linear-gradient(90deg,#2A2B30,#44454B,#2A2B30)}
.phone .glare{position:absolute;left:22px;top:22px;right:22px;bottom:22px;border-radius:${42 * Z}px;pointer-events:none;z-index:60;
  background:linear-gradient(118deg,rgba(255,255,255,.05) 0%,rgba(255,255,255,.035) 30%,rgba(255,255,255,0) 31%,rgba(255,255,255,0) 100%)}
.scr{position:relative;width:${SW}px;height:${SH}px;zoom:${Z};overflow:hidden;border-radius:42px;background:#000;color:${C.text};font-size:15px;line-height:20px}
.foot{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block}
.abs{position:absolute}
.fill{position:absolute;top:0;left:0;right:0;bottom:0}
.clipart{position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden}
.clipart svg{position:absolute;top:0;left:0;display:block}
.ic{display:block;flex:none}
.row{display:flex;flex-direction:row;align-items:center}
.col{display:flex;flex-direction:column}
.tab{font-variant-numeric:tabular-nums}
.t30{font-size:30px;line-height:36px;font-weight:700;letter-spacing:.2px}
.t20{font-size:20px;line-height:25px;font-weight:600;letter-spacing:-.2px}
.t15{font-size:15px;line-height:20px;font-weight:400}
.t15b{font-size:15px;line-height:20px;font-weight:600}
.t14{font-size:14px;line-height:18px;font-weight:500}
.t13{font-size:13px;line-height:18px;font-weight:400}
.t12{font-size:12px;line-height:16px;font-weight:400}
.c2{color:${C.text2}}.cm{color:${C.muted}}.ca{color:${C.accent}}
.ell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* status bar, island, home indicator */
.sb-time{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;position:absolute;top:19px;left:28px;width:108px;text-align:center;font-size:17px;line-height:22px;font-weight:600;letter-spacing:-.2px}
.sb-right{position:absolute;top:22px;right:30px;display:flex;align-items:center;gap:7px}
.island{position:absolute;top:11px;left:50%;margin-left:-63px;width:126px;height:37px;border-radius:19px;background:#000;box-shadow:0 0 0 .6px rgba(255,255,255,.05);z-index:50}
.home{position:absolute;bottom:8px;left:50%;margin-left:-73px;width:146px;height:5px;border-radius:3px;background:#fff;z-index:50}
/* components */
.card{background:${C.card};border-radius:14px;border:1px solid ${C.border};overflow:hidden}
.ib{width:44px;height:44px;border-radius:22px;display:flex;align-items:center;justify-content:center;flex:none}
.ib.o{background:${C.cardHigh}}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;background:#fff;color:#000;font-size:15px;line-height:20px;font-weight:600;padding:0 16px;flex:none}
.obtn{display:flex;align-items:center;justify-content:center;gap:10px;background:${C.cardHigh};color:#fff;font-size:15px;line-height:20px;font-weight:600;padding:0 16px;border-radius:12px}
.chip{height:36px;border-radius:18px;padding:0 14px;display:flex;align-items:center;gap:6px;background:${C.cardHigh};border:1px solid ${C.border};font-size:14px;line-height:18px;font-weight:500;white-space:nowrap}
.chip.on{background:#fff;border-color:#fff;color:#000}
.tools{display:flex;gap:2px}
.tool{flex:1;min-height:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:0 2px;color:${C.text2};font-size:12px;line-height:16px;white-space:nowrap}
.tool .tile{width:42px;height:42px;border-radius:13px;display:flex;align-items:center;justify-content:center;background:#1C1C1E;border:.5px solid ${C.edge}}
.tool.on{color:${C.text}}.tool.on .tile{background:#3A3A3C}
.tool.danger{color:${C.danger}}
.tool.white{color:#fff}
.tool.off{opacity:.5;color:${C.muted}}
.panel{background:${C.card};border-radius:14px;border:1px solid ${C.border};padding:16px;display:flex;flex-direction:column;gap:16px}
.editact{display:flex;align-items:center;gap:6px;height:44px;padding:0 14px;border-radius:22px;background:${C.card};border:1px solid ${C.border};font-size:14px;line-height:18px;font-weight:500;flex:none}
.group{background:${C.card};border-radius:14px;border:1px solid ${C.border};overflow:hidden}
.grow{min-height:48px;display:flex;align-items:center;gap:12px;padding:10px 16px}
.div{height:.5px;margin-left:16px;background:${C.borderStrong}}
.glabel{font-size:12px;line-height:16px;color:${C.muted};letter-spacing:.4px;margin-left:16px;margin-bottom:8px}
.seg{display:flex;gap:2px;padding:2px;border-radius:10px;background:#000}
.segi{flex:1;min-height:40px;display:flex;align-items:center;justify-content:center;border-radius:8px;font-size:14px;line-height:18px;font-weight:500;padding:0 4px;white-space:nowrap}
.segi.on{background:#fff;color:#000}
.toggle{width:38px;height:22px;border-radius:11px;border:1.5px solid #fff;background:#000;position:relative;flex:none}
.toggle i{position:absolute;top:2.5px;left:18.5px;width:14px;height:14px;border-radius:7px;background:#fff}
/* timeline */
.tl{position:relative;width:${SW}px;overflow:hidden}
.tick{position:absolute;top:2px;font-size:12px;line-height:16px;color:${C.ruler};font-variant-numeric:tabular-nums}
.tdot{position:absolute;top:9px;width:2px;height:2px;border-radius:1px;background:${C.ruler}}
.region{position:absolute;top:6px;height:44px;border-radius:10px;overflow:hidden;background:${C.cardHigh}}
.frame{position:absolute;top:0;height:44px;border-right:1px solid rgba(0,0,0,.35)}
.handle{position:absolute;top:10px;width:11px;height:36px;border-radius:5px;background:#E5E5EA;display:flex;align-items:center;justify-content:center}
.handle i{width:3px;height:16px;border-radius:1.5px;background:#3A3A3F}
.edgeframe{position:absolute;border:2px solid}
.edge{position:absolute;top:-2px;bottom:-2px;width:12px;display:flex;align-items:center;justify-content:center}
.edge i{width:2px;height:45%;border-radius:1px;background:rgba(0,0,0,.55)}
.capchip{position:absolute;top:4px;height:26px;padding:0 8px 0 3px;border-radius:8px;display:flex;align-items:center;gap:6px;background:${C.tText};color:${C.tTextInk};overflow:hidden}
.capchip span{font-size:12px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.ticon{width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;flex:none}
.snd{position:absolute;border-radius:8px;overflow:hidden}
.sndlabel{position:absolute;top:3px;left:3px;right:6px;display:flex;align-items:center;gap:6px;font-size:12px;line-height:16px;white-space:nowrap;color:${C.tAudioInk}}
.bar{position:absolute;width:2px;border-radius:1px}
.clipdiv{position:absolute;top:6px;width:2px;height:44px;background:#000}
.cliptitle{position:absolute;top:9px;padding:0 6px;height:18px;display:flex;align-items:center;border-radius:6px;background:rgba(0,0,0,.55);font-size:12px;line-height:16px;white-space:nowrap}
.addclip{position:absolute;top:6px;width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:${C.cardHigh}}
.playhead{position:absolute;top:12px;bottom:0;width:12px;display:flex;flex-direction:column;align-items:center}
.playhead b{flex:1;width:2px;margin-top:-2px;background:${C.accent};border-radius:1px}
`;

// ---------------------------------------------------------------------------------------------
// Chrome
function statusBar() {
  const bars = [4, 6.5, 9, 11.5]
    .map((h, i) => `<rect x="${i * 4.6}" y="${12 - h}" width="3.2" height="${h}" rx="1" fill="#fff"/>`)
    .join('');
  return `<div class="sb-time">9:41</div>
  <div class="sb-right">
    <svg width="18" height="12" viewBox="0 0 18 12">${bars}</svg>
    <svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 11.6l2.3-2.5a3.3 3.3 0 00-4.6 0z" fill="#fff"/><path d="M4.2 7a6.2 6.2 0 018.6 0" stroke="#fff" stroke-width="1.7" fill="none" stroke-linecap="round"/><path d="M1.6 4.3a10 10 0 0113.8 0" stroke="#fff" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>
    <svg width="28" height="13" viewBox="0 0 28 13"><rect x=".6" y=".6" width="23.6" height="11.8" rx="3.6" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="1.1"/><rect x="2.3" y="2.3" width="20.2" height="8.4" rx="2.2" fill="#fff"/><path d="M25.6 4.4v4.2c.9-.3 1.5-1.2 1.5-2.1s-.6-1.8-1.5-2.1z" fill="#fff" fill-opacity=".45"/></svg>
  </div>`;
}

const PW = SW * Z + 44; // device width, px (before the 3D transform)
const PH = SH * Z + 44;
/**
 * One device. `cx`/`cy` place its centre on the 1320 x 2868 stage; `t` is the 3D tilt, applied about that centre.
 */
function device({ screen, cx, cy, t, z = 1, capture }) {
  // A real simulator capture (captures/NAME.png, 1206 x 2622, same aspect as the screen) replaces the
  // HTML screen. It already has its own status bar and home indicator, so only the island is drawn on top.
  if (capture) screen = `<img src="../captures/${capture}.png" style="position:absolute;inset:0;width:100%;height:100%;display:block">`;
  return `<div class="phone" style="left:${cx - PW / 2}px;top:${cy - PH / 2}px;transform:${t};z-index:${z}">
      <div class="edge3d"></div>
      <div class="btnL" style="left:-5px;top:430px;height:120px"></div>
      <div class="btnL" style="left:-5px;top:590px;height:190px"></div>
      <div class="btnL" style="left:-5px;top:810px;height:190px"></div>
      <div class="btnR" style="right:-5px;top:640px;height:300px"></div>
      <div class="scr">
        ${screen}
        ${capture ? '' : statusBar()}
        <div class="island"></div>
        ${capture ? '' : '<div class="home"></div>'}
      </div>
      <div class="glare"></div>
    </div>`;
}

function page({ n, slug, lines, sub, phones }) {
  const [l1, l2] = lines;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1320">
<title>Tenfold ${n} ${slug}</title>
<!-- Generated by marketing/screenshots/build.mjs. Edit that file, not this one. -->
<style>${CSS}</style>
</head>
<body>
<div class="stage">
  <div class="head">
    <h1><span>${l1}</span><br><span><em>${l2}</em></span></h1>
    <div class="sub">${sub}</div>
  </div>
  <div class="pw">
    ${phones.map(device).join('\n')}
  </div>
</div>
<script>if(new URLSearchParams(location.search).get('size')==='6.7')document.body.classList.add('s67');</script>
</body>
</html>
`;
  fs.writeFileSync(path.join(OUT, `${n}-${slug}.html`), html);
}

// ---------------------------------------------------------------------------------------------
// App building blocks

/** ScreenHeader: ghost back circle, title (20), right actions. Top = safe area + 4. */
function screenHeader(title, right = '', top = TOP + 4) {
  return `<div class="abs row" style="top:${top}px;left:20px;right:20px;min-height:52px;gap:8px">
    <div class="ib">${ic('chevL', 20)}</div>
    <div class="t20 ell" style="flex:1">${title}</div>
    ${right ? `<div class="row" style="gap:10px">${right}</div>` : ''}
  </div>`;
}

function progressRing(p, size, stroke, label) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return `<div style="position:relative;width:${size}px;height:${size}px;flex:none">
    <svg width="${size}" height="${size}" style="transform:rotate(-90deg);display:block">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="rgba(255,255,255,0.14)" stroke-width="${stroke}" fill="none"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${C.accent}" stroke-width="${stroke}" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/>
    </svg>
    ${label ? `<div class="fill row" style="justify-content:center">${label}</div>` : ''}
  </div>`;
}

const TOOLS = [
  ['cuts', 'scissors', 'Cuts'],
  ['words', 'textquote', 'Words'],
  ['captions', 'captions', 'Captions'],
  ['text', 'textformat', 'Text'],
  ['zoom', 'zoom', 'Zoom'],
  ['crop', 'crop', 'Frame'],
  ['audio', 'waveform', 'Audio'],
];
function toolBar(active) {
  return `<div class="tools">${TOOLS.map(
    ([id, icon, label]) =>
      `<div class="tool${active === id ? ' on' : ''}"><div class="tile">${ic(icon, 20, active === id ? C.text : C.text2)}</div><span>${label}</span></div>`,
  ).join('')}</div>`;
}
/** ActionBar: [icon, label, kind] kind: 'danger' | 'on' | 'off' | '' */
function actionBar(actions) {
  return `<div class="tools">${actions
    .map(([icon, label, kind = '']) => {
      const color = kind === 'danger' ? C.danger : kind === 'off' ? C.muted : C.text;
      const cls = kind === 'on' ? 'on' : kind === 'danger' ? 'danger' : kind === 'off' ? 'off' : 'white';
      return `<div class="tool ${cls}"><div class="tile">${ic(icon, 20, color)}</div><span>${label}</span></div>`;
    })
    .join('')}</div>`;
}

function edgeFrame(left, width, top, height, radius, color) {
  return `<div class="edgeframe" style="left:${left}px;width:${width}px;top:${top}px;height:${height}px;border-radius:${radius}px;border-color:${color}">
    <div class="edge" style="left:-8px;border-radius:6px 0 0 6px;background:${color}"><i></i></div>
    <div class="edge" style="right:-8px;border-radius:0 6px 6px 0;background:${color}"><i></i></div>
  </div>`;
}

const PPS = 46;
/**
 * The editor timeline (src/editor/Timeline.tsx): playhead fixed in the middle, the strip scrolled under it.
 * Tracks: ruler 24, clips 56, captions 4+34, original sound 4+48, added sounds 2 + rows*34 + 4.
 */
function timeline(o) {
  const { total, time, points = [], cards = [], selCard = -1, selRegion = null, originals = [[0, total]], sounds = [], clips = null, selClip = -1, addTile = false, seed = 3, muted = false, strip = null } = o;
  const pad = SW / 2;
  const x = (t) => pad + (t - time) * PPS;
  const soundRows = sounds.length ? Math.max(...sounds.map((s) => s.row)) + 1 : 0;
  const H = 24 + 56 + 38 + 52 + (soundRows ? 2 + soundRows * 34 + 4 : 0);
  const step = total > 40 ? 10 : total > 16 ? 5 : 2;
  let h = `<div class="tl" style="height:${H}px">`;
  // ruler
  for (let t = 0; t <= total + 0.01; t += step) {
    h += `<div class="tick" style="left:${x(t)}px">${t < 60 ? `${t}s` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`}</div>`;
    if (t + step <= total + 0.01) for (const f of [0.25, 0.5, 0.75]) h += `<div class="tdot" style="left:${x(t + step * f) + 10}px"></div>`;
  }
  // clip track (top 24)
  h += `<div class="abs" style="top:24px;left:0;right:0;height:56px">`;
  const pts = [...new Set([0, ...points, total])].sort((a, b) => a - b);
  const fr = rng(seed);
  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i];
    const e = pts[i + 1];
    const w = Math.max(4, (e - s) * PPS - 2);
    const n = Math.ceil(w / 34);
    let frames = '';
    for (let k = 0; k < n; k++) {
      const a = 34 + Math.round(fr() * 10);
      const b = 22 + Math.round(fr() * 6);
      // Filmstrip: the clip's own frames when footage is given, otherwise a neutral gradient.
      const clipKey = clips ? clips.find((c) => s >= c.s - 1e-3 && s < c.e - 1e-3)?.strip : null;
      const key = clipKey ? clipKey[k % clipKey.length] : strip ? strip[(i + k) % strip.length] : null;
      frames += key
        ? `<div class="frame" style="left:${k * 34}px;width:34px;background:url('${footSrc(key)}') center 30%/cover"></div>`
        : `<div class="frame" style="left:${k * 34}px;width:34px;background:linear-gradient(180deg,rgb(${a},${a},${a + 4}) 0%,rgb(${b},${b},${b + 3}) 100%)"></div>`;
    }
    const isSel = selRegion && Math.abs(selRegion[0] - s) < 1e-3;
    h += `<div class="region" style="left:${x(s) + 1}px;width:${w}px">${frames}${isSel ? '<div class="fill" style="background:rgba(255,255,255,0.12)"></div>' : ''}</div>`;
  }
  for (const s of pts) h += `<div class="handle" style="left:${x(s) - 5}px"><i></i></div>`;
  if (clips) {
    clips.slice(1).forEach((c) => (h += `<div class="clipdiv" style="left:${x(c.s) - 1}px"></div>`));
    clips.forEach((c) => {
      if ((c.e - c.s) * PPS > 48) h += `<div class="cliptitle" style="left:${x(c.s) + 6}px;max-width:${(c.e - c.s) * PPS - 14}px">${c.title}</div>`;
    });
    if (selClip >= 0) {
      const c = clips[selClip];
      h += edgeFrame(x(c.s) + 1, Math.max(4, (c.e - c.s) * PPS - 2), 6, 44, 10, C.accent);
    }
  }
  if (selRegion) h += edgeFrame(x(selRegion[0]) + 1, Math.max(4, (selRegion[1] - selRegion[0]) * PPS - 2), 6, 44, 10, '#FFFFFF');
  if (addTile) h += `<div class="addclip" style="left:${x(total) + 12}px">${ic('plus', 20)}</div>`;
  h += `</div>`;
  // caption track (top 84)
  h += `<div class="abs" style="top:84px;left:0;right:0;height:34px">`;
  cards.forEach((c, i) => {
    const sel = i === selCard;
    h += `<div class="capchip" style="left:${x(c.s)}px;width:${Math.max(28, (c.e - c.s) * PPS - 4)}px;${sel ? `background:${C.tTextIcon}` : ''}"><div class="ticon" style="background:${C.tTextIcon}">${ic('textformat', 12, C.tTextInk)}</div><span>${c.text}</span></div>`;
  });
  if (selCard >= 0) {
    const c = cards[selCard];
    h += edgeFrame(x(c.s), Math.max(28, (c.e - c.s) * PPS - 4), 4, 26, 8, C.accent);
  }
  h += `</div>`;
  // original sound lane (top 122)
  h += `<div class="abs" style="top:122px;left:0;right:0;height:48px">
    <div class="abs" style="top:23px;left:${x(0)}px;width:${total * PPS}px;height:.5px;background:${C.borderStrong}"></div>`;
  for (const [s, e] of originals) {
    const w = Math.max(4, (e - s) * PPS - 2);
    let bars = '';
    for (let px = 0; px < w; px += 4) {
      const v = muted ? 0 : speech(s + px / PPS, seed);
      const bh = Math.max(2, v * 32);
      bars += `<div class="bar" style="left:${px}px;top:${(40 - bh) / 2}px;height:${bh}px;background:${C.tAudioWave}"></div>`;
    }
    h += `<div class="snd" style="top:4px;height:40px;left:${x(s) + 1}px;width:${w}px;background:${C.tAudio}">${bars}${
      w > 70 ? `<div class="sndlabel"><div class="ticon" style="background:${C.tAudioIcon}">${ic('speaker', 11, C.tAudioInk, 1.6)}</div><span>Original</span></div>` : ''
    }</div>`;
  }
  h += `</div>`;
  // added sounds (top 172)
  if (soundRows) {
    h += `<div class="abs" style="top:172px;left:0;right:0;height:${soundRows * 34 + 4}px">`;
    for (const snd of sounds) {
      const w = Math.max(28, (snd.e - snd.s) * PPS - 4);
      const sr = rng(snd.row * 31 + 7);
      let bars = '';
      for (let px = 0; px < w; px += 4) {
        const v = snd.kind === 'voice' ? speech(px / PPS + 3, 7) : 0.45 + 0.35 * Math.sin(px / 9) * Math.sin(px / 23) + sr() * 0.2;
        bars += `<div class="bar" style="left:${px}px;bottom:2px;height:${2 + Math.max(0, Math.min(1, v)) * 20 * Math.min(1, 0.35 + snd.vol * 0.65)}px;background:${C.tAudioWave};opacity:.45"></div>`;
      }
      h += `<div class="snd" style="top:${4 + snd.row * 34}px;height:26px;left:${x(snd.s)}px;width:${w}px;background:${snd.sel ? C.tAudioIcon : C.tAudio}">${bars}
        <div class="sndlabel"><div class="ticon" style="background:${C.tAudioIcon}">${ic(snd.kind === 'voice' ? 'mic' : 'note', 11, C.tAudioInk, 1.6)}</div><span>${snd.title}</span></div></div>`;
      if (snd.sel) h += edgeFrame(x(snd.s), w, 4 + snd.row * 34, 26, 8, C.accent);
    }
    h += `</div>`;
  }
  // playhead
  h += `<div class="playhead" style="left:${pad - 6}px">${ic('triDown', 12, C.accent)}<b></b></div>`;
  h += `</div>`;
  return h;
}

/**
 * The editor screen (src/app/editor/[projectId].tsx): header, fixed preview (max 440 pt tall), transport,
 * then a scroll view with the tool row, timeline, edit bar and panel.
 */
function editor({ title, aspect = 9 / 16, preview = '', badge = '0:48 → 0:34', time = '0:12', total = '0:34', playButton = true, scroll, offset = 0, seed = 2, frameContent }) {
  const maxH = Math.min(460, SH * 0.46);
  const frameW = Math.round(Math.min(SW - 40, maxH * aspect));
  const frameH = Math.round(frameW / aspect);
  const previewTop = TOP + 4 + 52;
  const fx = (SW - frameW) / 2;
  const fy = previewTop + (maxH - frameH) / 2;
  return `
  ${screenHeader(title, `<div class="ib o">${ic('ellipsis', 20)}</div><div class="btn" style="height:44px;border-radius:22px">Export</div>`)}
  <div class="abs" style="left:${fx}px;top:${fy}px;width:${frameW}px;height:${frameH}px;overflow:hidden;background:#000">
    ${frameContent ?? clipArt(seed, { frame: false })}
    ${preview}
    ${playButton ? `<div class="abs row" style="left:50%;top:50%;margin:-30px 0 0 -30px;width:60px;height:60px;border-radius:30px;background:rgba(0,0,0,.45);justify-content:center;padding-left:4px">${ic('play', 26)}</div>` : ''}
    ${badge ? `<div class="abs row t12 tab" style="top:12px;left:12px;height:28px;border-radius:14px;padding:0 10px;background:rgba(0,0,0,.6)">${badge}</div>` : ''}
  </div>
  <div class="abs row" style="top:${previewTop + maxH + 12}px;left:20px;right:20px;height:52px;justify-content:space-between">
    <div class="row" style="flex:1;gap:4px"><div class="ib">${ic('undo', 20)}</div><div class="ib" style="opacity:.35">${ic('redo', 20)}</div></div>
    <div class="row" style="width:52px;height:52px;justify-content:center">${ic('play', 26)}</div>
    <div class="row t13 tab" style="flex:1;justify-content:flex-end">${time}<span class="cm">&nbsp;/ ${total}</span></div>
  </div>
  <div class="abs" style="top:${previewTop + maxH + 64}px;left:0;right:0;bottom:0;overflow:hidden">
    <div style="transform:translateY(${-offset}px)">${scroll}</div>
  </div>`;
}
const gutter = (inner, style = '') => `<div style="padding:0 20px;${style}">${inner}</div>`;
const toolRow = (inner) => gutter(inner, 'margin-top:8px;margin-bottom:16px');
function editBar({ split = true, del = null, hint = '', hintColor = C.muted }) {
  return gutter(
    `<div class="row" style="gap:8px">
      ${split ? `<div class="editact">${ic('scissors', 15)}<span>Split</span></div>` : ''}
      ${del !== null ? `<div class="editact" style="${del ? `color:${C.danger}` : 'opacity:.5;color:' + C.muted}">${ic('trash', 15, del ? C.danger : C.muted)}<span>Delete</span></div>` : ''}
      <div class="t12" style="flex:1;margin-left:4px;color:${hintColor}">${hint}</div>
    </div>`,
    'margin-top:12px',
  );
}

// Script of the sample take, as caption cards (composition seconds).
const CARDS = [
  { s: 0.2, e: 1.5, text: 'so here’s the thing' },
  { s: 1.6, e: 3.0, text: 'most people edit' },
  { s: 3.1, e: 4.4, text: 'every single video' },
  { s: 4.5, e: 5.9, text: 'one at a time' },
  { s: 6.0, e: 7.6, text: 'and that takes hours' },
  { s: 7.7, e: 9.2, text: 'so I batch them' },
  { s: 9.3, e: 10.9, text: 'film ten takes' },
  { s: 11.0, e: 12.3, text: 'and this is' },
  { s: 12.4, e: 14.3, text: 'the part that matters' },
  { s: 14.4, e: 15.9, text: 'it cuts the pauses' },
  { s: 16.0, e: 17.6, text: 'and the filler words' },
];
const CUT_POINTS = [2.1, 5.4, 8.9, 11.2, 14.6, 17.3, 21.0, 24.4, 27.8, 31.1];

/** A caption drawn on the preview in the Pop preset (Poppins Bold, white, black outline, #FFE14D spoken word). */
function popCaption(words, active, { top, size = 21 }) {
  return `<div class="abs" style="left:10px;right:10px;top:${top}px;text-align:center;font-family:'Poppins';font-weight:700;font-size:${size}px;line-height:${Math.round(size * 1.25)}px;color:#fff;-webkit-text-stroke:0;paint-order:stroke fill;text-shadow:0 0 1.5px #000,0 0 1.5px #000,0 1.5px 3px rgba(0,0,0,.55)">${words
    .map((w, i) => (i === active ? `<span style="color:#FFE14D;display:inline-block;transform:scale(1.1);margin:0 2px">${w}</span>` : w))
    .join(' ')}</div>`;
}

// Extra SF Symbol stand-ins used by the export screen.
ICONS.xmark = '<path d="M6 6l12 12M18 6L6 18"/>';
ICONS.arrowUR = '<path d="M7 17L17 7M9 7h8v8"/>';
ICONS.share = '<path d="M12 3.5v11M8 7.3l4-3.8 4 3.8"/><path d="M8.5 10H7a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2h-1.5"/>';

// 3D tilts. Negative rotateY turns the screen toward the left of the canvas.
const tilt = (ry, rx, rz, s) => `rotateY(${ry}deg) rotateX(${rx}deg) rotateZ(${rz}deg) scale(${s})`;

// =============================================================================================
// Seven pages. 02, 03 and 04 are real simulator captures (captures/*.png, status bar set to 9:41).

// 01: Batch results (mockup: the simulator can't transcribe, so real results show no cuts)
{
  const cards = [
    ['Take 1', '0:52 → 0:37', 'a1', '50% 20%'],
    ['Take 2', '0:48 → 0:34', 'b2', '50% 20%'],
    ['Take 3', '1:04 → 0:47', 'c1', '50% 25%'],
    ['Take 4', '0:39 → 0:28', 'd3', '50% 30%'],
  ];
  const tile = ([t, d, k, pos]) => `<div class="col" style="width:194px;gap:8px">
      <div style="position:relative;width:194px;height:230px;border-radius:12px;overflow:hidden;border:.5px solid ${C.border};background:${C.card}">${foot(k, pos)}
        <div class="abs t12 tab" style="left:8px;bottom:8px;padding:2px 6px;border-radius:6px;background:${C.overlay}">${d}</div>
      </div>
      <div class="col" style="gap:2px"><div class="t14">${t}</div><div class="t12 cm">Captions · Filler words · Pauses</div></div>
    </div>`;
  const screen = `
    ${screenHeader('Product takes', `<div class="ib o" style="width:46px;height:46px">${ic('ellipsis', 20)}</div>`)}
    <div class="abs row" style="top:130px;left:20px;right:20px;gap:20px">
      ${progressRing(1, 84, 6, '<span class="t14 tab">100%</span>')}
      <div class="col" style="flex:1;gap:2px"><div class="t20 tab">10 of 10 ready</div><div class="t13 c2">Tap a video to review it</div></div>
    </div>
    <div class="abs" style="top:242px;left:20px;right:20px;display:flex;flex-wrap:wrap;column-gap:12px;row-gap:20px">
      ${cards.map(tile).join('')}
    </div>
    <div class="abs col" style="left:0;right:0;bottom:0;padding:12px 20px ${BOTTOM + 8}px;gap:8px;background:rgba(0,0,0,.96);border-top:.5px solid ${C.border}">
      <div class="t12 c2 tab" style="text-align:center">294 exports left this month</div>
      <div class="btn" style="height:52px;border-radius:26px">${ic('download', 18, '#000', 2)}<span>Export 10 videos</span></div>
    </div>`;
  page({
    n: '01',
    slug: 'batch',
    lines: ['Batch edit', 'your videos'],
    sub: '10 takes in, 10 finished videos out',
    phones: [{ screen, cx: 680, cy: 1610, t: tilt(-15, 7, 2.5, 0.94) }],
  });
}

// 02: Batch setup with 10 clips, four edits picked (src/app/batch/setup.tsx)
page({
  n: '02',
  slug: 'edits',
  lines: ['Edit everything', 'at once'],
  sub: 'Pick your edits once, for every clip',
  phones: [{ capture: 'edits', cx: 680, cy: 1610, t: tilt(14, 7, -2.5, 0.94) }],
});

// 03: Onboarding payoff (src/onboarding/PayoffScreen.tsx), answers: 6 or more a week, over an hour each
page({
  n: '03',
  slug: 'hours',
  lines: ['Save hours', 'of editing'],
  sub: 'See how much time you get back',
  phones: [{ capture: 'payoff', cx: 690, cy: 1610, t: tilt(-15, 7, 2.5, 0.94) }],
});

// 04: Onboarding, "What Tenfold does for you" (src/onboarding/Included.tsx), real looping video
page({
  n: '04',
  slug: 'cleaned',
  lines: ['Every video,', 'cleaned up'],
  sub: 'Pauses, filler words and retakes removed',
  phones: [{ capture: 'included', cx: 660, cy: 1605, t: tilt(16, 6, -3, 0.94) }],
});

// 05: Export finished (src/app/export/[projectId].tsx, saved to Photos)
{
  const posterW = 250;
  const posterH = Math.round((posterW * 16) / 9);
  const screen = `
    <div class="abs row" style="top:${TOP + 4}px;left:20px;right:20px;min-height:52px">
      <div class="ib o">${ic('xmark', 18)}</div>
      <div class="t20" style="flex:1;text-align:center;margin-right:44px">Saved to Photos</div>
    </div>
    <div class="abs t13 c2" style="top:${TOP + 60}px;left:20px;right:20px;text-align:center">Take 2</div>
    <div class="abs" style="top:${TOP + 110}px;left:${(SW - posterW) / 2}px;width:${posterW}px;height:${posterH}px;border-radius:16px;overflow:hidden;border:.5px solid ${C.border}">
      ${foot('b2', '50% 20%')}
      ${popCaption(['film', 'ten', 'takes'], 1, { top: Math.round(posterH * 0.62), size: 20 })}
      <div class="abs row" style="left:50%;top:50%;margin:-28px 0 0 -28px;width:56px;height:56px;border-radius:28px;justify-content:center;background:rgba(255,255,255,.22);backdrop-filter:blur(14px);border:.5px solid rgba(255,255,255,.35)">${ic('check', 24, '#fff', 2.4)}</div>
    </div>
    <div class="abs t13 c2" style="top:${TOP + 110 + posterH + 14}px;left:20px;right:20px;text-align:center">In your camera roll</div>
    <div class="abs col" style="left:20px;right:20px;bottom:${BOTTOM + 16}px;gap:12px">
      <div class="btn" style="height:52px;border-radius:26px">${ic('arrowUR', 18, '#000', 2)}<span>Open TikTok</span></div>
      <div class="row" style="gap:12px">
        <div class="row" style="flex:1;height:50px;border-radius:25px;border:1px solid ${C.borderStrong};justify-content:center;gap:8px;font-size:15px;font-weight:600">${ic('share', 17)}<span>Share</span></div>
        <div class="row" style="flex:1;height:50px;border-radius:25px;border:1px solid ${C.borderStrong};justify-content:center;font-size:15px;font-weight:600">Done</div>
      </div>
    </div>`;
  page({
    n: '05',
    slug: 'post',
    lines: ['Shoot.', 'Tap. Post.'],
    sub: 'Saved to Photos, ready for TikTok',
    phones: [{ screen, cx: 680, cy: 1610, t: tilt(-14, 7, 2.5, 0.94) }],
  });
}

// 06: Captions on the preview
{
  const strip = ['a2', 'a3', 'a1', 'a4'];
  const scroll = toolRow(toolBar('captions')) + timeline({ total: 34, time: 13.1, points: CUT_POINTS, cards: CARDS, seed: 3, strip });
  const cap = popCaption(['the', 'part', 'that', 'matters'], 3, { top: 262, size: 23 });
  const screen = editor({ title: 'Take 2', scroll, preview: cap, playButton: false, time: '0:13', frameContent: foot('a2', '50% 30%') });
  page({
    n: '06',
    slug: 'takes',
    lines: ['Clean up', 'every take'],
    sub: 'Captions on, mistakes out',
    phones: [{ screen, cx: 660, cy: 1615, t: tilt(14, 6, -2.5, 0.94) }],
  });
}

// 07: Cuts on the timeline: every pause already cut, one part selected
{
  const strip = ['c1', 'c2', 'c1', 'c2'];
  const scroll =
    toolRow(toolBar('cuts')) +
    timeline({ total: 37, time: 6.6, points: CUT_POINTS, selRegion: [5.4, 8.9], cards: CARDS, seed: 6, strip }) +
    editBar({ del: true });
  const cap = popCaption(['and', 'that', 'takes', 'hours'], 2, { top: 262, size: 23 });
  const screen = editor({ title: 'Take 3', scroll, preview: cap, playButton: false, time: '0:06', total: '0:37', badge: '0:52 → 0:37', frameContent: foot('c1', '50% 25%') });
  page({
    n: '07',
    slug: 'pauses',
    lines: ['Cut every pause', 'at once'],
    sub: 'Dead air gone from all your clips',
    phones: [{ screen, cx: 700, cy: 1610, t: tilt(-14, 8, 2, 0.94) }],
  });
}

console.log(`Wrote ${fs.readdirSync(OUT).filter((f) => f.endsWith('.html')).length} pages to ${OUT}`);
