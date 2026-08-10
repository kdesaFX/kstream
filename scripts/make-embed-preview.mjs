import sharp from "sharp";

const W = 1200;
const H = 630;
const SCREENSHOT =
  "C:/Users/Kdesa/.cursor/projects/c-Users-Kdesa-Pictures-kstream/assets/c__Users_Kdesa_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images__710BB5FD-506F-44A2-849B-DB259D227CA4_-c48d2e79-4598-47dd-8f88-a6d551b8f933.png";
const OUT = "public/embed-preview.png";

const screenW = 980;
const screenH = Math.round(screenW * (569 / 1024));
const bezel = 14;
const notchW = 90;
const notchH = 8;
const deviceW = screenW + bezel * 2;
const deviceH = screenH + bezel * 2 + 6;
const deviceX = Math.round((W - deviceW) / 2);
const deviceY = Math.round((H - deviceH) / 2) - 8;
const screenX = deviceX + bezel;
const screenY = deviceY + bezel;
const radius = 18;

function roundedRectPath(x, y, w, h, r) {
  return `M ${x + r},${y}
    H ${x + w - r}
    A ${r},${r} 0 0 1 ${x + w},${y + r}
    V ${y + h - r}
    A ${r},${r} 0 0 1 ${x + w - r},${y + h}
    H ${x + r}
    A ${r},${r} 0 0 1 ${x},${y + h - r}
    V ${y + r}
    A ${r},${r} 0 0 1 ${x + r},${y}
    Z`;
}

const bgSvg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="lg" cx="8%" cy="50%" r="45%">
      <stop offset="0%" stop-color="#6CC2B5" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="#3a8f86" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="rg" cx="92%" cy="48%" r="45%">
      <stop offset="0%" stop-color="#78c2b4" stop-opacity="0.5"/>
      <stop offset="55%" stop-color="#2f7a72" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cg" cx="50%" cy="55%" r="40%">
      <stop offset="0%" stop-color="#1a2a28" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="#050708"/>
  <rect width="100%" height="100%" fill="url(#lg)"/>
  <rect width="100%" height="100%" fill="url(#rg)"/>
  <rect width="100%" height="100%" fill="url(#cg)"/>
</svg>`);

const chromeSvg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bezelGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a2d30"/>
      <stop offset="100%" stop-color="#121416"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="28" flood-color="#000" flood-opacity="0.65"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <path d="${roundedRectPath(deviceX, deviceY, deviceW, deviceH, radius)}" fill="url(#bezelGrad)"/>
  </g>
  <path d="${roundedRectPath(screenX - 2, screenY - 2, screenW + 4, screenH + 4, 11)}" fill="#0a0b0c"/>
  <rect x="${deviceX + (deviceW - notchW) / 2}" y="${deviceY + 5}" width="${notchW}" height="${notchH}" rx="4" fill="#050607"/>
  <circle cx="${deviceX + deviceW / 2}" cy="${deviceY + 5 + notchH / 2}" r="2.2" fill="#1c2224"/>
</svg>`);

const screenImg = await sharp(SCREENSHOT)
  .resize(screenW, screenH, { fit: "cover", position: "centre" })
  .png()
  .toBuffer();

const mask = Buffer.from(
  `<svg width="${screenW}" height="${screenH}"><rect width="100%" height="100%" rx="10" ry="10" fill="#fff"/></svg>`,
);
const roundedScreen = await sharp(screenImg)
  .composite([{ input: await sharp(mask).png().toBuffer(), blend: "dest-in" }])
  .png()
  .toBuffer();

await sharp(bgSvg)
  .composite([
    { input: chromeSvg, top: 0, left: 0 },
    { input: roundedScreen, top: screenY, left: screenX },
  ])
  .png()
  .toFile(OUT);

const meta = await sharp(OUT).metadata();
console.log(`Wrote ${OUT} ${meta.width}x${meta.height}`);
