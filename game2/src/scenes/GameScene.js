import Phaser from 'phaser';
import Sfx from '../sfx.js';

// ════════════════════════════════════════════════════════════════
//  Lane Defense 2  —  레인디펜스 2
//  v1(라스트워류 자동사격)에 게이트 / 적 4종 / 콤보 / 에어스트라이크 /
//  코인 자석 시스템을 더한 후속작. 스테이지 간 부대·무기를 계승해
//  파워 판타지를 강화하고, 적·보스 체력은 스테이지 비례로 상승한다.
// ════════════════════════════════════════════════════════════════

const WORLD_W = 540;
const WORLD_H = 960;
const PLAYER_Y = WORLD_H * 0.70;
const PLAYER_SPEED = 850;
const ENEMY_SPAWN_INTERVAL = 70;
const HISCORE_KEY = 'lane-defense-2:hiscore';

const ZONE_W = WORLD_W * 0.15;
const COMBAT_LEFT = ZONE_W;
const COMBAT_RIGHT = WORLD_W - ZONE_W;
const COMBAT_CENTER = (COMBAT_LEFT + COMBAT_RIGHT) / 2;
const PLAYABLE_LEFT = 24;
const PLAYABLE_RIGHT = WORLD_W - 24;

const SQUAD_MAX = 120;        // 표시(논리) 최대 인원
const SQUAD_SOFTCAP = 12;     // 이 인원까지는 실제 전투원과 1:1
const SQUAD_ACTUAL_MAX = 36;  // 실제 전투원(스프라이트) 최대
const SQUAD_SPAWN_INVULN_MS = 550;
const STARTING_SQUAD = 3;

// ─── 적 타입 ───────────────────────────────────────────────────
// minStage: 이 스테이지부터 등장 / coin: 처치 시 떨어뜨리는 코인 수
const ENEMY_TYPES = [
  { key: 'normal', tex: 'tex_enemy_normal', radius: 20, color: 0xff5577, hp: 2,  speed: 26, score: 1,  weight: 100, minStage: 1, coin: 1 },
  { key: 'runner', tex: 'tex_enemy_runner', radius: 14, color: 0xffdd33, hp: 1,  speed: 95, score: 2,  weight: 45,  minStage: 1, coin: 1 },
  { key: 'swarm',  tex: 'tex_enemy_swarm',  radius: 11, color: 0x66ee88, hp: 1,  speed: 50, score: 1,  weight: 35,  minStage: 2, coin: 0, cluster: [4, 7] },
  { key: 'zigzag', tex: 'tex_enemy_zigzag', radius: 17, color: 0x4cc2ff, hp: 3,  speed: 34, score: 3,  weight: 40,  minStage: 2, coin: 1, zig: { amp: 90, freq: 2.4 } },
  { key: 'tanker', tex: 'tex_enemy_tanker', radius: 32, color: 0x9b5cff, hp: 24, speed: 16, score: 8,  weight: 22,  minStage: 3, coin: 4 },
];

function enemyType(key) { return ENEMY_TYPES.find((t) => t.key === key) ?? ENEMY_TYPES[0]; }

function pickEnemyType(stage) {
  const pool = ENEMY_TYPES.filter((t) => stage >= t.minStage);
  const total = pool.reduce((s, t) => s + t.weight, 0);
  let r = Phaser.Math.Between(0, total - 1);
  for (const t of pool) {
    if (r < t.weight) return t;
    r -= t.weight;
  }
  return pool[0];
}

// ─── 보스 ──────────────────────────────────────────────────────
const BOSS_STAGES = [
  { stage: 1, tex: 'tex_boss_1', radius: 45, color: 0xff9933, hp: 60,  speed: 34, score: 60 },
  { stage: 2, tex: 'tex_boss_2', radius: 55, color: 0xff5577, hp: 120, speed: 34, score: 120 },
  { stage: 3, tex: 'tex_boss_3', radius: 65, color: 0x9933ff, hp: 240, speed: 34, score: 280 },
  { stage: 4, tex: 'tex_boss_4', radius: 75, color: 0x4c4cff, hp: 460, speed: 34, score: 560 },
  { stage: 5, tex: 'tex_boss_5', radius: 90, color: 0x222222, hp: 900, speed: 34, score: 1100 },
];

const BOSS_INITIAL_DELAY_MS = 11000;
const BOSS_RESPAWN_DELAY_MS = 4500;
const BOSS_HOLD_Y = 210;
const BOSS_BULLET_SPEED = 210;

// 탄막 패턴 (kind 로 분기) — down = 90도
const BOSS_PATTERNS = [
  { kind: 'aimed',  interval: 1700, count: 1,  spread: 0  },  // 1: 조준 단발
  { kind: 'spread', interval: 1600, count: 3,  spread: 46 },  // 2: 3-way
  { kind: 'spread', interval: 1400, count: 5,  spread: 72 },  // 3: 5-way
  { kind: 'aimed',  interval: 1200, count: 3,  spread: 18 },  // 4: 조준 점사
  { kind: 'radial', interval: 1300, count: 12, spread: 0  },  // 5: 전방위
  { kind: 'spiral', interval: 130,  count: 2,  spread: 0  },  // 6: 나선
  { kind: 'wall',   interval: 1500, count: 14, spread: 0  },  // 7: 벽-틈새
];

// ─── 무기 (T1~T10) ─────────────────────────────────────────────
const WEAPONS = [
  { key: 'pistol',     tier: 1,  name: '권총',         damage: 1, interval: 290, speed: 720,  count: 1, spread: 0,  color: 0xffe066 },
  { key: 'smg',        tier: 2,  name: '기관단총',     damage: 1, interval: 140, speed: 720,  count: 1, spread: 0,  color: 0x4cffc2 },
  { key: 'shotgun',    tier: 3,  name: '샷건',         damage: 1, interval: 560, speed: 640,  count: 5, spread: 35, color: 0xff9933 },
  { key: 'rifle',      tier: 4,  name: '라이플',       damage: 3, interval: 330, speed: 870,  count: 1, spread: 0,  color: 0x4cc2ff },
  { key: 'dualpistol', tier: 5,  name: '듀얼권총',     damage: 1, interval: 200, speed: 720,  count: 2, spread: 12, color: 0xf4d97e },
  { key: 'sniper',     tier: 6,  name: '저격총',       damage: 8, interval: 560, speed: 1140, count: 1, spread: 0,  color: 0xa066ff },
  { key: 'flame',      tier: 7,  name: '화염방사기',   damage: 1, interval: 65,  speed: 520,  count: 1, spread: 18, color: 0xff5a18 },
  { key: 'mg',         tier: 8,  name: '기관총',       damage: 2, interval: 95,  speed: 720,  count: 1, spread: 0,  color: 0xff5577 },
  { key: 'cannon',     tier: 9,  name: '핸드캐논',     damage: 7, interval: 290, speed: 920,  count: 1, spread: 0,  color: 0xd03030 },
  { key: 'gauss',      tier: 10, name: '가우스라이플', damage: 4, interval: 120, speed: 980,  count: 2, spread: 8,  color: 0x80ffff },
];
const STARTING_WEAPON_KEY = 'pistol';
function getWeapon(key) { return WEAPONS.find((w) => w.key === key) ?? WEAPONS[0]; }
function weaponByTier(tier) {
  const t = Phaser.Math.Clamp(tier, 1, WEAPONS.length);
  return WEAPONS.find((w) => w.tier === t) ?? WEAPONS[0];
}
function weaponLabel(w) { return `[T${w.tier}] ${w.name}`; }

// ─── 색 유틸 ───────────────────────────────────────────────────
function blendHex(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const c = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | c;
}
const darken  = (c, f) => blendHex(c, 0x000000, f);
const lighten = (c, f) => blendHex(c, 0xffffff, f);
function rgbHex(n) { return '#' + n.toString(16).padStart(6, '0'); }
function playerTexKey(weapon) { return `tex_player_${weapon.key}`; }

// ─── 부대원 아이템 (소소한 보조 — 게이트가 주 성장 수단) ──────────
const SQUAD_ITEM_LEFT_X  = ZONE_W / 2;
const SQUAD_ITEM_RIGHT_X = WORLD_W - ZONE_W / 2;
const SQUAD_ITEM_SPAWN_MIN_MS = 3200;
const SQUAD_ITEM_SPAWN_MAX_MS = 5200;
const SQUAD_ITEM_FALL_SPEED = 95;
const SQUAD_ITEM_TYPES = [
  { type: 'minus',    value: -1,   label: '-1', color: 0xff3300, weight: 14 },
  { type: 'plus1',    value:  1,   label: '+1', color: 0x3ad27a, weight: 40 },
  { type: 'plus2',    value:  2,   label: '+2', color: 0x44ffaa, weight: 30 },
  { type: 'question', value: null, label: ' ?', color: 0xffcc00, weight: 16 },
];
function pickSquadItemType() {
  const total = SQUAD_ITEM_TYPES.reduce((s, t) => s + t.weight, 0);
  let r = Phaser.Math.Between(0, total - 1);
  for (const t of SQUAD_ITEM_TYPES) {
    if (r < t.weight) return t;
    r -= t.weight;
  }
  return SQUAD_ITEM_TYPES[1];
}

// ─── 게이트 ────────────────────────────────────────────────────
const GATE_FIRST_MS   = 6000;
const GATE_INTERVAL_MS = 13000;
const GATE_FALL_SPEED  = 70;
const GATE_H = 88;
// 게이트 효과: cat = squad(초록) / power(파랑). pick() 으로 라벨/적용 생성
const GATE_EFFECTS = [
  { cat: 'squad', make: () => ({ label: '×2',   desc: '부대 2배', apply: (s) => s.multiplySquad(2) }) },
  { cat: 'squad', make: () => ({ label: '×1.5', desc: '부대 1.5배', apply: (s) => s.multiplySquad(1.5) }) },
  { cat: 'squad', make: () => { const n = Phaser.Math.Between(10, 25); return { label: `+${n}`, desc: '병력 충원', apply: (s) => { s.addSquadMember(n); s.sfx.squadGain(); } }; } },
  { cat: 'power', make: () => ({ label: '무기 UP', desc: '무기 등급 +1', apply: (s) => s.upgradeWeapon(1) }) },
  { cat: 'power', make: () => ({ label: 'DMG +30%', desc: '데미지 증가', apply: (s) => { s.damageMult *= 1.3; } }) },
  { cat: 'power', make: () => ({ label: '연사 +20%', desc: '발사 간격 감소', apply: (s) => { s.fireRateMult *= 0.8; s.startShootTimer(); } }) },
  { cat: 'power', make: () => ({ label: '탄환 +1', desc: '발사체 추가', apply: (s) => { s.bonusCount += 1; } }) },
];

// ─── 코인 ──────────────────────────────────────────────────────
const COIN_SPEED = 520;
const COIN_COLLECT_R = 30;
const COIN_VALUE = 2;

// ─── 에어스트라이크 (액티브 스킬) ───────────────────────────────
const AIRSTRIKE_COOLDOWN_MS = 14000;
const AIRSTRIKE_BOMBS = 7;
const AIRSTRIKE_RADIUS = 95;
const SKILL_BTN = { x: WORLD_W - 56, y: WORLD_H - 150, r: 42 };

// ─── 콤보 ──────────────────────────────────────────────────────
const COMBO_WINDOW_MS = 2600;
function comboMult(combo) { return 1 + Math.min(combo, 60) * 0.04; } // 최대 약 3.4배

