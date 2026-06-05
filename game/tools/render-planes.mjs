import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const URL = process.env.GAME_URL || 'http://localhost:5177/';
const OUT = process.env.OUT || 'planes-by-tier.png';

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: 'networkidle' });

// 게임 부팅 + 무기 텍스처 생성 대기
await page.waitForFunction(
  () => window.__game && window.__game.textures && window.__game.textures.exists('tex_player_gauss'),
  { timeout: 15000 }
);

const dataUrl = await page.evaluate(() => {
  const game = window.__game;
  // 무기 정의를 씬에서 가져오지 못하므로 키/라벨을 직접 명시 (GameScene WEAPONS와 동일 순서)
  const WEAPONS = [
    ['pistol', 'T1 권총'], ['smg', 'T2 기관단총'], ['shotgun', 'T3 샷건'],
    ['rifle', 'T4 라이플'], ['dualpistol', 'T5 듀얼권총'], ['sniper', 'T6 저격총'],
    ['flame', 'T7 화염방사기'], ['mg', 'T8 기관총'], ['cannon', 'T9 핸드캐논'],
    ['gauss', 'T10 가우스라이플'],
  ];

  const cols = 5, rows = 2;
  const cellW = 150, cellH = 200, pad = 20, scale = 2.4;
  const W = cols * cellW + pad * 2;
  const H = rows * cellH + pad * 2 + 50;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // 배경 (게임 딥스페이스 톤)
  ctx.fillStyle = '#0b0b1c'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('무기 등급별 부대원 외형 (T1 → T10)', W / 2, 36);

  ctx.imageSmoothingEnabled = false;
  WEAPONS.forEach(([key, label], i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const cxp = pad + col * cellW + cellW / 2;
    const cyp = pad + 50 + row * cellH + cellH / 2 - 10;

    const src = game.textures.get('tex_player_' + key).getSourceImage();
    const dw = src.width * scale, dh = src.height * scale;
    ctx.drawImage(src, cxp - dw / 2, cyp - dh / 2, dw, dh);

    ctx.fillStyle = '#cfe8ff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(label, cxp, pad + 50 + row * cellH + cellH - 18);
  });

  return c.toDataURL('image/png');
});

const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
writeFileSync(OUT, Buffer.from(base64, 'base64'));
console.log('saved', OUT);

await browser.close();