// ─── 무기 상자 ─────────────────────────────────────────────────
const COMBAT_ZONE_W = COMBAT_RIGHT - COMBAT_LEFT;
const LANE_W = COMBAT_ZONE_W / 3;
const WEAPON_BOX_SPAWN_XS = [
  COMBAT_LEFT + LANE_W * 0.5,
  COMBAT_LEFT + LANE_W * 1.5,
  COMBAT_LEFT + LANE_W * 2.5,
];
const WEAPON_BOX_SPAWN_MS   = 11000;
const WEAPON_BOX_RADIUS     = Math.round(LANE_W * 0.40);
const WEAPON_BOX_KILL_RADIUS = WEAPON_BOX_RADIUS + 15;
const WEAPON_BOX_FALL_SPEED = 105;
const WEAPON_BOX_BASE_HP    = 6;
const WEAPON_BOX_HP_SCALE   = 3;
const WEAPON_PICKUP_RADIUS    = 16;
const WEAPON_PICKUP_FALL_SPEED = 75;

// 난이도 시간 카운터
const DIFF_ADVANCE_MS = 30000;

// ─── 배경 팔레트 (순환) ────────────────────────────────────────
const STAGE_PALETTES = [
  { base: 0x0a0716, neb1: 0x241046, neb2: 0x0c1e30, neb3: 0x2a0a34 },
  { base: 0x05140f, neb1: 0x0c4030, neb2: 0x0e2c1a, neb3: 0x123028 },
  { base: 0x1a0606, neb1: 0x440a0a, neb2: 0x2c161a, neb3: 0x2c120a },
  { base: 0x06061c, neb1: 0x1a1ab0, neb2: 0x122468, neb3: 0x0c1e48 },
  { base: 0x1a0a12, neb1: 0x52301c, neb2: 0x401e0a, neb3: 0x2c160a },
];
function paletteFor(stage) { return STAGE_PALETTES[(stage - 1) % STAGE_PALETTES.length]; }

function loadHiScore() {
  try {
    const raw = globalThis.localStorage?.getItem(HISCORE_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch { return 0; }
}
function saveHiScore(score) {
  try { globalThis.localStorage?.setItem(HISCORE_KEY, String(score)); } catch {}
}

// 해바라기(phyllotaxis) 분포
function squadOffsets(N) {
  if (N <= 0) return [];
  if (N === 1) return [{ x: 0, y: 0 }];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const R = Math.sqrt(N) * 13;
  return Array.from({ length: N }, (_, i) => {
    const r = Math.sqrt((i + 0.5) / N) * R;
    const theta = i * goldenAngle;
    return { x: Math.cos(theta) * r, y: Math.sin(theta) * r };
  });
}
function actualSquadSize(logical) {
  if (logical <= SQUAD_SOFTCAP) return logical;
  const t = (logical - SQUAD_SOFTCAP) / (SQUAD_MAX - SQUAD_SOFTCAP);
  return Math.round(SQUAD_SOFTCAP + t * (SQUAD_ACTUAL_MAX - SQUAD_SOFTCAP));
}
function logicalFromActual(actual) {
  if (actual <= SQUAD_SOFTCAP) return actual;
  const t = (actual - SQUAD_SOFTCAP) / (SQUAD_ACTUAL_MAX - SQUAD_SOFTCAP);
  return Math.round(SQUAD_SOFTCAP + t * (SQUAD_MAX - SQUAD_SOFTCAP));
}

export default class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  preload() {
    for (const w of WEAPONS) this.makePlaneTextureForWeapon(playerTexKey(w), w);
    this.makeCuteBulletTexture('tex_bullet');
    this.makeCircleTexture('tex_star', 2, 0xffffff);
    for (const t of ENEMY_TYPES) this.makeCuteEnemyTexture(t.tex, t.radius, t.color, t.key);
    for (const b of BOSS_STAGES) this.makeCuteBossTexture(b.tex, b.radius, b.color, b.stage);
    this.makeCuteSquadItemTexture('tex_squad_item', 18);
    this.makeCuteWeaponBoxTexture('tex_weapon_box');
    this.makeCuteWeaponPickupTexture('tex_weapon_pickup', WEAPON_PICKUP_RADIUS);
    this.makeCuteParticleTexture('tex_particle');
    this.makeCuteBossBulletTexture('tex_boss_bullet');
    this.makeCoinTexture('tex_coin', 11);
    this.makeBombTexture('tex_bomb');
    this.makeHpBarTexture('tex_hpbar_bg', 64, 6, false);
    this.makeHpBarTexture('tex_hpbar_fg', 64, 6, true);
  }

  // ─── 텍스처 생성 ─────────────────────────────────────────────

  makePlaneTextureForWeapon(key, weapon) {
    const tier   = weapon.tier;
    const accent = weapon.color;
    const power  = (tier - 1) / 9;
    const W = 48, H = 58, cx = W / 2, cy = 28;
    const g = this.add.graphics();
    const bodyCol = blendHex(0x6fd2ff, accent, 0.30 + power * 0.40);
    const wingCol = darken(blendHex(0x2ba8e8, accent, 0.35 + power * 0.40), 0.10 + power * 0.25);

    if (tier >= 9) {
      g.fillStyle(accent, 0.16); g.fillCircle(cx, cy, 26);
      g.fillStyle(accent, 0.10); g.fillCircle(cx, cy, 30);
    } else if (tier >= 6) {
      g.fillStyle(accent, 0.10); g.fillCircle(cx, cy, 24);
    }
    const span  = 10 + power * 9;
    const sweep = 4 + power * 8;
    const wingY = cy - 2;
    g.fillStyle(wingCol, 1);
    g.fillTriangle(cx - 6, wingY - 6, cx - 6 - span, wingY + sweep, cx - 6, wingY + 8);
    g.fillTriangle(cx + 6, wingY - 6, cx + 6 + span, wingY + sweep, cx + 6, wingY + 8);
    g.fillStyle(accent, 0.95);
    g.fillTriangle(cx - 6 - span, wingY + sweep, cx - 2 - span, wingY + sweep - 2, cx - 3 - span, wingY + sweep + 3);
    g.fillTriangle(cx + 6 + span, wingY + sweep, cx + 2 + span, wingY + sweep - 2, cx + 3 + span, wingY + sweep + 3);
    if (tier >= 6) {
      g.fillStyle(darken(accent, 0.2), 1);
      g.fillRoundedRect(cx - 6 - span * 0.6, wingY + 2, 4, 12, 2);
      g.fillRoundedRect(cx + 6 + span * 0.6 - 4, wingY + 2, 4, 12, 2);
    }
    if (tier >= 7) {
      g.fillStyle(wingCol, 1);
      g.fillTriangle(cx - 5, cy - 12, cx - 13, cy - 8, cx - 5, cy - 6);
      g.fillTriangle(cx + 5, cy - 12, cx + 13, cy - 8, cx + 5, cy - 6);
    }
    g.fillStyle(wingCol, 1);
    g.fillTriangle(cx - 7, cy + 12, cx - 7, H - 4, cx - 1, H - 4);
    g.fillTriangle(cx + 7, cy + 12, cx + 1, H - 4, cx + 7, H - 4);
    const noseY = 2 - power;
    g.fillStyle(bodyCol, 1);
    g.fillTriangle(cx - 8, cy - 14, cx, noseY, cx + 8, cy - 14);
    g.fillRoundedRect(cx - 8, cy - 16, 16, 34, 7);
    g.fillStyle(lighten(bodyCol, 0.3), 0.7);
    g.fillRoundedRect(cx - 5, cy - 14, 4, 28, 3);
    if (tier >= 8) {
      g.fillStyle(darken(bodyCol, 0.35), 0.85);
      g.fillRect(cx - 8, cy - 2, 16, 4);
      g.fillRect(cx - 8, cy + 8, 16, 3);
    }
    const cockGlow = tier >= 9 ? lighten(accent, 0.4) : 0xffe98a;
    g.fillStyle(cockGlow, 1); g.fillCircle(cx, cy - 11, 5);
    g.fillStyle(0xffffff, 1);  g.fillCircle(cx - 2, cy - 13, 2);
    const engineXs = tier >= 8 ? [cx - 6, cx, cx + 6]
                   : tier >= 5 ? [cx - 5, cx + 5]
                   : [cx];
    for (const ex of engineXs) {
      g.fillStyle(0xff8800, 1);              g.fillEllipse(ex, H - 8, 8, 7);
      g.fillStyle(accent, 1);                g.fillEllipse(ex, H - 9, 5, 5);
      g.fillStyle(lighten(accent, 0.5), 1);  g.fillEllipse(ex, H - 10, 2.5, 3);
    }
    if (tier >= 10) {
      g.fillStyle(lighten(accent, 0.3), 1);
      g.fillTriangle(cx - 6 - span, wingY + sweep - 1, cx - 11 - span, wingY + sweep + 1, cx - 6 - span, wingY + sweep + 3);
      g.fillTriangle(cx + 6 + span, wingY + sweep - 1, cx + 11 + span, wingY + sweep + 1, cx + 6 + span, wingY + sweep + 3);
    }
    g.generateTexture(key, W, H);
    g.destroy();
  }

  makeCuteEnemyTexture(key, r, color, kind) {
    const S = r * 2 + 10, cx = S / 2, cy = S / 2;
    const g = this.add.graphics();
    g.fillStyle(color, 0.18); g.fillCircle(cx, cy, r + 4);

    if (kind === 'tanker') {
      // 장갑판 느낌의 둥근 사각 몸체
      g.fillStyle(color, 1);
      g.fillRoundedRect(cx - r, cy - r, r * 2, r * 2, r * 0.4);
      g.fillStyle(darken(color, 0.3), 1);
      g.fillRect(cx - r, cy - 3, r * 2, 6);
      g.fillRect(cx - 3, cy - r, 6, r * 2);
      g.fillStyle(0xffffff, 0.22); g.fillCircle(cx - r * 0.3, cy - r * 0.3, r * 0.4);
    } else if (kind === 'runner') {
      // 앞으로 기운 물방울
      g.fillStyle(color, 1);
      g.fillCircle(cx, cy + r * 0.2, r);
      g.fillTriangle(cx - r * 0.7, cy, cx + r * 0.7, cy, cx, cy - r * 1.1);
      g.fillStyle(0xffffff, 0.28); g.fillCircle(cx - r * 0.25, cy - r * 0.1, r * 0.4);
    } else {
      g.fillStyle(color, 1); g.fillCircle(cx, cy, r);
      g.fillStyle(0xffffff, 0.28); g.fillCircle(cx - r * 0.28, cy - r * 0.28, r * 0.44);
    }

    // 눈
    const er = Math.max(2.5, r * 0.22), ex = r * 0.32, ey = r * 0.04;
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - ex, cy - ey, er); g.fillCircle(cx + ex, cy - ey, er);
    g.fillStyle(0x111122, 1);
    g.fillCircle(cx - ex + 1, cy - ey + 1, er * 0.56); g.fillCircle(cx + ex + 1, cy - ey + 1, er * 0.56);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(cx - ex - 1, cy - ey - 1, Math.max(1, er * 0.26)); g.fillCircle(cx + ex - 1, cy - ey - 1, Math.max(1, er * 0.26));
    g.fillStyle(0x220011, 0.7); g.fillEllipse(cx, cy + r * 0.4, r * 0.42, r * 0.2);
    g.generateTexture(key, S, S);
    g.destroy();
  }

  makeCuteBossTexture(key, r, color, stage) {
    const spikeLen = Math.round(r * 0.28);
    const spikeCount = 4 + stage * 2;
    const S = (r + spikeLen + 6) * 2;
    const cx = S / 2, cy = S / 2;
    const g = this.add.graphics();
    g.fillStyle(color, 0.82);
    for (let i = 0; i < spikeCount; i++) {
      const ang = (i / spikeCount) * Math.PI * 2;
      const tx = cx + Math.cos(ang) * (r + spikeLen);
      const ty = cy + Math.sin(ang) * (r + spikeLen);
      const hw = 0.22;
      g.fillTriangle(tx, ty,
        cx + Math.cos(ang - hw) * (r * 0.8), cy + Math.sin(ang - hw) * (r * 0.8),
        cx + Math.cos(ang + hw) * (r * 0.8), cy + Math.sin(ang + hw) * (r * 0.8));
    }
    g.fillStyle(color, 0.16); g.fillCircle(cx, cy, r + 5);
    g.fillStyle(color, 1);     g.fillCircle(cx, cy, r);
    g.fillStyle(0x000000, 0.2); g.fillCircle(cx, cy + r * 0.14, r * 0.86);
    g.fillStyle(0xffffff, 0.2); g.fillCircle(cx - r * 0.28, cy - r * 0.3, r * 0.4);
    const er = Math.max(4, r * 0.19), ex = r * 0.32, ey = r * 0.04;
    if (stage === 5) {
      g.fillStyle(0xff2200, 0.35); g.fillCircle(cx - ex, cy - ey, er * 1.6); g.fillCircle(cx + ex, cy - ey, er * 1.6);
      g.fillStyle(0xff4400, 1);    g.fillCircle(cx - ex, cy - ey, er);        g.fillCircle(cx + ex, cy - ey, er);
      g.fillStyle(0xffaa00, 1);    g.fillCircle(cx - ex, cy - ey, er * 0.48); g.fillCircle(cx + ex, cy - ey, er * 0.48);
      g.fillStyle(0xff2200, 0.8);  g.fillEllipse(cx, cy + r * 0.36, r * 0.62, r * 0.22);
    } else if (stage === 4) {
      g.fillStyle(0x88ddff, 1);
      g.fillTriangle(cx - ex - er, cy - ey - er, cx - ex + er, cy - ey - er, cx - ex, cy - ey + er);
      g.fillTriangle(cx + ex - er, cy - ey - er, cx + ex + er, cy - ey - er, cx + ex, cy - ey + er);
      g.fillStyle(0x2233bb, 0.9); g.fillRect(cx - r * 0.28, cy + r * 0.28, r * 0.56, r * 0.14);
    } else if (stage === 3) {
      g.fillStyle(0xffffff, 1); g.fillCircle(cx, cy - r * 0.08, er * 1.4);
      g.fillStyle(0x6600cc, 1); g.fillCircle(cx, cy - r * 0.08, er);
      g.fillStyle(0xffffff, 1); g.fillCircle(cx, cy - r * 0.08, er * 0.46);
      g.fillStyle(0x000000, 1); g.fillCircle(cx, cy - r * 0.08, er * 0.2);
      g.fillStyle(0x440099, 0.9); g.fillEllipse(cx, cy + r * 0.36, r * 0.5, r * 0.2);
    } else if (stage === 2) {
      g.fillStyle(0xffee00, 1); g.fillEllipse(cx - ex, cy - ey, er * 2.2, er * 1.1); g.fillEllipse(cx + ex, cy - ey, er * 2.2, er * 1.1);
      g.fillStyle(0x000000, 1); g.fillCircle(cx - ex + 1, cy - ey + 1, er * 0.6); g.fillCircle(cx + ex + 1, cy - ey + 1, er * 0.6);
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(cx - r * 0.16, cy + r * 0.22, cx - r * 0.06, cy + r * 0.22, cx - r * 0.11, cy + r * 0.42);
      g.fillTriangle(cx + r * 0.06, cy + r * 0.22, cx + r * 0.16, cy + r * 0.22, cx + r * 0.11, cy + r * 0.42);
    } else {
      g.fillStyle(0xffffff, 1); g.fillCircle(cx - ex, cy - ey, er); g.fillCircle(cx + ex, cy - ey, er);
      g.fillStyle(0x1a0a2a, 1); g.fillCircle(cx - ex + 1, cy - ey + 1, er * 0.58); g.fillCircle(cx + ex + 1, cy - ey + 1, er * 0.58);
      g.fillStyle(0xffffff, 1); g.fillCircle(cx - ex - 1, cy - ey - 1, er * 0.26); g.fillCircle(cx + ex - 1, cy - ey - 1, er * 0.26);
      g.fillStyle(0xffcc44, 1);
      g.fillTriangle(cx - r * 0.34, cy - r * 0.84, cx - r * 0.2, cy - r * 0.55, cx - r * 0.48, cy - r * 0.55);
      g.fillTriangle(cx + r * 0.34, cy - r * 0.84, cx + r * 0.48, cy - r * 0.55, cx + r * 0.2, cy - r * 0.55);
      g.fillStyle(0x1a0a2a, 0.7); g.fillEllipse(cx, cy + r * 0.4, r * 0.38, r * 0.2);
    }
    g.generateTexture(key, S, S);
    g.destroy();
  }

  makeCuteBulletTexture(key) {
    const W = 10, H = 18, cx = W / 2;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(cx, H * 0.58, W, H * 0.7);
    g.fillTriangle(2, H * 0.46, cx, 0, W - 2, H * 0.46);
    g.fillStyle(0xffffff, 0.55);
    g.fillEllipse(cx - 1, H * 0.38, 3, 7);
    g.generateTexture(key, W, H);
    g.destroy();
  }

  makeCuteBossBulletTexture(key) {
    const r = 8, S = r * 2 + 8, cx = S / 2, cy = S / 2;
    const g = this.add.graphics();
    g.fillStyle(0xff2200, 0.22); g.fillCircle(cx, cy, r + 4);
    g.fillStyle(0xff4400, 1);    g.fillCircle(cx, cy, r);
    g.fillStyle(0xff8844, 1);    g.fillCircle(cx, cy, r * 0.58);
    g.fillStyle(0xffffff, 0.55); g.fillCircle(cx - 2, cy - 2, r * 0.28);
    g.generateTexture(key, S, S);
    g.destroy();
  }

  makeCoinTexture(key, r) {
    const S = r * 2 + 6, cx = S / 2, cy = S / 2;
    const g = this.add.graphics();
    g.fillStyle(0xffd54a, 0.3); g.fillCircle(cx, cy, r + 2);
    g.fillStyle(0xffcc33, 1);   g.fillCircle(cx, cy, r);
    g.fillStyle(0xffe27a, 1);   g.fillCircle(cx, cy, r * 0.66);
    g.fillStyle(0xb8801a, 1);   g.fillRect(cx - 1.5, cy - r * 0.5, 3, r);
    g.fillStyle(0xb8801a, 1);   g.fillRect(cx - r * 0.4, cy - 1.5, r * 0.8, 3);
    g.fillStyle(0xffffff, 0.7);  g.fillCircle(cx - r * 0.35, cy - r * 0.35, r * 0.22);
    g.generateTexture(key, S, S);
    g.destroy();
  }

  makeBombTexture(key) {
    const r = 12, S = r * 2 + 14, cx = S / 2, cy = S / 2 + 3;
    const g = this.add.graphics();
    g.fillStyle(0x222230, 1); g.fillCircle(cx, cy, r);
    g.fillStyle(0x3a3a4e, 1); g.fillCircle(cx - r * 0.3, cy - r * 0.3, r * 0.5);
    g.fillStyle(0xffffff, 0.5); g.fillCircle(cx - r * 0.4, cy - r * 0.4, r * 0.2);
    // 도화선
    g.fillStyle(0x886644, 1); g.fillRect(cx - 1.5, cy - r - 6, 3, 8);
    g.fillStyle(0xff8800, 1); g.fillCircle(cx, cy - r - 7, 3);
    g.fillStyle(0xffdd00, 1); g.fillCircle(cx, cy - r - 7, 1.5);
    g.generateTexture(key, S, S);
    g.destroy();
  }

  makeCuteWeaponBoxTexture(key) {
    const r = WEAPON_BOX_RADIUS, S = r * 2, half = r;
    const g = this.add.graphics();
    g.fillStyle(0xc8913a, 1); g.fillRoundedRect(2, 2, S - 4, S - 4, 9);
    g.fillStyle(0xa8711a, 1); g.fillRect(2, half - 4, S - 4, 8); g.fillRect(half - 4, 2, 8, S - 4);
    g.fillStyle(0xb87c22, 0.5); g.fillRect(18, 2, 4, S - 4); g.fillRect(S - 22, 2, 4, S - 4);
    g.fillStyle(0x778899, 1);
    const cs = 14;
    g.fillRoundedRect(2, 2, cs, cs, 4); g.fillRoundedRect(S - cs - 2, 2, cs, cs, 4);
    g.fillRoundedRect(2, S - cs - 2, cs, cs, 4); g.fillRoundedRect(S - cs - 2, S - cs - 2, cs, cs, 4);
    g.fillStyle(0xaabbcc, 0.6); g.fillRect(4, 4, 4, 4); g.fillRect(S - 10, 4, 4, 4);
    const lpts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
      const lr = i % 2 === 0 ? 11 : 5;
      lpts.push({ x: half + Math.cos(a) * lr, y: half + Math.sin(a) * lr });
    }
    g.fillStyle(0xffcc44, 1); g.fillPoints(lpts, true);
    g.fillStyle(0xffe888, 1); g.fillCircle(half, half, 4);
    g.fillStyle(0xffffff, 0.12); g.fillRoundedRect(4, 4, S - 8, (S - 8) * 0.42, 7);
    g.generateTexture(key, S, S);
    g.destroy();
  }

  makeCuteWeaponPickupTexture(key, r) {
    const S = r * 2 + 6, cx = S / 2, cy = S / 2;
    const g = this.add.graphics();
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.42;
      pts.push({ x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad });
    }
    g.fillStyle(0xffffff, 0.25); g.fillCircle(cx, cy, r + 2);
    g.fillStyle(0xffffff, 1);    g.fillPoints(pts, true);
    g.fillStyle(0xffffff, 0.6);  g.fillCircle(cx, cy, r * 0.32);
    g.generateTexture(key, S, S);
    g.destroy();
  }

  makeCuteSquadItemTexture(key, r) {
    const S = r * 2 + 6, cx = S / 2, cy = S / 2;
    const g = this.add.graphics();
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 - Math.PI / 6;
      pts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
    }
    g.fillStyle(0xffffff, 0.2); g.fillCircle(cx, cy, r + 2);
    g.fillStyle(0xffffff, 1);   g.fillPoints(pts, true);
    g.fillStyle(0xffffff, 0.35); g.fillCircle(cx - r * 0.2, cy - r * 0.25, r * 0.42);
    g.generateTexture(key, S, S);
    g.destroy();
  }

  makeCuteParticleTexture(key) {
    const r = 4, S = r * 2 + 4, cx = S / 2, cy = S / 2;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.35); g.fillCircle(cx, cy, r + 2);
    g.fillStyle(0xffffff, 1);    g.fillCircle(cx, cy, r);
    g.generateTexture(key, S, S);
    g.destroy();
  }

  makeHpBarTexture(key, w, h, isFg) {
    const g = this.add.graphics();
    if (isFg) {
      g.fillStyle(0xff4466, 1);   g.fillRect(0, 0, w, h);
      g.fillStyle(0xff88aa, 0.6); g.fillRect(0, 0, w, h * 0.38);
    } else {
      g.fillStyle(0x110818, 1);   g.fillRect(0, 0, w, h);
      g.fillStyle(0x221028, 0.8); g.fillRect(0, h * 0.5, w, h * 0.5);
    }
    g.generateTexture(key, w, h);
    g.destroy();
  }

  makeCircleTexture(key, radius, color) {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillCircle(radius, radius, radius);
    g.generateTexture(key, radius * 2, radius * 2);
    g.destroy();
  }

  // ─── 생성 ────────────────────────────────────────────────────

  create() {
    this.score        = 0;
    this.gold         = 0;
    this.hiScore      = loadHiScore();
    this.gameOver     = false;
    this.weapon       = getWeapon(STARTING_WEAPON_KEY);
    this.invulnUntil  = 0;
    this.targetX      = WORLD_W / 2;
    this.stage        = 1;
    this.bossNum      = 0;
    this.bossCount    = 3 + this.stage;
    this.activeBoss   = null;
    this.bossSpiralAngle = 0;
    this.diffStage    = 0;
    this.choosing     = false;
    this.damageMult   = 1;
    this.fireRateMult = 1;
    this.moveMult     = 1;
    this.bonusCount   = 0;
    this.combo        = 0;
    this.comboExpire  = 0;
    this.skillReadyAt = 0;   // 게임 시작 즉시 1회 사용 가능
    this.activeGate   = null;
    if (!this.sfx) this.sfx = new Sfx();

    // 배경
    this.bgBase = this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x0a0716);
    this.bgNeb1 = this.add.rectangle(WORLD_W / 2,    WORLD_H * 0.3,  WORLD_W,       WORLD_H * 0.44, 0x241046, 0.38);
    this.bgNeb2 = this.add.rectangle(WORLD_W * 0.3,  WORLD_H * 0.65, WORLD_W * 0.5, WORLD_H * 0.32, 0x0c1e30, 0.28);
    this.bgNeb3 = this.add.rectangle(WORLD_W * 0.75, WORLD_H * 0.5,  WORLD_W * 0.4, WORLD_H * 0.28, 0x2a0a34, 0.22);

    this.stars = [];
    for (let i = 0; i < 110; i++) {
      const bright = Phaser.Math.FloatBetween(0.15, 0.95);
      const scale  = bright > 0.75 ? Phaser.Math.FloatBetween(1.2, 2.2) : Phaser.Math.FloatBetween(0.4, 1.0);
      const star = this.add.image(Phaser.Math.Between(0, WORLD_W), Phaser.Math.Between(0, WORLD_H), 'tex_star')
        .setAlpha(bright).setScale(scale);
      star.vy = scale > 1.0 ? Phaser.Math.Between(60, 90) : Phaser.Math.Between(20, 36);
      this.stars.push(star);
    }
    this.applyStagePalette(this.stage);

    // 좌우 아이템 구역
    this.add.rectangle(ZONE_W / 2,           WORLD_H / 2, ZONE_W, WORLD_H, 0x3ad27a, 0.07);
    this.add.rectangle(WORLD_W - ZONE_W / 2, WORLD_H / 2, ZONE_W, WORLD_H, 0x3ad27a, 0.07);
    this.add.rectangle(COMBAT_LEFT,  WORLD_H / 2, 2, WORLD_H, 0x5aeea0, 0.22);
    this.add.rectangle(COMBAT_RIGHT, WORLD_H / 2, 2, WORLD_H, 0x5aeea0, 0.22);

    // 물리 그룹
    this.squadGroup   = this.physics.add.group();
    this.squad        = [];
    this.squadCount   = 0;
    this.addSquadMember(STARTING_SQUAD);

    this.bullets       = this.physics.add.group({ defaultKey: 'tex_bullet',        maxSize: 500 });
    this.enemies       = this.physics.add.group({ defaultKey: 'tex_enemy_normal',  maxSize: 300 });
    this.weaponBoxes   = this.physics.add.group({ defaultKey: 'tex_weapon_box',    maxSize: 10  });
    this.weaponPickups = this.physics.add.group({ defaultKey: 'tex_weapon_pickup', maxSize: 10  });
    this.squadItems    = this.physics.add.group({ defaultKey: 'tex_squad_item',    maxSize: 20  });
    this.bossBullets   = this.physics.add.group({ defaultKey: 'tex_boss_bullet',   maxSize: 160 });
    this.coins         = this.physics.add.group({ defaultKey: 'tex_coin',          maxSize: 200 });

    this.deathEmitter = this.add.particles(0, 0, 'tex_particle', {
      speed: { min: 60, max: 200 }, angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 }, lifespan: 350, emitting: false,
    });
    this.deathEmitter.setDepth(5);
    this.sparkleEmitter = this.add.particles(0, 0, 'tex_star', {
      speed: { min: 40, max: 170 }, angle: { min: 0, max: 360 },
      scale: { start: 2.4, end: 0 }, tint: 0xffe066, lifespan: 520, emitting: false,
    });
    this.sparkleEmitter.setDepth(6);
    this.boomEmitter = this.add.particles(0, 0, 'tex_particle', {
      speed: { min: 100, max: 320 }, angle: { min: 0, max: 360 },
      scale: { start: 2.2, end: 0 }, tint: [0xffdd33, 0xff7711, 0xff3300],
      lifespan: 460, emitting: false,
    });
    this.boomEmitter.setDepth(12);

    this.physics.add.overlap(this.bullets,    this.enemies,       this.onBulletHitEnemy,      null, this);
    this.physics.add.overlap(this.bullets,    this.weaponBoxes,   this.onBulletHitWeaponBox,  null, this);
    this.physics.add.overlap(this.squadGroup, this.enemies,       this.onSquadHitEnemy,        null, this);
    this.physics.add.overlap(this.squadGroup, this.weaponBoxes,   this.onSquadHitWeaponBox,   null, this);
    this.physics.add.overlap(this.squadGroup, this.weaponPickups, this.onSquadHitWeaponPickup, null, this);
    this.physics.add.overlap(this.squadGroup, this.squadItems,    this.onSquadHitSquadItem,    null, this);
    this.physics.add.overlap(this.squadGroup, this.bossBullets,   this.onSquadHitBossBullet,   null, this);

    this.input.on('pointerdown', this.onPointer, this);
    this.input.on('pointerup',   this.onPointer, this);
    this.input.on('pointermove', this.onPointer, this);

    this.buildHud();

    // 타이머
    this.startShootTimer();
    this.spawnEvent = this.time.addEvent({ delay: ENEMY_SPAWN_INTERVAL, loop: true, callback: this.spawnEnemy, callbackScope: this });
    this.weaponBoxEvent = this.time.addEvent({ delay: WEAPON_BOX_SPAWN_MS, loop: true, callback: this.spawnWeaponBox, callbackScope: this });
    this.diffEvent = this.time.addEvent({ delay: DIFF_ADVANCE_MS, loop: true, callback: () => { this.diffStage++; }, callbackScope: this });
    this.gateEvent = this.time.addEvent({ delay: GATE_INTERVAL_MS, loop: true, callback: this.spawnGatePair, callbackScope: this });

    this.scheduleNextSquadItem();
    this.time.delayedCall(GATE_FIRST_MS, () => this.spawnGatePair());
    this.time.delayedCall(BOSS_INITIAL_DELAY_MS, () => this.spawnNextBoss());
  }

  buildHud() {
    this.scoreText = this.add.text(20, 16, 'SCORE 0', {
      fontFamily: 'monospace', fontSize: '23px', color: '#ffffff',
    }).setDepth(18);
    this.goldText = this.add.text(20, 44, '🪙 0', {
      fontFamily: 'monospace', fontSize: '17px', color: '#ffd54a',
    }).setDepth(18);
    this.hiScoreText = this.add.text(WORLD_W - 20, 16, `BEST ${this.hiScore}`, {
      fontFamily: 'monospace', fontSize: '19px', color: '#ffe066',
    }).setOrigin(1, 0).setDepth(18);
    this.squadText = this.add.text(WORLD_W / 2, 14, `부대원 ${this.squadCount}`, {
      fontFamily: 'monospace', fontSize: '20px', color: '#3ad27a', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(18);
    this.weaponText = this.add.text(WORLD_W / 2, 40, weaponLabel(this.weapon), {
      fontFamily: 'monospace', fontSize: '14px', color: rgbHex(this.weapon.color), fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(18);
    this.bossText = this.add.text(WORLD_W / 2, 58, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ff9933', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(18);
    this.comboText = this.add.text(WORLD_W - 20, 44, '', {
      fontFamily: 'sans-serif', fontSize: '22px', color: '#ff7733', fontStyle: 'bold',
    }).setOrigin(1, 0).setDepth(18);

    // 음소거 토글
    this.muteIcon = this.add.text(20, WORLD_H - 34, this.sfx.muted ? '소리 OFF' : '소리 ON', {
      fontFamily: 'monospace', fontSize: '15px', color: '#ffffff90',
    }).setDepth(18);
    this.muteBounds = { x: 10, y: WORLD_H - 46, w: 130, h: 40 };

    // 에어스트라이크 버튼
    this.skillArc = this.add.graphics().setDepth(17);
    this.skillBtnBg = this.add.circle(SKILL_BTN.x, SKILL_BTN.y, SKILL_BTN.r, 0xff5533, 0.22)
      .setStrokeStyle(3, 0xff7755, 0.9).setDepth(17);
    this.skillIcon = this.add.text(SKILL_BTN.x, SKILL_BTN.y - 4, '💥', {
      fontSize: '34px',
    }).setOrigin(0.5).setDepth(18);
    this.skillLabel = this.add.text(SKILL_BTN.x, SKILL_BTN.y + 24, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(18);

    this.hintText = this.add.text(WORLD_W / 2, WORLD_H - 58,
      '드래그로 이동 · 게이트를 골라 통과 · 💥 에어스트라이크', {
        fontFamily: 'monospace', fontSize: '12px', color: '#ffffff80',
      }).setOrigin(0.5).setDepth(18);
  }

  // ─── 부대원 아이템 ───────────────────────────────────────────

  scheduleNextSquadItem() {
    if (this.gameOver) return;
    const delay = Phaser.Math.Between(SQUAD_ITEM_SPAWN_MIN_MS, SQUAD_ITEM_SPAWN_MAX_MS);
    this.squadItemTimer = this.time.delayedCall(delay, () => this.spawnSquadItem());
  }

  spawnSquadItem() {
    if (this.gameOver) return;
    const active = this.squadItems.getChildren().filter((i) => i.active).length;
    if (active < 5) {
      const def    = pickSquadItemType();
      const spawnX = Phaser.Math.Between(0, 1) === 0 ? SQUAD_ITEM_LEFT_X : SQUAD_ITEM_RIGHT_X;
      const item   = this.squadItems.get(spawnX, -20, 'tex_squad_item');
      if (item) {
        item.enableBody(true, spawnX, -20, true, true);
        item.setTint(def.color);
        item.body.setVelocity(0, SQUAD_ITEM_FALL_SPEED);
        item.setData('type', def.type);
        item.setData('value', def.value);
        if (!item.label) {
          item.label = this.add.text(spawnX, -20, def.label, {
            fontFamily: 'monospace', fontSize: '14px', color: rgbHex(def.color), fontStyle: 'bold',
          }).setOrigin(0.5).setDepth(8);
        } else {
          item.label.setVisible(true).setPosition(spawnX, -20).setText(def.label).setColor(rgbHex(def.color));
        }
      }
    }
    this.scheduleNextSquadItem();
  }

  // ─── 게이트 ──────────────────────────────────────────────────

  spawnGatePair() {
    if (this.gameOver || this.choosing || this.activeGate) return;

    // 서로 다른 효과 2개 (가능하면 한쪽 squad, 한쪽 power 로 대비)
    const squadPool = GATE_EFFECTS.filter((e) => e.cat === 'squad');
    const powerPool = GATE_EFFECTS.filter((e) => e.cat === 'power');
    let a, b;
    if (Phaser.Math.Between(0, 100) < 70) {
      a = Phaser.Utils.Array.GetRandom(squadPool).make();
      b = Phaser.Utils.Array.GetRandom(powerPool).make();
      if (Phaser.Math.Between(0, 1)) { const t = a; a = b; b = t; }
    } else {
      const shuffled = Phaser.Utils.Array.Shuffle([...GATE_EFFECTS]).slice(0, 2);
      a = shuffled[0].make(); b = shuffled[1].make();
    }

    const halfW = COMBAT_ZONE_W / 2 - 3;
    const leftCx  = COMBAT_LEFT + halfW / 2 + 1;
    const rightCx = COMBAT_CENTER + halfW / 2 + 2;

    const mkPanel = (cx, eff, isLeft) => {
      const color = this._gateColor(eff);
      const rect = this.add.rectangle(cx, 0, halfW, GATE_H, color, 0.30)
        .setStrokeStyle(3, color, 0.95).setDepth(9);
      const label = this.add.text(cx, -12, eff.label, {
        fontFamily: 'sans-serif', fontSize: '30px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(10);
      const desc = this.add.text(cx, 18, eff.desc, {
        fontFamily: 'monospace', fontSize: '12px', color: '#ffffffdd',
      }).setOrigin(0.5).setDepth(10);
      return { rect, label, desc, eff, isLeft };
    };

    const left  = mkPanel(leftCx, a, true);
    const right = mkPanel(rightCx, b, false);
    const divider = this.add.rectangle(COMBAT_CENTER, 0, 4, GATE_H, 0xffffff, 0.5).setDepth(10);

    this.activeGate = { y: -GATE_H, left, right, divider, resolved: false };
    this.sfx.gate();
  }

  _gateColor(eff) { return eff.desc.includes('부대') || eff.desc.includes('병력') ? 0x3ad27a : 0x4cc2ff; }

  positionGate(gate) {
    const y = gate.y;
    const place = (p) => {
      p.rect.y = y;
      p.label.y = y - 12;
      p.desc.y = y + 18;
    };
    place(gate.left); place(gate.right);
    gate.divider.y = y;
  }

  resolveGate(gate) {
    gate.resolved = true;
    const chosen = this.targetX < COMBAT_CENTER ? gate.left : gate.right;
    const other  = chosen === gate.left ? gate.right : gate.left;
    // 적용
    chosen.eff.apply(this);
    this.sfx.gate();
    // 선택한 게이트 강조 → 사라짐, 나머지는 즉시 사라짐
    const flashColor = this._gateColor(chosen.eff);
    this.tweens.add({ targets: [chosen.rect], scaleY: 1.3, alpha: 0, duration: 300, onComplete: () => this.destroyGatePanel(chosen) });
    this.tweens.add({ targets: [chosen.label, chosen.desc], y: '-=20', alpha: 0, duration: 300 });
    this.flashText(chosen.label.x, PLAYER_Y - 60, chosen.eff.label, flashColor);
    this.destroyGatePanel(other);
    gate.divider.destroy();
    this.time.delayedCall(320, () => { this.activeGate = null; });
  }

  destroyGatePanel(p) {
    if (!p) return;
    if (p._destroyed) return;
    p._destroyed = true;
    p.rect.destroy(); p.label.destroy(); p.desc.destroy();
  }

  removeGate(gate) {
    this.destroyGatePanel(gate.left);
    this.destroyGatePanel(gate.right);
    if (gate.divider) gate.divider.destroy();
    this.activeGate = null;
  }

  flashText(x, y, str, color) {
    const t = this.add.text(x, y, str, {
      fontFamily: 'sans-serif', fontSize: '34px', color: rgbHex(color), fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(16);
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, scale: 1.5, duration: 900, onComplete: () => t.destroy() });
  }

  // 부대 배수 (게이트 ×N)
  multiplySquad(factor) {
    const before = this.squadCount;
    this.squadCount = Math.min(SQUAD_MAX, Math.max(1, Math.round(this.squadCount * factor)));
    this.syncSquadSprites();
    if (this.squadCount > before) this.flashSquadGain();
    this.sfx.squadGain();
  }

  upgradeWeapon(by = 1) {
    const next = weaponByTier(this.weapon.tier + by);
    if (next.key !== this.weapon.key) this.equipWeapon(next.key);
    else { this.damageMult *= 1.2; } // 이미 최고 등급이면 데미지로 환산
  }

  // ─── 보스 ────────────────────────────────────────────────────

  spawnNextBoss() {
    if (this.gameOver || this.activeBoss) return;
    const next = this.bossNum + 1;
    this.bossNum = next;
    const def = BOSS_STAGES[(next - 1) % BOSS_STAGES.length];
    const x   = WORLD_W / 2;
    const boss = this.enemies.get(x, -def.radius, def.tex);
    if (!boss) return;

    boss.setTexture(def.tex);
    boss.enableBody(true, x, -def.radius, true, true);
    boss.body.setSize(def.radius * 2, def.radius * 2, true);
    boss.body.setVelocity(0, def.speed);

    const hpMult   = 1 + (this.stage - 1) * 0.55 + (next - 1) * 0.13;
    const actualHp = Math.round(def.hp * hpMult);
    boss.setData('hp', actualHp);
    boss.setData('maxHp', actualHp);
    boss.setData('score', Math.round(def.score * hpMult));
    boss.setData('typeKey', 'boss');
    boss.setData('coin', 14);
    boss.setData('bossStage', def.stage);
    boss.setData('holding', false);
    boss.setData('zig', null);
    this.stopBossFire();

    if (boss.hpBarBg) { boss.hpBarBg.destroy(); boss.hpBarBg = null; }
    if (boss.hpBarFg) { boss.hpBarFg.destroy(); boss.hpBarFg = null; }
    const barW  = def.radius * 2;
    boss.hpBarBg = this.add.image(x, -def.radius - 10, 'tex_hpbar_bg').setDisplaySize(barW, 8).setDepth(8);
    boss.hpBarFg = this.add.image(x - barW / 2, -def.radius - 10, 'tex_hpbar_fg').setDisplaySize(barW, 8).setOrigin(0, 0.5).setDepth(8);
    boss.hpBarW  = barW;

    boss.setData('animPhase', Math.random() * Math.PI * 2);
    boss.setData('animFreq', Phaser.Math.FloatBetween(2.6, 3.6));
    boss.setScale(1); boss.setRotation(0);
    this.activeBoss = boss;
    this.sfx.bossAppear();
    this.bossText.setText(`스테이지 ${this.stage} · 웨이브 ${this.bossNum}/${this.bossCount}  HP ${actualHp}`);
    this.tweens.add({ targets: this.bossText, scale: { from: 1.6, to: 1 }, duration: 400 });
  }

  startBossFire() {
    this.stopBossFire();
    const pattern = BOSS_PATTERNS[(this.bossNum - 1) % BOSS_PATTERNS.length];
    this.bossSpiralAngle = 0;
    this.bossFireEvent = this.time.addEvent({
      delay: pattern.interval, loop: true, callback: this.fireBossPattern, callbackScope: this,
    });
  }
  stopBossFire() {
    if (this.bossFireEvent) { this.bossFireEvent.remove(); this.bossFireEvent = null; }
  }

  fireBossPattern() {
    const boss = this.activeBoss;
    if (!boss || !boss.active || this.gameOver) return;
    const p = BOSS_PATTERNS[(this.bossNum - 1) % BOSS_PATTERNS.length];
    this.sfx.bossShoot();
    if (p.kind === 'radial') {
      for (let i = 0; i < p.count; i++) this.fireBossBullet(boss.x, boss.y, (i / p.count) * 360);
      return;
    }
    if (p.kind === 'spiral') {
      this.bossSpiralAngle = (this.bossSpiralAngle + 27) % 360;
      for (let i = 0; i < p.count; i++) this.fireBossBullet(boss.x, boss.y, this.bossSpiralAngle + i * 180);
      return;
    }
    if (p.kind === 'wall') {
      const gap = Phaser.Math.Between(2, p.count - 4); // 통과 가능한 틈
      for (let i = 0; i < p.count; i++) {
        if (i >= gap && i <= gap + 2) continue;
        const ang = 40 + (i / (p.count - 1)) * 100; // 40~140도
        this.fireBossBullet(boss.x, boss.y, ang);
      }
      return;
    }
    // aimed / spread
    let base = 90;
    if (p.kind === 'aimed') {
      const t = this.squad[0];
      if (t) base = Phaser.Math.RadToDeg(Math.atan2(t.y - boss.y, t.x - boss.x));
    }
    for (let i = 0; i < p.count; i++) {
      const f = p.count > 1 ? (i / (p.count - 1)) - 0.5 : 0;
      this.fireBossBullet(boss.x, boss.y, base + f * p.spread);
    }
  }

  fireBossBullet(x, y, angleDeg) {
    const b = this.bossBullets.get(x, y, 'tex_boss_bullet');
    if (!b) return;
    b.enableBody(true, x, y, true, true);
    const rad = Phaser.Math.DegToRad(angleDeg);
    b.body.setVelocity(Math.cos(rad) * BOSS_BULLET_SPEED, Math.sin(rad) * BOSS_BULLET_SPEED);
  }

  onSquadHitBossBullet(member, bullet) {
    if (this.gameOver) return;
    if (!member.active || !bullet.active) return;
    bullet.disableBody(true, true);
    if (this.time.now < this.invulnUntil) return;
    this.loseSquadMember();
    this.sfx.squadLoss();
  }

  // ─── 부대원 관리 ─────────────────────────────────────────────

  addSquadMember(count = 1) {
    const before = this.squadCount;
    this.squadCount = Math.min(SQUAD_MAX, this.squadCount + count);
    this.syncSquadSprites();
    if (this.squadCount > before && before > 0) this.flashSquadGain();
  }

  syncSquadSprites() {
    const target = actualSquadSize(this.squadCount);
    while (this.squad.length > target) {
      const m = this.squad.pop();
      if (m) m.destroy();
    }
    while (this.squad.length < target) {
      const m = this.physics.add.sprite(this.targetX, PLAYER_Y, playerTexKey(this.weapon));
      m.body.setSize(28, 28);
      this.squadGroup.add(m);
      this.squad.push(m);
    }
    this.layoutSquad();
    if (this.squadText) this.squadText.setText(`부대원 ${this.squadCount}`);
  }

  layoutSquad() {
    const offsets = squadOffsets(this.squad.length);
    this.squad.forEach((m, i) => {
      m.setData('offsetX', offsets[i].x);
      m.setData('offsetY', offsets[i].y);
    });
  }

  flashSquadGain() {
    this.squad.forEach((m) => {
      if (!m.active) return;
      m.setTintFill(0xffffff);
      this.tweens.add({ targets: m, scale: { from: 1.5, to: 1 }, duration: 300, ease: 'Back.easeOut' });
      this.time.delayedCall(130, () => { if (m.active) m.clearTint(); });
    });
    if (this.sparkleEmitter) this.sparkleEmitter.explode(18, this.targetX, PLAYER_Y);
    this.tweens.add({ targets: this.squadText, scale: { from: 1.6, to: 1 }, duration: 250 });
  }

  loseSquadMember() {
    if (this.squadCount <= 0) return;
    this.squadCount -= 1;
    this.syncSquadSprites();
    this.resetCombo();
    this.tweens.add({ targets: this.squadText, scale: { from: 1.4, to: 1 }, duration: 200 });
    this.invulnUntil = this.time.now + SQUAD_SPAWN_INVULN_MS;
    this.squad.forEach((m) => m.setAlpha(0.5));
    this.time.delayedCall(SQUAD_SPAWN_INVULN_MS, () => this.squad.forEach((m) => { if (m.active) m.setAlpha(1); }));
    if (this.squadCount === 0) this.endGame();
  }

  // ─── 사격 ────────────────────────────────────────────────────

  startShootTimer() {
    if (this.shootEvent) this.shootEvent.remove();
    this.shootEvent = this.time.addEvent({
      delay: Math.max(38, Math.round(this.weapon.interval * this.fireRateMult)), loop: true,
      callback: this.shoot, callbackScope: this,
    });
  }

  shoot() {
    if (this.gameOver || this.choosing) return;
    const w = this.weapon;
    if (this.squad.length > 0) this.sfx.shoot();
    const count = w.count + this.bonusCount;
    const dmg = w.damage * this.damageMult;
    const spread = w.spread || (count > 1 ? 24 : 0);
    for (const member of this.squad) {
      if (!member.active) continue;
      for (let i = 0; i < count; i++) {
        const t      = count > 1 ? (i / (count - 1)) - 0.5 : 0;
        const rad    = Phaser.Math.DegToRad(-90 + t * spread);
        const bullet = this.bullets.get(member.x, member.y - 18, 'tex_bullet');
        if (!bullet) continue;
        bullet.enableBody(true, member.x, member.y - 18, true, true);
        bullet.setTexture('tex_bullet');
        bullet.setTint(w.color);
        bullet.body.setVelocity(Math.cos(rad) * w.speed, Math.sin(rad) * w.speed);
        bullet.setData('damage', dmg);
      }
    }
  }

  recycleBullet(b) { b.disableBody(true, true); }

  // ─── 적 스폰 ─────────────────────────────────────────────────

  spawnEnemy() {
    if (this.gameOver || this.choosing) return;
    const type = pickEnemyType(this.stage);
    if (type.cluster) {
      const n = Phaser.Math.Between(type.cluster[0], type.cluster[1]);
      const baseX = Phaser.Math.Between(COMBAT_LEFT + 40, COMBAT_RIGHT - 40);
      for (let i = 0; i < n; i++) {
        const x = Phaser.Math.Clamp(baseX + Phaser.Math.Between(-50, 50), COMBAT_LEFT + 16, COMBAT_RIGHT - 16);
        this.spawnOneEnemy(type, x);
      }
    } else {
      const x = Phaser.Math.Between(COMBAT_LEFT + 20, COMBAT_RIGHT - 20);
      this.spawnOneEnemy(type, x);
    }
  }

  spawnOneEnemy(type, x) {
    const enemy = this.enemies.get(x, -type.radius, type.tex);
    if (!enemy) return;
    enemy.setTexture(type.tex);
    enemy.enableBody(true, x, -type.radius, true, true);
    enemy.body.setSize(type.radius * 2, type.radius * 2, true);

    // 스테이지 비례 체력 상승
    const hp = Math.max(1, Math.round(type.hp * (1 + (this.stage - 1) * 0.35)));
    enemy.body.setVelocity(0, type.speed);
    enemy.setData('hp', hp);
    enemy.setData('maxHp', hp);
    enemy.setData('score', type.score);
    enemy.setData('coin', type.coin);
    enemy.setData('typeKey', type.key);
    enemy.setData('bossStage', 0);
    if (type.zig) {
      enemy.setData('zig', { amp: type.zig.amp, freq: type.zig.freq, baseX: x, phase: Math.random() * Math.PI * 2 });
    } else {
      enemy.setData('zig', null);
    }
    enemy.setData('animPhase', Math.random() * Math.PI * 2);
    enemy.setData('animFreq', Phaser.Math.FloatBetween(3.6, 5.4));
    enemy.setScale(1); enemy.setRotation(0);

    if (enemy.hpBarBg) { enemy.hpBarBg.destroy(); enemy.hpBarBg = null; }
    if (enemy.hpBarFg) { enemy.hpBarFg.destroy(); enemy.hpBarFg = null; }
    // 탱커는 체력바 표시
    if (type.key === 'tanker') {
      const barW = type.radius * 2;
      enemy.hpBarBg = this.add.image(x, -type.radius - 8, 'tex_hpbar_bg').setDisplaySize(barW, 5).setDepth(8);
      enemy.hpBarFg = this.add.image(x - barW / 2, -type.radius - 8, 'tex_hpbar_fg').setDisplaySize(barW, 5).setOrigin(0, 0.5).setDepth(8);
      enemy.hpBarW = barW;
    }
  }

  // ─── 무기 상자 ───────────────────────────────────────────────

  spawnWeaponBox() {
    if (this.gameOver || this.choosing) return;
    const spawnX = WEAPON_BOX_SPAWN_XS[Phaser.Math.Between(0, WEAPON_BOX_SPAWN_XS.length - 1)];
    const startY = -WEAPON_BOX_RADIUS * 2;
    const box = this.weaponBoxes.get(spawnX, startY, 'tex_weapon_box');
    if (!box) return;
    box.enableBody(true, spawnX, startY, true, true);
    box.body.setSize(WEAPON_BOX_RADIUS * 2, WEAPON_BOX_RADIUS * 2, true);
    box.body.setVelocity(0, WEAPON_BOX_FALL_SPEED);

    const minHp = WEAPON_BOX_BASE_HP + this.diffStage * WEAPON_BOX_HP_SCALE;
    const maxHp = minHp + 4 + Math.floor(this.diffStage * 2);
    const hp = Phaser.Math.Between(minHp, maxHp);
    box.setData('hp', hp);
    box.setData('maxHp', hp);

    const maxTier = Math.min(2 + this.stage, WEAPONS.length);
    const pool = WEAPONS.filter((w) => w.tier <= maxTier);
    const droppedWeapon = pool[Phaser.Math.Between(0, pool.length - 1)];
    box.setData('weaponKey', droppedWeapon.key);

    if (box.hpBarBg) { box.hpBarBg.destroy(); box.hpBarBg = null; }
    if (box.hpBarFg) { box.hpBarFg.destroy(); box.hpBarFg = null; }
    const barW = WEAPON_BOX_RADIUS * 2;
    box.hpBarBg = this.add.image(spawnX, startY - WEAPON_BOX_RADIUS - 8, 'tex_hpbar_bg').setDisplaySize(barW, 6).setDepth(8);
    box.hpBarFg = this.add.image(spawnX - barW / 2, startY - WEAPON_BOX_RADIUS - 8, 'tex_hpbar_fg').setDisplaySize(barW, 6).setOrigin(0, 0.5).setDepth(8);
    box.hpBarW = barW;

    if (!box.label) {
      box.label = this.add.text(spawnX, startY, weaponLabel(droppedWeapon), {
        fontFamily: 'monospace', fontSize: '11px', color: rgbHex(droppedWeapon.color), fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(8);
    } else {
      box.label.setVisible(true).setPosition(spawnX, startY).setText(weaponLabel(droppedWeapon)).setColor(rgbHex(droppedWeapon.color));
    }
  }

  killWeaponBox(box, spawnPickup = false) {
    if (spawnPickup) {
      const weaponKey = box.getData('weaponKey');
      if (weaponKey) this.spawnWeaponPickup(box.x, box.y, weaponKey);
    }
    if (box.hpBarBg) { box.hpBarBg.destroy(); box.hpBarBg = null; }
    if (box.hpBarFg) { box.hpBarFg.destroy(); box.hpBarFg = null; }
    if (box.label) box.label.setVisible(false);
    box.disableBody(true, true);
  }

  spawnWeaponPickup(x, y, weaponKey) {
    const w = getWeapon(weaponKey);
    const item = this.weaponPickups.get(x, y, 'tex_weapon_pickup');
    if (!item) return;
    item.enableBody(true, x, y, true, true);
    item.setTint(w.color);
    item.body.setVelocity(0, WEAPON_PICKUP_FALL_SPEED);
    item.setData('weaponKey', weaponKey);
    if (!item.label) {
      item.label = this.add.text(x, y, weaponLabel(w), {
        fontFamily: 'monospace', fontSize: '13px', color: rgbHex(w.color), fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(8);
    } else {
      item.label.setVisible(true).setPosition(x, y).setText(weaponLabel(w)).setColor(rgbHex(w.color));
    }
  }

  equipWeapon(weaponKey) {
    const next = getWeapon(weaponKey);
    this.weapon = next;
    this.weaponText.setText(weaponLabel(next));
    this.weaponText.setColor(rgbHex(next.color));
    this.tweens.add({ targets: this.weaponText, scale: { from: 1.6, to: 1 }, duration: 250 });
    const texKey = playerTexKey(next);
    this.squad.forEach((m) => {
      if (!m.active) return;
      m.setTexture(texKey);
      this.tweens.add({ targets: m, scale: { from: 1.35, to: 1 }, duration: 220, ease: 'Back.easeOut' });
    });
    this.startShootTimer();
  }

  // ─── 코인 ────────────────────────────────────────────────────

  spawnCoins(x, y, n) {
    for (let i = 0; i < n; i++) {
      const c = this.coins.get(x, y, 'tex_coin');
      if (!c) return;
      c.enableBody(true, x, y, true, true);
      c.setDepth(7);
      const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const spd = Phaser.Math.Between(60, 160);
      c.body.setVelocity(Math.cos(ang) * spd, Math.sin(ang) * spd - 40);
      c.setData('born', this.time.now);
    }
  }

  collectCoin(c) {
    c.disableBody(true, true);
    this.gold += 1;
    this.addScore(COIN_VALUE, c.x, c.y, false);
    this.goldText.setText(`🪙 ${this.gold}`);
    this.sfx.coin();
  }

  // ─── 콤보 / 점수 ─────────────────────────────────────────────

  bumpCombo() {
    this.combo += 1;
    this.comboExpire = this.time.now + COMBO_WINDOW_MS;
    if (this.combo >= 3) {
      this.comboText.setText(`COMBO ${this.combo}  x${comboMult(this.combo).toFixed(1)}`);
      this.tweens.add({ targets: this.comboText, scale: { from: 1.35, to: 1 }, duration: 160 });
      if (this.combo % 10 === 0) this.sfx.combo(this.combo / 10);
    }
  }

  resetCombo() {
    if (this.combo >= 3) {
      this.tweens.add({ targets: this.comboText, alpha: { from: 1, to: 0 }, duration: 250,
        onComplete: () => { this.comboText.setText(''); this.comboText.setAlpha(1); } });
    } else {
      this.comboText.setText('');
    }
    this.combo = 0;
  }

  addScore(base, x, y, big) {
    const reward = Math.round(base * comboMult(this.combo));
    this.score += reward;
    this.scoreText.setText(`SCORE ${this.score}`);
    if (this.score > this.hiScore) {
      this.hiScore = this.score;
      this.hiScoreText.setText(`BEST ${this.hiScore}`);
    }
    if (x !== undefined) this.showScorePopup(x, y, reward, big);
    return reward;
  }

  // ─── 에어스트라이크 ──────────────────────────────────────────

  skillReady() { return this.time.now >= this.skillReadyAt; }

  triggerAirstrike() {
    if (!this.skillReady() || this.gameOver || this.choosing) return;
    this.skillReadyAt = this.time.now + AIRSTRIKE_COOLDOWN_MS;
    this.sfx.airstrike();
    this.tweens.add({ targets: this.skillBtnBg, scale: { from: 1.4, to: 1 }, duration: 300, ease: 'Back.easeOut' });
    for (let i = 0; i < AIRSTRIKE_BOMBS; i++) {
      const tx = Phaser.Math.Between(COMBAT_LEFT + 30, COMBAT_RIGHT - 30);
      const ty = Phaser.Math.Between(120, PLAYER_Y - 90);
      this.time.delayedCall(i * 80 + Phaser.Math.Between(0, 60), () => this.dropBomb(tx, ty));
    }
  }

  dropBomb(tx, ty) {
    if (this.gameOver) return;
    const bomb = this.add.image(tx, -20, 'tex_bomb').setDepth(11);
    this.tweens.add({
      targets: bomb, y: ty, duration: 360, ease: 'Quad.easeIn',
      onComplete: () => { bomb.destroy(); this.explodeAt(tx, ty, AIRSTRIKE_RADIUS); },
    });
  }

  explodeAt(x, y, radius) {
    this.boomEmitter.explode(22, x, y);
    this.cameras.main.shake(140, 0.008);
    const r2 = radius * radius;
    this.enemies.getChildren().forEach((e) => {
      if (!e.active) return;
      const dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy > r2) return;
      if (e === this.activeBoss) {
        const dmg = Math.max(1, Math.round(e.getData('maxHp') * 0.12));
        this.damageEnemy(e, dmg, null);
      } else {
        this.killEnemyWithReward(e);
      }
    });
  }

  // ─── 충돌 핸들러 ─────────────────────────────────────────────

  onBulletHitEnemy(bullet, enemy) {
    if (!bullet.active || !enemy.active) return;
    const damage = bullet.getData('damage') ?? 1;
    this.recycleBullet(bullet);
    this.damageEnemy(enemy, damage, bullet);
  }

  // 적/보스에 데미지. 처치 시 보상 처리 (bullet 은 null 가능 — 에어스트라이크)
  damageEnemy(enemy, damage, _bullet) {
    const hp = enemy.getData('hp') - damage;
    if (hp <= 0) {
      this.killEnemyWithReward(enemy);
    } else {
      enemy.setData('hp', hp);
      this.refreshHpBar(enemy);
      this.flashEnemy(enemy);
      if (enemy === this.activeBoss) {
        this.sfx.bossHit();
        const maxHp = enemy.getData('maxHp');
        this.bossText.setText(`S${this.stage} · 보스 ${this.bossNum}/${this.bossCount}  HP ${hp}/${maxHp}`);
      }
    }
  }

  killEnemyWithReward(enemy) {
    const baseReward = enemy.getData('score') ?? 1;
    const wasBoss = enemy === this.activeBoss;
    const coinN = enemy.getData('coin') ?? 0;
    this.bumpCombo();
    this.addScore(baseReward, enemy.x, enemy.y, wasBoss);
    this.deathEmitter.explode(wasBoss ? 28 : 8, enemy.x, enemy.y);
    if (coinN > 0) this.spawnCoins(enemy.x, enemy.y, coinN);
    if (wasBoss) { this.cameras.main.shake(300, 0.02); this.sfx.bossDeath(); }
    else this.sfx.enemyDeath();
    this.killEnemy(enemy);

    if (wasBoss) {
      this.activeBoss = null;
      this.stopBossFire();
      this.clearBossBullets();
      if (this.bossNum >= this.bossCount) {
        this.stageClearTransition();
      } else {
        this.showWavePopup(this.bossNum, this.bossCount);
        this.bossText.setText(`다음 보스: ${BOSS_RESPAWN_DELAY_MS / 1000}초 후`);
        this.time.delayedCall(BOSS_RESPAWN_DELAY_MS, () => this.spawnNextBoss());
      }
    }
  }

  onBulletHitWeaponBox(bullet, box) {
    if (!bullet.active || !box.active) return;
    const damage = bullet.getData('damage') ?? 1;
    this.recycleBullet(bullet);
    const hp = box.getData('hp') - damage;
    if (hp <= 0) {
      this.deathEmitter.explode(14, box.x, box.y);
      this.killWeaponBox(box, true);
    } else {
      box.setData('hp', hp);
      this.refreshHpBar(box);
      this.flashEnemy(box);
    }
  }

  onSquadHitEnemy(member, enemy) {
    if (this.gameOver) return;
    if (!member.active || !enemy.active) return;
    if (this.time.now < this.invulnUntil) return;
    if (enemy !== this.activeBoss) this.killEnemy(enemy);
    this.loseSquadMember();
  }

  onSquadHitWeaponBox(member, box) {
    if (!box.active || this.gameOver) return;
    const bx = box.x, by = box.y;
    const r2 = WEAPON_BOX_KILL_RADIUS * WEAPON_BOX_KILL_RADIUS;
    const k = this.squad.filter((m) => {
      if (!m.active) return false;
      const dx = m.x - bx, dy = m.y - by;
      return dx * dx + dy * dy <= r2;
    }).length;
    this.killWeaponBox(box, false);
    if (k === 0) return;
    const newActual = Math.max(0, this.squad.length - k);
    this.squadCount = logicalFromActual(newActual);
    this.syncSquadSprites();
    this.resetCombo();
    this.sfx.squadLoss();
    this.tweens.add({ targets: this.squadText, scale: { from: 1.4, to: 1 }, duration: 200 });
    this.invulnUntil = this.time.now + SQUAD_SPAWN_INVULN_MS;
    this.squad.forEach((m) => m.setAlpha(0.5));
    this.time.delayedCall(SQUAD_SPAWN_INVULN_MS, () => this.squad.forEach((m) => { if (m.active) m.setAlpha(1); }));
    if (this.squadCount === 0) this.endGame();
  }

  onSquadHitWeaponPickup(_member, item) {
    if (!item.active) return;
    const weaponKey = item.getData('weaponKey');
    if (item.label) item.label.setVisible(false);
    item.disableBody(true, true);
    this.equipWeapon(weaponKey);
    this.sfx.pickup();
  }

  onSquadHitSquadItem(_member, item) {
    if (!item.active) return;
    const type = item.getData('type');
    if (item.label) item.label.setVisible(false);
    item.disableBody(true, true);
    let value = type === 'question' ? Phaser.Math.Between(-1, 2) : item.getData('value');
    if (value > 0) { this.addSquadMember(value); this.sfx.squadGain(); }
    else if (value < 0 && this.squadCount > 0) { this.loseSquadMember(); }
  }

  clearBossBullets() {
    this.bossBullets.getChildren().forEach((b) => { if (b.active) b.disableBody(true, true); });
  }

  // ─── 유틸 ────────────────────────────────────────────────────

  refreshHpBar(target) {
    if (!target.hpBarFg) return;
    const ratio = Math.max(0, target.getData('hp') / target.getData('maxHp'));
    target.hpBarFg.setDisplaySize(target.hpBarW * ratio, target.hpBarFg.displayHeight);
  }

  killEnemy(enemy) {
    if (enemy.hpBarBg) { enemy.hpBarBg.destroy(); enemy.hpBarBg = null; }
    if (enemy.hpBarFg) { enemy.hpBarFg.destroy(); enemy.hpBarFg = null; }
    enemy.disableBody(true, true);
  }

  flashEnemy(obj) {
    obj.setTintFill(0xffffff);
    this.time.delayedCall(50, () => { if (obj.active) obj.clearTint(); });
  }

  showScorePopup(x, y, points, big = false) {
    const text = this.add.text(x, y, `+${points}`, {
      fontFamily: 'monospace', fontSize: big ? '36px' : '16px',
      color: big ? '#ffe066' : '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(14);
    this.tweens.add({ targets: text, y: y - (big ? 80 : 40), alpha: 0, duration: big ? 1200 : 700, onComplete: () => text.destroy() });
  }

  showWavePopup(num, total) {
    const t = this.add.text(WORLD_W / 2, WORLD_H * 0.35, `웨이브 ${num}/${total} 클리어!`, {
      fontFamily: 'sans-serif', fontSize: '22px', color: '#4cc2ff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(15);
    this.tweens.add({ targets: t, y: WORLD_H * 0.28, alpha: 0, duration: 1100, onComplete: () => t.destroy() });
  }

  applyStagePalette(stage) {
    if (!this.bgBase) return;
    const p = paletteFor(stage);
    this.bgBase.setFillStyle(p.base);
    this.bgNeb1.setFillStyle(p.neb1, 0.38);
    this.bgNeb2.setFillStyle(p.neb2, 0.28);
    this.bgNeb3.setFillStyle(p.neb3, 0.22);
  }

  clearStageField() {
    const wipe = (grp) => grp.getChildren().forEach((o) => {
      if (!o.active) return;
      if (o.hpBarBg) { o.hpBarBg.destroy(); o.hpBarBg = null; }
      if (o.hpBarFg) { o.hpBarFg.destroy(); o.hpBarFg = null; }
      if (o.label) o.label.setVisible(false);
      o.disableBody(true, true);
    });
    wipe(this.enemies); wipe(this.bullets); wipe(this.bossBullets);
    wipe(this.weaponBoxes); wipe(this.weaponPickups); wipe(this.squadItems);
    wipe(this.coins);
    if (this.activeGate) this.removeGate(this.activeGate);
  }

  // 스테이지 클리어 — v2는 부대·무기를 계승 (점수/골드 누적, 적·보스 HP만 상승)
  stageClearTransition() {
    this.choosing = true;
    this.physics.pause();
    const cleared = this.stage;
    const bonus = 200 * cleared;
    this.score += bonus;
    this.scoreText.setText(`SCORE ${this.score}`);

    const msg = this.add.text(WORLD_W / 2, WORLD_H / 2, `★ 스테이지 ${cleared} 클리어! ★\n+${bonus} 보너스`, {
      fontFamily: 'sans-serif', fontSize: '36px', color: '#ffe066', fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: msg, scale: { from: 0.4, to: 1 }, duration: 400, ease: 'Back.easeOut' });
    this.sfx.squadGain();
    this.time.delayedCall(1300, () => this.cameras.main.fadeOut(500, 0, 0, 0));

    this.cameras.main.once('camerafadeoutcomplete', () => {
      msg.destroy();
      this.clearStageField();
      this.stage++;
      this.bossNum   = 0;
      this.bossCount = 3 + this.stage;
      this.applyStagePalette(this.stage);
      this.bossText.setText('');

      const t1 = this.add.text(WORLD_W / 2, WORLD_H / 2 - 24, `STAGE ${this.stage}`, {
        fontFamily: 'sans-serif', fontSize: '64px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(30);
      const t2 = this.add.text(WORLD_W / 2, WORLD_H / 2 + 36, `웨이브 ${this.bossCount}개 · 부대 계승!`, {
        fontFamily: 'sans-serif', fontSize: '22px', color: '#ffe066',
      }).setOrigin(0.5).setDepth(30);

      this.cameras.main.fadeIn(500, 0, 0, 0);
      this.cameras.main.once('camerafadeincomplete', () => {
        this.tweens.add({ targets: t1, scale: { from: 0.6, to: 1 }, duration: 300, ease: 'Back.easeOut' });
        this.time.delayedCall(900, () => {
          this.tweens.add({ targets: [t1, t2], alpha: 0, duration: 400, onComplete: () => { t1.destroy(); t2.destroy(); } });
          this.choosing = false;
          this.physics.resume();
          this.time.delayedCall(300, () => this.spawnNextBoss());
        });
      });
    });
  }

  onPointer(pointer) {
    if (this.gameOver) return;
    if (!pointer.isDown) return;
    this.sfx.resume();
    if (this.choosing) return;

    // 음소거 토글
    const b = this.muteBounds;
    if (b && pointer.x >= b.x && pointer.x <= b.x + b.w && pointer.y >= b.y && pointer.y <= b.y + b.h) {
      const muted = this.sfx.toggle();
      this.muteIcon.setText(muted ? '소리 OFF' : '소리 ON');
      return;
    }
    // 에어스트라이크 버튼
    const dx = pointer.x - SKILL_BTN.x, dy = pointer.y - SKILL_BTN.y;
    if (dx * dx + dy * dy <= (SKILL_BTN.r + 12) * (SKILL_BTN.r + 12)) {
      this.triggerAirstrike();
      return;
    }

    this.targetX = Phaser.Math.Clamp(pointer.x, PLAYABLE_LEFT, PLAYABLE_RIGHT);
    if (this.hintText.alpha > 0) this.tweens.add({ targets: this.hintText, alpha: 0, duration: 400 });
  }

  // ─── 게임 오버 ───────────────────────────────────────────────

  endGame() {
    this.gameOver = true;
    if (this.shootEvent)     this.shootEvent.remove();
    if (this.spawnEvent)     this.spawnEvent.remove();
    if (this.weaponBoxEvent) this.weaponBoxEvent.remove();
    if (this.diffEvent)      this.diffEvent.remove();
    if (this.gateEvent)      this.gateEvent.remove();
    if (this.squadItemTimer) this.squadItemTimer.remove();
    this.stopBossFire();
    this.sfx.gameOver();
    this.physics.pause();

    window.setTimeout(() => {
      const handler = () => {
        document.removeEventListener('pointerdown', handler);
        document.removeEventListener('touchstart',  handler);
        this.scene.restart();
      };
      document.addEventListener('pointerdown', handler, { once: true });
      document.addEventListener('touchstart',  handler, { once: true });
    }, 600);

    saveHiScore(this.hiScore);
    const newRecord = this.score > 0 && this.score === this.hiScore;

    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x000000, 0.6).setDepth(25);
    this.add.text(WORLD_W / 2, WORLD_H / 2 - 96, 'GAME OVER', {
      fontFamily: 'monospace', fontSize: '54px', color: '#ff5577',
    }).setOrigin(0.5).setDepth(26);
    this.add.text(WORLD_W / 2, WORLD_H / 2 - 36, `점수: ${this.score}`, {
      fontFamily: 'monospace', fontSize: '32px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(26);
    this.add.text(WORLD_W / 2, WORLD_H / 2 + 2, `🪙 코인: ${this.gold}   ·   도달 S${this.stage}`, {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffd54a',
    }).setOrigin(0.5).setDepth(26);
    this.add.text(WORLD_W / 2, WORLD_H / 2 + 36, `최고: ${this.hiScore}`, {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffe066',
    }).setOrigin(0.5).setDepth(26);
    if (newRecord) {
      this.add.text(WORLD_W / 2, WORLD_H / 2 + 72, '★ 신기록! ★', {
        fontFamily: 'monospace', fontSize: '26px', color: '#4cc2ff',
      }).setOrigin(0.5).setDepth(26);
    }

    const btnY = WORLD_H / 2 + 150;
    const btnBg = this.add.rectangle(WORLD_W / 2, btnY, 320, 96, 0x4cc2ff, 0.35).setStrokeStyle(5, 0xffffff, 1).setDepth(26);
    this.add.text(WORLD_W / 2, btnY, '▶ 다시하기', {
      fontFamily: 'sans-serif', fontSize: '40px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(27);
    this.tweens.add({ targets: btnBg, alpha: { from: 1, to: 0.55 }, duration: 700, yoyo: true, repeat: -1 });
  }

  // ─── 매 프레임 ───────────────────────────────────────────────

  update(_, deltaMs) {
    if (this.gameOver || this.choosing) return;
    const dt = deltaMs / 1000;
    const maxStep = PLAYER_SPEED * this.moveMult * dt;
    const nowSec = this.time.now / 1000;

    // 별
    if (this.stars) {
      for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i];
        s.y += s.vy * dt;
        if (s.y > WORLD_H + 10) { s.y = -10; s.x = Phaser.Math.Between(0, WORLD_W); }
      }
    }

    // 부대원
    this.squad.forEach((m) => {
      if (!m.active) return;
      const wantX = this.targetX + (m.getData('offsetX') ?? 0);
      const wantY = PLAYER_Y    + (m.getData('offsetY') ?? 0);
      m.x += Phaser.Math.Clamp(wantX - m.x, -maxStep, maxStep);
      m.y += Phaser.Math.Clamp(wantY - m.y, -maxStep, maxStep);
    });

    // 총알 정리
    this.bullets.getChildren().forEach((b) => {
      if (!b.active) return;
      if (b.y < -30 || b.y > WORLD_H + 30 || b.x < -30 || b.x > WORLD_W + 30) this.recycleBullet(b);
    });

    // 적
    this.enemies.getChildren().forEach((e) => {
      if (!e.active) return;
      const phase = e.getData('animPhase') ?? 0;
      const freq  = e.getData('animFreq')  ?? 4.0;
      const isBoss = e === this.activeBoss;
      const sqAmp  = isBoss ? 0.06 : 0.10;
      const rotAmp = isBoss ? 0.06 : 0.12;
      const breath = Math.sin(nowSec * freq + phase);
      e.scaleY = 1 + sqAmp * breath;
      e.scaleX = 1 - sqAmp * 0.55 * breath;
      e.rotation = rotAmp * Math.sin(nowSec * freq * 0.65 + phase + 1.2);

      // 지그재그 수평 이동
      const zig = e.getData('zig');
      if (zig && e.body) {
        e.body.setVelocityX(Math.cos(nowSec * zig.freq + zig.phase) * zig.amp);
      }

      if (e.hpBarBg) {
        e.hpBarBg.x = e.x; e.hpBarBg.y = e.y - e.displayHeight / 2 - 8;
        e.hpBarFg.x = e.x - e.hpBarW / 2; e.hpBarFg.y = e.hpBarBg.y;
      }
      if (e.y > WORLD_H + 30) {
        if (e === this.activeBoss) this.onBossEscape(e);
        else this.killEnemy(e);
      }
    });

    // 무기 상자
    this.weaponBoxes.getChildren().forEach((b) => {
      if (!b.active) return;
      if (b.label) { b.label.x = b.x; b.label.y = b.y; }
      if (b.hpBarBg) {
        b.hpBarBg.x = b.x; b.hpBarBg.y = b.y - WEAPON_BOX_RADIUS - 8;
        b.hpBarFg.x = b.x - b.hpBarW / 2; b.hpBarFg.y = b.hpBarBg.y;
      }
      if (b.y > WORLD_H + 30) this.killWeaponBox(b);
    });

    // 픽업/아이템 라벨 추적
    const trackItem = (it) => {
      if (!it.active) return;
      if (it.label) { it.label.x = it.x; it.label.y = it.y; }
      if (it.y > WORLD_H + 30) { if (it.label) it.label.setVisible(false); it.disableBody(true, true); }
    };
    this.weaponPickups.getChildren().forEach(trackItem);
    this.squadItems.getChildren().forEach(trackItem);

    // 코인 — 자석 흡수
    this.coins.getChildren().forEach((c) => {
      if (!c.active) return;
      const dx = this.targetX - c.x, dy = PLAYER_Y - c.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= COIN_COLLECT_R * COIN_COLLECT_R) { this.collectCoin(c); return; }
      // 점차 부대 중심으로 끌려감
      const d = Math.sqrt(d2) || 1;
      const pull = this.time.now - (c.getData('born') ?? 0) > 200 ? 1 : 0.3;
      c.body.setVelocity((dx / d) * COIN_SPEED * pull, (dy / d) * COIN_SPEED * pull);
      if (c.y > WORLD_H + 40) c.disableBody(true, true);
    });

    // 보스 진입 후 정지 + 발사
    const boss = this.activeBoss;
    if (boss && boss.active && !boss.getData('holding') && boss.y >= BOSS_HOLD_Y) {
      boss.y = BOSS_HOLD_Y;
      boss.body.setVelocity(0, 0);
      boss.setData('holding', true);
      this.startBossFire();
    }

    // 보스 탄막 정리
    this.bossBullets.getChildren().forEach((b) => {
      if (!b.active) return;
      if (b.y < -30 || b.y > WORLD_H + 30 || b.x < -30 || b.x > WORLD_W + 30) b.disableBody(true, true);
    });

    // 게이트 이동/판정 (resolve 후엔 패널이 파괴되므로 위치 갱신 생략)
    if (this.activeGate && !this.activeGate.resolved) {
      const g = this.activeGate;
      g.y += GATE_FALL_SPEED * dt;
      this.positionGate(g);
      if (g.y >= PLAYER_Y) this.resolveGate(g);
    }

    // 콤보 만료
    if (this.combo > 0 && this.time.now > this.comboExpire) this.resetCombo();

    // 에어스트라이크 버튼 상태
    this.updateSkillButton();
  }

  updateSkillButton() {
    const ready = this.skillReady();
    const arc = this.skillArc;
    arc.clear();
    if (ready) {
      this.skillLabel.setText('READY');
      this.skillIcon.setAlpha(1);
      this.skillBtnBg.setFillStyle(0xff5533, 0.3);
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 200);
      arc.lineStyle(3, 0xffdd33, 0.4 + 0.6 * pulse);
      arc.strokeCircle(SKILL_BTN.x, SKILL_BTN.y, SKILL_BTN.r + 4);
      if (!this._wasReady) this.sfx.ready();
      this._wasReady = true;
    } else {
      const remain = (this.skillReadyAt - this.time.now) / AIRSTRIKE_COOLDOWN_MS; // 1→0
      this.skillLabel.setText(`${Math.ceil(remain * AIRSTRIKE_COOLDOWN_MS / 1000)}s`);
      this.skillIcon.setAlpha(0.4);
      this.skillBtnBg.setFillStyle(0x444455, 0.3);
      // 채워지는 호 (남은 비율만큼 비움)
      arc.lineStyle(5, 0xff7755, 0.85);
      const start = -Math.PI / 2;
      const end = start + (1 - remain) * Math.PI * 2;
      arc.beginPath();
      arc.arc(SKILL_BTN.x, SKILL_BTN.y, SKILL_BTN.r + 4, start, end, false);
      arc.strokePath();
      this._wasReady = false;
    }
  }

  onBossEscape(boss) {
    this.activeBoss = null;
    this.stopBossFire();
    this.clearBossBullets();
    this.bossText.setText(`보스 탈출! ${BOSS_RESPAWN_DELAY_MS / 1000}초 후 재등장`);
    this.time.delayedCall(BOSS_RESPAWN_DELAY_MS, () => this.spawnNextBoss());
    this.killEnemy(boss);
  }
}
