import Phaser from 'phaser';
import Sfx from '../sfx.js';

const WORLD_W = 540;
const WORLD_H = 960;
const PLAYER_Y = WORLD_H * 0.68;
const PLAYER_SPEED = 800;
const ENEMY_SPAWN_INTERVAL = 60;
const HISCORE_KEY = 'lane-defense:hiscore';

const ZONE_W = WORLD_W * 0.15;
const COMBAT_LEFT = ZONE_W;
const COMBAT_RIGHT = WORLD_W - ZONE_W;
const PLAYABLE_LEFT = 24;
const PLAYABLE_RIGHT = WORLD_W - 24;

const SQUAD_MAX = 12;
const SQUAD_SPAWN_INVULN_MS = 500;

const ENEMY_TYPES = [
  { key: 'normal', tex: 'tex_enemy_normal', radius: 22, color: 0xff5577, hp: 1, speed: 18, score: 1, weight: 100 },
];

const BOSS_STAGES = [
  { stage: 1, tex: 'tex_boss_1', radius: 45, color: 0xff9933, hp: 50,  speed: 30, score: 50 },
  { stage: 2, tex: 'tex_boss_2', radius: 55, color: 0xff5577, hp: 100, speed: 30, score: 100 },
  { stage: 3, tex: 'tex_boss_3', radius: 65, color: 0x9933ff, hp: 200, speed: 30, score: 250 },
  { stage: 4, tex: 'tex_boss_4', radius: 75, color: 0x4c4cff, hp: 400, speed: 30, score: 500 },
  { stage: 5, tex: 'tex_boss_5', radius: 90, color: 0x222222, hp: 800, speed: 30, score: 1000 },
];

const BOSS_INITIAL_DELAY_MS = 10000;
const BOSS_RESPAWN_DELAY_MS = 5000;

// 보스는 이 Y까지 내려와 멈춘 뒤 탄막 발사
const BOSS_HOLD_Y = 200;
const BOSS_BULLET_SPEED = 200;
// 단계별 탄막 패턴 (down = 90도)
const BOSS_PATTERNS = [
  { interval: 1800, count: 1, spread: 0,   aimed: true,  radial: false }, // 1: 조준 단발
  { interval: 1700, count: 3, spread: 44,  aimed: false, radial: false }, // 2: 3-way
  { interval: 1500, count: 5, spread: 70,  aimed: false, radial: false }, // 3: 5-way
  { interval: 1300, count: 3, spread: 18,  aimed: true,  radial: false }, // 4: 조준 점사
  { interval: 1200, count: 10, spread: 0,  aimed: false, radial: true  }, // 5: 전방위
];

function pickEnemyType() {
  const total = ENEMY_TYPES.reduce((s, t) => s + t.weight, 0);
  let r = Phaser.Math.Between(0, total - 1);
  for (const t of ENEMY_TYPES) {
    if (r < t.weight) return t;
    r -= t.weight;
  }
  return ENEMY_TYPES[0];
}

const WEAPONS = [
  { key: 'pistol',  name: '권총',     damage: 1, interval: 300, speed: 700, count: 1, spread: 0,  color: 0xffe066 },
  { key: 'smg',     name: '기관단총', damage: 1, interval: 150, speed: 700, count: 1, spread: 0,  color: 0x4cffc2 },
  { key: 'shotgun', name: '샷건',     damage: 1, interval: 600, speed: 620, count: 5, spread: 35, color: 0xff9933 },
  { key: 'rifle',   name: '라이플',   damage: 3, interval: 350, speed: 850, count: 1, spread: 0,  color: 0x4cc2ff },
  { key: 'mg',      name: '기관총',   damage: 2, interval: 100, speed: 700, count: 1, spread: 0,  color: 0xff5577 },
];

const STARTING_WEAPON_KEY = 'pistol';

function getWeapon(key) {
  return WEAPONS.find((w) => w.key === key) ?? WEAPONS[0];
}

// 부대원 아이템: 좌/우 랜덤, 3~5초 간격
const SQUAD_ITEM_LEFT_X  = ZONE_W / 2;
const SQUAD_ITEM_RIGHT_X = WORLD_W - ZONE_W / 2;
const SQUAD_ITEM_SPAWN_MIN_MS = 3000;
const SQUAD_ITEM_SPAWN_MAX_MS = 5000;
const SQUAD_ITEM_FALL_SPEED = 90;
const STARTING_SQUAD = 3;

// 부대원 아이템 종류: -1 / +1 / +2 / ?
const SQUAD_ITEM_TYPES = [
  { type: 'minus',    value: -1,   label: '-1', color: 0xff3300, weight: 15 },
  { type: 'plus1',   value:  1,   label: '+1', color: 0x3ad27a, weight: 40 },
  { type: 'plus2',   value:  2,   label: '+2', color: 0x44ffaa, weight: 30 },
  { type: 'question', value: null, label: ' ?', color: 0xffcc00, weight: 15 },
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

// 무기 상자: 전투 구역을 3등분한 레인에서 등장
const COMBAT_ZONE_W = COMBAT_RIGHT - COMBAT_LEFT;
const LANE_W = COMBAT_ZONE_W / 3;
const WEAPON_BOX_SPAWN_XS = [
  COMBAT_LEFT + LANE_W * 0.5,
  COMBAT_LEFT + LANE_W * 1.5,
  COMBAT_LEFT + LANE_W * 2.5,
];
const WEAPON_BOX_SPAWN_MS   = 10000;
const WEAPON_BOX_RADIUS     = Math.round(LANE_W * 0.43); // 레인 폭의 약 86%
const WEAPON_BOX_KILL_RADIUS = WEAPON_BOX_RADIUS + 15;
const WEAPON_BOX_FALL_SPEED = 100;
const WEAPON_BOX_BASE_HP    = 5;
const WEAPON_BOX_HP_SCALE   = 3; // 단계당 증가량

// 30초마다 단계 상승 → 무기 상자 체력 증가
const STAGE_ADVANCE_MS = 30000;

const WEAPON_PICKUP_RADIUS    = 16;
const WEAPON_PICKUP_FALL_SPEED = 70;

// 보스 처치 보상: 3중 1 버프 선택 (그 판 한정 누적)
const BUFF_POOL = [
  { key: 'dmg',   name: '데미지 +25%',  desc: '모든 발사체 피해 증가', apply: (s) => { s.damageMult *= 1.25; } },
  { key: 'fire',  name: '연사 +20%',    desc: '발사 간격 감소',        apply: (s) => { s.fireRateMult *= 0.83; s.startShootTimer(); } },
  { key: 'squad', name: '부대원 +5',    desc: '즉시 병력 충원',        apply: (s) => { s.addSquadMember(5); s.sfx.squadGain(); } },
  { key: 'move',  name: '이동 +25%',    desc: '회피 기동력 향상',      apply: (s) => { s.moveMult *= 1.25; } },
  { key: 'score', name: '점수 +50%',    desc: '획득 점수 증가',        apply: (s) => { s.scoreMult *= 1.5; } },
  { key: 'shot',  name: '발사체 +1',    desc: '한 번에 더 많이 발사',  apply: (s) => { s.bonusCount += 1; } },
];

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

function rgbHex(n) {
  return '#' + n.toString(16).padStart(6, '0');
}

// 해바라기(phyllotaxis) 패턴: 원 안에 균등 분포
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

export default class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  preload() {
    this.makeCutePlaneTexture('tex_player');
    this.makeCuteBulletTexture('tex_bullet');
    this.makeCircleTexture('tex_star', 2, 0xffffff);
    for (const t of ENEMY_TYPES) this.makeCuteEnemyTexture(t.tex, t.radius, t.color);
    for (const b of BOSS_STAGES) this.makeCuteBossTexture(b.tex, b.radius, b.color, b.stage);
    this.makeCuteSquadItemTexture('tex_squad_item', 18);
    this.makeCuteWeaponBoxTexture('tex_weapon_box');
    this.makeCuteWeaponPickupTexture('tex_weapon_pickup', WEAPON_PICKUP_RADIUS);
    this.makeCuteParticleTexture('tex_particle');
    this.makeCuteBossBulletTexture('tex_boss_bullet');
    this.makeHpBarTexture('tex_hpbar_bg', 64, 6, false);
    this.makeHpBarTexture('tex_hpbar_fg', 64, 6, true);
  }

  makeCutePlaneTexture(key) {
    const W = 40, H = 50, cx = W / 2; // 20
    const g = this.add.graphics();

    // wings (darker blue, drawn behind body)
    g.fillStyle(0x2ba8e8, 1);
    g.fillTriangle(0, 28, cx - 8, 20, cx - 8, 34);
    g.fillTriangle(cx + 8, 20, W, 28, cx + 8, 34);

    // tail fins
    g.fillTriangle(cx - 8, 38, cx - 8, H, cx - 2, H);
    g.fillTriangle(cx + 8, 38, cx + 2, H, cx + 8, H);

    // fuselage
    g.fillStyle(0x5ecfff, 1);
    g.fillTriangle(cx - 8, 14, cx, 0, cx + 8, 14);
    g.fillRoundedRect(cx - 8, 12, 16, 30, 7);

    // cockpit window (warm yellow)
    g.fillStyle(0xffe98a, 1);
    g.fillCircle(cx, 15, 5);

    // cockpit shine
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - 2, 13, 2);

    // engine exhaust glow
    g.fillStyle(0xff8800, 1);
    g.fillEllipse(cx, 46, 10, 8);
    g.fillStyle(0xffdd00, 1);
    g.fillEllipse(cx, 45, 6, 5);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  // ─── 귀여운 텍스처 생성 ─────────────────────────────────

  makeCuteEnemyTexture(key, r, color) {
    const S = r * 2 + 8, cx = S / 2, cy = S / 2;
    const g = this.add.graphics();
    // outer glow
    g.fillStyle(color, 0.18);
    g.fillCircle(cx, cy, r + 4);
    // main body
    g.fillStyle(color, 1);
    g.fillCircle(cx, cy, r);
    // highlight
    g.fillStyle(0xffffff, 0.28);
    g.fillCircle(cx - r * 0.28, cy - r * 0.28, r * 0.44);
    // eyes
    const er = Math.max(3, r * 0.21), ex = r * 0.3, ey = r * 0.08;
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - ex, cy - ey, er);
    g.fillCircle(cx + ex, cy - ey, er);
    g.fillStyle(0x111122, 1);
    g.fillCircle(cx - ex + 1, cy - ey + 1, er * 0.56);
    g.fillCircle(cx + ex + 1, cy - ey + 1, er * 0.56);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(cx - ex - 1, cy - ey - 1, Math.max(1, er * 0.26));
    g.fillCircle(cx + ex - 1, cy - ey - 1, Math.max(1, er * 0.26));
    // mouth
    g.fillStyle(0x220011, 0.75);
    g.fillEllipse(cx, cy + r * 0.38, r * 0.44, r * 0.22);
    // blush
    g.fillStyle(0xff4466, 0.28);
    g.fillCircle(cx - r * 0.6, cy + r * 0.14, r * 0.21);
    g.fillCircle(cx + r * 0.6, cy + r * 0.14, r * 0.21);
    g.generateTexture(key, S, S);
    g.destroy();
  }

  makeCuteBossTexture(key, r, color, stage) {
    const spikeLen = Math.round(r * 0.28);
    const spikeCount = 4 + stage * 2;
    const S = (r + spikeLen + 6) * 2;
    const cx = S / 2, cy = S / 2;
    const g = this.add.graphics();
    // spikes
    g.fillStyle(color, 0.82);
    for (let i = 0; i < spikeCount; i++) {
      const ang = (i / spikeCount) * Math.PI * 2;
      const tx = cx + Math.cos(ang) * (r + spikeLen);
      const ty = cy + Math.sin(ang) * (r + spikeLen);
      const hw = 0.22;
      g.fillTriangle(
        tx, ty,
        cx + Math.cos(ang - hw) * (r * 0.8), cy + Math.sin(ang - hw) * (r * 0.8),
        cx + Math.cos(ang + hw) * (r * 0.8), cy + Math.sin(ang + hw) * (r * 0.8)
      );
    }
    // glow ring
    g.fillStyle(color, 0.16);
    g.fillCircle(cx, cy, r + 5);
    // main body
    g.fillStyle(color, 1);
    g.fillCircle(cx, cy, r);
    // inner shadow
    g.fillStyle(0x000000, 0.2);
    g.fillCircle(cx, cy + r * 0.14, r * 0.86);
    // highlight
    g.fillStyle(0xffffff, 0.2);
    g.fillCircle(cx - r * 0.28, cy - r * 0.3, r * 0.4);
    // face per stage
    const er = Math.max(4, r * 0.19), ex = r * 0.32, ey = r * 0.04;
    if (stage === 5) {
      // glowing red eyes
      g.fillStyle(0xff2200, 0.35); g.fillCircle(cx - ex, cy - ey, er * 1.6); g.fillCircle(cx + ex, cy - ey, er * 1.6);
      g.fillStyle(0xff4400, 1);    g.fillCircle(cx - ex, cy - ey, er);         g.fillCircle(cx + ex, cy - ey, er);
      g.fillStyle(0xffaa00, 1);    g.fillCircle(cx - ex, cy - ey, er * 0.48);  g.fillCircle(cx + ex, cy - ey, er * 0.48);
      g.fillStyle(0xff2200, 0.8);  g.fillEllipse(cx, cy + r * 0.36, r * 0.62, r * 0.22);
    } else if (stage === 4) {
      // angular triangular eyes (cold blue)
      g.fillStyle(0x88ddff, 1);
      g.fillTriangle(cx - ex - er, cy - ey - er, cx - ex + er, cy - ey - er, cx - ex, cy - ey + er);
      g.fillTriangle(cx + ex - er, cy - ey - er, cx + ex + er, cy - ey - er, cx + ex, cy - ey + er);
      g.fillStyle(0x2233bb, 0.9);
      g.fillRect(cx - r * 0.28, cy + r * 0.28, r * 0.56, r * 0.14);
    } else if (stage === 3) {
      // cyclops swirl eye
      g.fillStyle(0xffffff, 1);   g.fillCircle(cx, cy - r * 0.08, er * 1.4);
      g.fillStyle(0x6600cc, 1);   g.fillCircle(cx, cy - r * 0.08, er);
      g.fillStyle(0xffffff, 1);   g.fillCircle(cx, cy - r * 0.08, er * 0.46);
      g.fillStyle(0x000000, 1);   g.fillCircle(cx, cy - r * 0.08, er * 0.2);
      g.fillStyle(0x440099, 0.9); g.fillEllipse(cx, cy + r * 0.36, r * 0.5, r * 0.2);
    } else if (stage === 2) {
      // angry squint + fangs
      g.fillStyle(0xffee00, 1); g.fillEllipse(cx - ex, cy - ey, er * 2.2, er * 1.1); g.fillEllipse(cx + ex, cy - ey, er * 2.2, er * 1.1);
      g.fillStyle(0x000000, 1); g.fillCircle(cx - ex + 1, cy - ey + 1, er * 0.6); g.fillCircle(cx + ex + 1, cy - ey + 1, er * 0.6);
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(cx - r * 0.16, cy + r * 0.22, cx - r * 0.06, cy + r * 0.22, cx - r * 0.11, cy + r * 0.42);
      g.fillTriangle(cx + r * 0.06, cy + r * 0.22, cx + r * 0.16, cy + r * 0.22, cx + r * 0.11, cy + r * 0.42);
    } else {
      // stage 1: cute surprised + little horns
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
    // body (white → tinted by weapon color)
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(cx, H * 0.58, W, H * 0.7);
    g.fillTriangle(2, H * 0.46, cx, 0, W - 2, H * 0.46);
    // center highlight
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

  makeCuteWeaponBoxTexture(key) {
    const r = WEAPON_BOX_RADIUS, S = r * 2, half = r;
    const g = this.add.graphics();
    // wood body
    g.fillStyle(0xc8913a, 1);
    g.fillRoundedRect(2, 2, S - 4, S - 4, 9);
    // grain lines
    g.fillStyle(0xa8711a, 1);
    g.fillRect(2, half - 4, S - 4, 8);
    g.fillRect(half - 4, 2, 8, S - 4);
    // wood texture stripes
    g.fillStyle(0xb87c22, 0.5);
    g.fillRect(18, 2, 4, S - 4);
    g.fillRect(S - 22, 2, 4, S - 4);
    // metal corners
    g.fillStyle(0x778899, 1);
    const cs = 14;
    g.fillRoundedRect(2, 2, cs, cs, 4);
    g.fillRoundedRect(S - cs - 2, 2, cs, cs, 4);
    g.fillRoundedRect(2, S - cs - 2, cs, cs, 4);
    g.fillRoundedRect(S - cs - 2, S - cs - 2, cs, cs, 4);
    // corner shine
    g.fillStyle(0xaabbcc, 0.6);
    g.fillRect(4, 4, 4, 4);
    g.fillRect(S - 10, 4, 4, 4);
    // center lock star
    const lpts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
      const lr = i % 2 === 0 ? 11 : 5;
      lpts.push({ x: half + Math.cos(a) * lr, y: half + Math.sin(a) * lr });
    }
    g.fillStyle(0xffcc44, 1);
    g.fillPoints(lpts, true);
    g.fillStyle(0xffe888, 1);
    g.fillCircle(half, half, 4);
    // top highlight
    g.fillStyle(0xffffff, 0.12);
    g.fillRoundedRect(4, 4, S - 8, (S - 8) * 0.42, 7);
    g.generateTexture(key, S, S);
    g.destroy();
  }

  makeCuteWeaponPickupTexture(key, r) {
    const S = r * 2 + 6, cx = S / 2, cy = S / 2;
    const g = this.add.graphics();
    // 5-pointed star (white for tinting)
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.42;
      pts.push({ x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad });
    }
    g.fillStyle(0xffffff, 0.25); g.fillCircle(cx, cy, r + 2); // glow
    g.fillStyle(0xffffff, 1);    g.fillPoints(pts, true);
    g.fillStyle(0xffffff, 0.6);  g.fillCircle(cx, cy, r * 0.32); // center
    g.generateTexture(key, S, S);
    g.destroy();
  }

  makeCuteSquadItemTexture(key, r) {
    const S = r * 2 + 6, cx = S / 2, cy = S / 2;
    const g = this.add.graphics();
    // hexagonal badge (white for tinting)
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 - Math.PI / 6;
      pts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
    }
    g.fillStyle(0xffffff, 0.2); g.fillCircle(cx, cy, r + 2); // outer glow
    g.fillStyle(0xffffff, 1);   g.fillPoints(pts, true);
    g.fillStyle(0xffffff, 0.35); g.fillCircle(cx - r * 0.2, cy - r * 0.25, r * 0.42); // highlight
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
      g.fillStyle(0xff4466, 1);    g.fillRect(0, 0, w, h);
      g.fillStyle(0xff88aa, 0.6);  g.fillRect(0, 0, w, h * 0.38);
    } else {
      g.fillStyle(0x110818, 1);    g.fillRect(0, 0, w, h);
      g.fillStyle(0x221028, 0.8);  g.fillRect(0, h * 0.5, w, h * 0.5);
    }
    g.generateTexture(key, w, h);
    g.destroy();
  }

  makeTriangleTexture(key, w, h, color) {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillTriangle(0, h, w / 2, 0, w, h);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  makeRectTexture(key, w, h, color) {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRect(0, 0, w, h);
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

  create() {
    this.score        = 0;
    this.hiScore      = loadHiScore();
    this.gameOver     = false;
    this.weapon       = getWeapon(STARTING_WEAPON_KEY);
    this.invulnUntil  = 0;
    this.targetX      = WORLD_W / 2;
    this.stage        = 1;          // 스테이지 1부터 무한대
    this.bossNum      = 0;          // 현재 스테이지에서 처치/진행한 보스 번호
    this.bossCount    = 4 + this.stage; // 스테이지당 보스 수 (stage1=5, 이후 +1씩)
    this.activeBoss   = null;
    this.gameStage    = 0;          // 무기 상자 난이도용 시간 카운터(별개)
    this.choosing     = false;
    this.damageMult   = 1;
    this.fireRateMult = 1;
    this.moveMult     = 1;
    this.scoreMult    = 1;
    this.bonusCount   = 0;
    if (!this.sfx) this.sfx = new Sfx();

    // 배경 — 딥 스페이스
    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x080818);
    // 성운 오버레이
    this.add.rectangle(WORLD_W / 2, WORLD_H * 0.3, WORLD_W, WORLD_H * 0.44, 0x18083c, 0.38);
    this.add.rectangle(WORLD_W * 0.3, WORLD_H * 0.65, WORLD_W * 0.5, WORLD_H * 0.32, 0x081828, 0.28);
    this.add.rectangle(WORLD_W * 0.75, WORLD_H * 0.5, WORLD_W * 0.4, WORLD_H * 0.28, 0x200828, 0.22);
    // 별 — 크기/밝기 다양
    for (let i = 0; i < 100; i++) {
      const bright = Phaser.Math.FloatBetween(0.15, 0.95);
      const scale  = bright > 0.75 ? Phaser.Math.FloatBetween(1.2, 2.2) : Phaser.Math.FloatBetween(0.4, 1.0);
      this.add.image(
        Phaser.Math.Between(0, WORLD_W),
        Phaser.Math.Between(0, WORLD_H),
        'tex_star'
      ).setAlpha(bright).setScale(scale);
    }

    // 좌우 부대원 아이템 구역 (부드러운 연두 띠)
    this.add.rectangle(ZONE_W / 2,            WORLD_H / 2, ZONE_W, WORLD_H, 0x3ad27a, 0.07);
    this.add.rectangle(WORLD_W - ZONE_W / 2,  WORLD_H / 2, ZONE_W, WORLD_H, 0x3ad27a, 0.07);
    this.add.rectangle(COMBAT_LEFT,  WORLD_H / 2, 2, WORLD_H, 0x5aeea0, 0.22);
    this.add.rectangle(COMBAT_RIGHT, WORLD_H / 2, 2, WORLD_H, 0x5aeea0, 0.22);

    // 물리 그룹
    this.squadGroup   = this.physics.add.group();
    this.squad        = [];
    this.addSquadMember(STARTING_SQUAD);

    this.bullets       = this.physics.add.group({ defaultKey: 'tex_bullet',        maxSize: 400 });
    this.enemies       = this.physics.add.group({ defaultKey: 'tex_enemy_normal',  maxSize: 250 });
    this.weaponBoxes   = this.physics.add.group({ defaultKey: 'tex_weapon_box',    maxSize: 10  });
    this.weaponPickups = this.physics.add.group({ defaultKey: 'tex_weapon_pickup', maxSize: 10  });
    this.squadItems    = this.physics.add.group({ defaultKey: 'tex_squad_item',    maxSize: 20  });
    this.bossBullets   = this.physics.add.group({ defaultKey: 'tex_boss_bullet',   maxSize: 120 });

    this.deathEmitter = this.add.particles(0, 0, 'tex_particle', {
      speed: { min: 60, max: 200 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      lifespan: 350,
      emitting: false,
    });
    this.deathEmitter.setDepth(5);

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

    // HUD
    this.scoreText = this.add.text(20, 18, 'SCORE 0', {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffffff',
    });
    this.hiScoreText = this.add.text(WORLD_W - 20, 18, `BEST ${this.hiScore}`, {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffe066',
    }).setOrigin(1, 0);
    this.squadText = this.add.text(WORLD_W / 2, 18, `부대원 ${this.squad.length}`, {
      fontFamily: 'monospace', fontSize: '20px', color: '#3ad27a', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.weaponText = this.add.text(WORLD_W / 2, 44, this.weapon.name, {
      fontFamily: 'monospace', fontSize: '14px',
      color: rgbHex(this.weapon.color), fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.bossText = this.add.text(WORLD_W / 2, 62, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ff9933', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    // 음소거 토글 (좌하단). onPointer에서 좌표로 판정
    this.muteIcon = this.add.text(20, WORLD_H - 36, this.sfx.muted ? '소리 OFF' : '소리 ON', {
      fontFamily: 'monospace', fontSize: '15px', color: '#ffffff90',
    });
    this.muteBounds = { x: 10, y: WORLD_H - 48, w: 130, h: 40 };

    this.add.rectangle(WORLD_W / 2, (PLAYER_Y + WORLD_H) / 2 + 20, WORLD_W, WORLD_H - PLAYER_Y - 60, 0xffffff, 0.02);
    this.hintText = this.add.text(WORLD_W / 2, WORLD_H - 60,
      '드래그로 이동 · 초록 원 = 부대원 · 빨간 원 = 위험!', {
        fontFamily: 'monospace', fontSize: '12px', color: '#ffffff80',
      }).setOrigin(0.5);
    this.add.text(WORLD_W / 2, WORLD_H - 30, '· 터치 영역 ·', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffffff40',
    }).setOrigin(0.5);

    // 타이머
    this.startShootTimer();

    this.spawnEvent = this.time.addEvent({
      delay: ENEMY_SPAWN_INTERVAL, loop: true,
      callback: this.spawnEnemy, callbackScope: this,
    });
    this.weaponBoxEvent = this.time.addEvent({
      delay: WEAPON_BOX_SPAWN_MS, loop: true,
      callback: this.spawnWeaponBox, callbackScope: this,
    });
    this.stageEvent = this.time.addEvent({
      delay: STAGE_ADVANCE_MS, loop: true,
      callback: () => { this.gameStage++; }, callbackScope: this,
    });

    this.scheduleNextSquadItem();
    this.time.delayedCall(BOSS_INITIAL_DELAY_MS, () => this.spawnNextBoss());
  }

  // ─── 부대원 아이템 ────────────────────────────────────────

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
        item.setData('type',  def.type);
        item.setData('value', def.value);
        if (!item.label) {
          item.label = this.add.text(spawnX, -20, def.label, {
            fontFamily: 'monospace', fontSize: '14px',
            color: rgbHex(def.color), fontStyle: 'bold',
          }).setOrigin(0.5);
        } else {
          item.label.setVisible(true).setPosition(spawnX, -20)
            .setText(def.label).setColor(rgbHex(def.color));
        }
      }
    }
    this.scheduleNextSquadItem();
  }

  // ─── 보스 ────────────────────────────────────────────────

  spawnNextBoss() {
    if (this.gameOver) return;
    if (this.activeBoss) return;

    const next = this.bossNum + 1;
    if (next > this.bossCount) {
      // ── 스테이지 클리어 → 다음 스테이지 (무기 리셋, 점수 유지) ──
      this.stage++;
      this.bossNum   = 0;
      this.bossCount = 4 + this.stage;
      this.equipWeapon(STARTING_WEAPON_KEY);
      this.bossText.setText(`★ 스테이지 ${this.stage} ★ (보스 ${this.bossCount})`);
      this.tweens.add({ targets: this.bossText, scale: { from: 1.8, to: 1 }, duration: 500 });
      this.time.delayedCall(BOSS_RESPAWN_DELAY_MS, () => this.spawnNextBoss());
      return;
    }

    this.bossNum = next;
    // 보스 외형은 5종 텍스처를 순환 사용 (보스6 = 보스1 외형, ...)
    const def = BOSS_STAGES[(next - 1) % BOSS_STAGES.length];
    const x   = WORLD_W / 2;
    const boss = this.enemies.get(x, -def.radius, def.tex);
    if (!boss) return;

    boss.setTexture(def.tex);
    boss.enableBody(true, x, -def.radius, true, true);
    boss.body.setSize(def.radius * 2, def.radius * 2, true);
    boss.body.setVelocity(0, def.speed);

    // 스테이지가 오를수록 +50%, 스테이지 내에서도 보스마다 +12%씩 강해짐
    const hpMult  = 1 + (this.stage - 1) * 0.5 + (next - 1) * 0.12;
    const actualHp = Math.round(def.hp * hpMult);
    boss.setData('hp',       actualHp);
    boss.setData('maxHp',    actualHp);
    boss.setData('score',    Math.round(def.score * hpMult));
    boss.setData('typeKey',  'boss');
    boss.setData('bossStage', def.stage);
    boss.setData('holding', false);
    this.stopBossFire();

    if (boss.hpBarBg) { boss.hpBarBg.destroy(); boss.hpBarBg = null; }
    if (boss.hpBarFg) { boss.hpBarFg.destroy(); boss.hpBarFg = null; }
    const barW  = def.radius * 2;
    const barBg = this.add.image(x, -def.radius - 10, 'tex_hpbar_bg').setDisplaySize(barW, 8);
    const barFg = this.add.image(x - barW / 2, -def.radius - 10, 'tex_hpbar_fg')
      .setDisplaySize(barW, 8).setOrigin(0, 0.5);
    boss.hpBarBg = barBg;
    boss.hpBarFg = barFg;
    boss.hpBarW  = barW;

    this.activeBoss = boss;
    this.sfx.bossAppear();
    this.bossText.setText(`S${this.stage} · 보스 ${this.bossNum}/${this.bossCount}  HP ${actualHp}`);
    this.tweens.add({ targets: this.bossText, scale: { from: 1.6, to: 1 }, duration: 400 });
  }

  startBossFire() {
    this.stopBossFire();
    const pattern = BOSS_PATTERNS[(this.bossNum - 1) % BOSS_PATTERNS.length];
    this.bossFireEvent = this.time.addEvent({
      delay: pattern.interval,
      loop: true,
      callback: this.fireBossPattern,
      callbackScope: this,
    });
  }

  stopBossFire() {
    if (this.bossFireEvent) { this.bossFireEvent.remove(); this.bossFireEvent = null; }
  }

  fireBossPattern() {
    const boss = this.activeBoss;
    if (!boss || !boss.active || this.gameOver) return;
    this.sfx.bossShoot();
    const p = BOSS_PATTERNS[(this.bossNum - 1) % BOSS_PATTERNS.length];
    if (p.radial) {
      for (let i = 0; i < p.count; i++) {
        this.fireBossBullet(boss.x, boss.y, (i / p.count) * 360);
      }
      return;
    }
    let base = 90;
    if (p.aimed) {
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
    this.loseSquadMember(member);
    this.sfx.squadLoss();
  }

  // ─── 부대원 관리 ─────────────────────────────────────────

  addSquadMember(count = 1) {
    for (let i = 0; i < count; i++) {
      if (this.squad.length >= SQUAD_MAX) break;
      const m = this.physics.add.sprite(this.targetX, PLAYER_Y, 'tex_player');
      m.body.setSize(28, 28);
      this.squadGroup.add(m);
      this.squad.push(m);
    }
    this.layoutSquad();
    if (this.squadText) this.squadText.setText(`부대원 ${this.squad.length}`);
  }

  layoutSquad() {
    const offsets = squadOffsets(this.squad.length);
    this.squad.forEach((m, i) => {
      m.setData('offsetX', offsets[i].x);
      m.setData('offsetY', offsets[i].y);
    });
  }

  removeSquadMember(member) {
    const idx = this.squad.indexOf(member);
    if (idx < 0) return;
    this.squad.splice(idx, 1);
    member.destroy();
  }

  loseSquadMember(member) {
    const idx = this.squad.indexOf(member);
    if (idx < 0) return;
    this.squad.splice(idx, 1);
    member.destroy();
    this.layoutSquad();
    this.squadText.setText(`부대원 ${this.squad.length}`);
    this.tweens.add({ targets: this.squadText, scale: { from: 1.4, to: 1 }, duration: 200 });
    this.invulnUntil = this.time.now + SQUAD_SPAWN_INVULN_MS;
    this.squad.forEach((m) => m.setAlpha(0.5));
    this.time.delayedCall(SQUAD_SPAWN_INVULN_MS, () => this.squad.forEach((m) => m.setAlpha(1)));
    if (this.squad.length === 0) this.endGame();
  }

  // ─── 사격 ────────────────────────────────────────────────

  startShootTimer() {
    if (this.shootEvent) this.shootEvent.remove();
    this.shootEvent = this.time.addEvent({
      delay: Math.max(40, Math.round(this.weapon.interval * this.fireRateMult)), loop: true,
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

  // ─── 적 스폰 ─────────────────────────────────────────────

  spawnEnemy() {
    if (this.gameOver) return;
    const x    = Phaser.Math.Between(COMBAT_LEFT + 20, COMBAT_RIGHT - 20);
    const type = pickEnemyType();
    const enemy = this.enemies.get(x, -type.radius, type.tex);
    if (!enemy) return;
    enemy.setTexture(type.tex);
    enemy.enableBody(true, x, -type.radius, true, true);
    enemy.body.setSize(type.radius * 2, type.radius * 2, true);
    enemy.body.setVelocity(0, type.speed);
    enemy.setData('hp',      type.hp);
    enemy.setData('maxHp',   type.hp);
    enemy.setData('score',   type.score);
    enemy.setData('typeKey', type.key);
    enemy.setData('bossStage', 0);
    if (enemy.hpBarBg) { enemy.hpBarBg.destroy(); enemy.hpBarBg = null; }
    if (enemy.hpBarFg) { enemy.hpBarFg.destroy(); enemy.hpBarFg = null; }
  }

  // ─── 무기 상자 ───────────────────────────────────────────

  spawnWeaponBox() {
    if (this.gameOver) return;
    const spawnX = WEAPON_BOX_SPAWN_XS[Phaser.Math.Between(0, WEAPON_BOX_SPAWN_XS.length - 1)];
    const startY = -WEAPON_BOX_RADIUS * 2;
    const box    = this.weaponBoxes.get(spawnX, startY, 'tex_weapon_box');
    if (!box) return;

    box.enableBody(true, spawnX, startY, true, true);
    box.body.setSize(WEAPON_BOX_RADIUS * 2, WEAPON_BOX_RADIUS * 2, true);
    box.body.setVelocity(0, WEAPON_BOX_FALL_SPEED);

    const minHp = WEAPON_BOX_BASE_HP + this.gameStage * WEAPON_BOX_HP_SCALE;
    const maxHp = minHp + 4 + Math.floor(this.gameStage * 2);
    const hp    = Phaser.Math.Between(minHp, maxHp);
    box.setData('hp',    hp);
    box.setData('maxHp', hp);

    const droppedWeapon = WEAPONS[Phaser.Math.Between(0, WEAPONS.length - 1)];
    box.setData('weaponKey', droppedWeapon.key);

    if (box.hpBarBg) { box.hpBarBg.destroy(); box.hpBarBg = null; }
    if (box.hpBarFg) { box.hpBarFg.destroy(); box.hpBarFg = null; }
    const barW  = WEAPON_BOX_RADIUS * 2;
    const barBg = this.add.image(spawnX, startY - WEAPON_BOX_RADIUS - 8, 'tex_hpbar_bg').setDisplaySize(barW, 6);
    const barFg = this.add.image(spawnX - barW / 2, startY - WEAPON_BOX_RADIUS - 8, 'tex_hpbar_fg')
      .setDisplaySize(barW, 6).setOrigin(0, 0.5);
    box.hpBarBg = barBg;
    box.hpBarFg = barFg;
    box.hpBarW  = barW;

    if (!box.label) {
      box.label = this.add.text(spawnX, startY, droppedWeapon.name, {
        fontFamily: 'monospace', fontSize: '11px',
        color: rgbHex(droppedWeapon.color), fontStyle: 'bold',
      }).setOrigin(0.5);
    } else {
      box.label.setVisible(true).setPosition(spawnX, startY)
        .setText(droppedWeapon.name).setColor(rgbHex(droppedWeapon.color));
    }
  }

  killWeaponBox(box, spawnPickup = false) {
    if (spawnPickup) {
      const weaponKey = box.getData('weaponKey');
      if (weaponKey) this.spawnWeaponPickup(box.x, box.y, weaponKey);
    }
    if (box.hpBarBg) { box.hpBarBg.destroy(); box.hpBarBg = null; }
    if (box.hpBarFg) { box.hpBarFg.destroy(); box.hpBarFg = null; }
    if (box.label)   box.label.setVisible(false);
    box.disableBody(true, true);
  }

  spawnWeaponPickup(x, y, weaponKey) {
    const w    = getWeapon(weaponKey);
    const item = this.weaponPickups.get(x, y, 'tex_weapon_pickup');
    if (!item) return;
    item.enableBody(true, x, y, true, true);
    item.setTint(w.color);
    item.body.setVelocity(0, WEAPON_PICKUP_FALL_SPEED);
    item.setData('weaponKey', weaponKey);
    if (!item.label) {
      item.label = this.add.text(x, y, w.name, {
        fontFamily: 'monospace', fontSize: '13px',
        color: rgbHex(w.color), fontStyle: 'bold',
      }).setOrigin(0.5);
    } else {
      item.label.setVisible(true).setPosition(x, y).setText(w.name).setColor(rgbHex(w.color));
    }
  }

  equipWeapon(weaponKey) {
    const next = getWeapon(weaponKey);
    this.weapon = next;
    this.weaponText.setText(next.name);
    this.weaponText.setColor(rgbHex(next.color));
    this.tweens.add({ targets: this.weaponText, scale: { from: 1.6, to: 1 }, duration: 250 });
    this.startShootTimer();
  }

  // ─── 충돌 핸들러 ─────────────────────────────────────────

  onBulletHitEnemy(bullet, enemy) {
    if (!bullet.active || !enemy.active) return;
    const damage = bullet.getData('damage') ?? 1;
    this.recycleBullet(bullet);
    const hp = enemy.getData('hp') - damage;
    if (hp <= 0) {
      const baseReward = enemy.getData('score') ?? 1;
      const reward  = Math.round(baseReward * this.scoreMult);
      const wasBoss = enemy === this.activeBoss;
      this.showScorePopup(enemy.x, enemy.y, reward, wasBoss);
      this.deathEmitter.explode(wasBoss ? 28 : 8, enemy.x, enemy.y);
      if (wasBoss) this.cameras.main.shake(300, 0.02);
      if (wasBoss) this.sfx.bossDeath(); else this.sfx.enemyDeath();
      this.killEnemy(enemy);
      this.score += reward;
      this.scoreText.setText(`SCORE ${this.score}`);
      if (this.score > this.hiScore) {
        this.hiScore = this.score;
        this.hiScoreText.setText(`BEST ${this.hiScore}`);
      }
      if (wasBoss) {
        this.activeBoss = null;
        this.stopBossFire();
        this.clearBossBullets();
        this.showBuffSelection();
      }
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
    this.loseSquadMember(member);
  }

  onSquadHitWeaponBox(member, box) {
    if (!box.active || this.gameOver) return;
    const bx = box.x, by = box.y;
    const r2 = WEAPON_BOX_KILL_RADIUS * WEAPON_BOX_KILL_RADIUS;
    const toKill = this.squad.filter((m) => {
      if (!m.active) return false;
      const dx = m.x - bx, dy = m.y - by;
      return dx * dx + dy * dy <= r2;
    });
    this.killWeaponBox(box, false);
    if (toKill.length === 0) return;
    toKill.forEach((m) => this.removeSquadMember(m));
    this.sfx.squadLoss();
    this.layoutSquad();
    this.squadText.setText(`부대원 ${this.squad.length}`);
    this.tweens.add({ targets: this.squadText, scale: { from: 1.4, to: 1 }, duration: 200 });
    this.invulnUntil = this.time.now + SQUAD_SPAWN_INVULN_MS;
    this.squad.forEach((m) => m.setAlpha(0.5));
    this.time.delayedCall(SQUAD_SPAWN_INVULN_MS, () => this.squad.forEach((m) => m.setAlpha(1)));
    if (this.squad.length === 0) this.endGame();
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

    let value = type === 'question'
      ? Phaser.Math.Between(-1, 2)
      : item.getData('value');

    if (value > 0) {
      this.addSquadMember(value);
      this.sfx.squadGain();
      this.tweens.add({ targets: this.squadText, scale: { from: 1.6, to: 1 }, duration: 250 });
    } else if (value < 0 && this.squad.length > 0) {
      const victim = this.squad[Phaser.Math.Between(0, this.squad.length - 1)];
      this.loseSquadMember(victim);
    }
  }

  clearBossBullets() {
    this.bossBullets.getChildren().forEach((b) => {
      if (b.active) b.disableBody(true, true);
    });
  }

  showBuffSelection() {
    this.choosing = true;
    this.physics.pause();
    this.bossText.setText('강화를 선택하라!');

    const picks = Phaser.Utils.Array.Shuffle([...BUFF_POOL]).slice(0, 3);
    const overlay = this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x000000, 0.72).setDepth(20);
    const title = this.add.text(WORLD_W / 2, WORLD_H * 0.24, '★ 강화 선택 ★', {
      fontFamily: 'sans-serif', fontSize: '34px', color: '#ffe066', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(21);

    const cardW = WORLD_W * 0.82, cardH = 96, gap = 22;
    const startY = WORLD_H * 0.36;
    this.buffCards = [];
    picks.forEach((buff, i) => {
      const cy = startY + i * (cardH + gap);
      const rect = this.add.rectangle(WORLD_W / 2, cy, cardW, cardH, 0x4cc2ff, 0.28)
        .setStrokeStyle(4, 0xffffff, 1).setDepth(21);
      const name = this.add.text(WORLD_W / 2, cy - 16, buff.name, {
        fontFamily: 'sans-serif', fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(22);
      const desc = this.add.text(WORLD_W / 2, cy + 22, buff.desc, {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffffffcc',
      }).setOrigin(0.5).setDepth(22);
      this.buffCards.push({
        bounds: { x: WORLD_W / 2 - cardW / 2, y: cy - cardH / 2, w: cardW, h: cardH },
        buff, objs: [rect, name, desc],
      });
    });
    this.buffUi = [overlay, title];
  }

  closeBuffSelection() {
    this.choosing = false;
    this.physics.resume();
    if (this.buffUi) this.buffUi.forEach((o) => o.destroy());
    if (this.buffCards) this.buffCards.forEach((c) => c.objs.forEach((o) => o.destroy()));
    this.buffUi = null;
    this.buffCards = null;
    this.bossText.setText(`다음 보스: ${BOSS_RESPAWN_DELAY_MS / 1000}초 후`);
    this.time.delayedCall(BOSS_RESPAWN_DELAY_MS, () => this.spawnNextBoss());
  }

  onBossEscape(boss) {
    this.activeBoss = null;
    this.stopBossFire();
    this.clearBossBullets();
    this.bossText.setText(`보스 탈출! ${BOSS_RESPAWN_DELAY_MS / 1000}초 후 재등장`);
    this.time.delayedCall(BOSS_RESPAWN_DELAY_MS, () => this.spawnNextBoss());
    this.killEnemy(boss);
  }

  // ─── 유틸리티 ────────────────────────────────────────────

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
    this.time.delayedCall(50, () => {
      if (obj.active) obj.clearTint();
    });
  }

  showScorePopup(x, y, points, big = false) {
    const text = this.add.text(x, y, `+${points}`, {
      fontFamily: 'monospace',
      fontSize: big ? '36px' : '16px',
      color: big ? '#ffe066' : '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.tweens.add({
      targets: text,
      y: y - (big ? 80 : 40),
      alpha: 0,
      duration: big ? 1200 : 700,
      onComplete: () => text.destroy(),
    });
  }

  onPointer(pointer) {
    if (this.gameOver) return;
    if (!pointer.isDown) return;
    this.sfx.resume();
    if (this.choosing) {
      if (this.buffCards) {
        for (const card of this.buffCards) {
          const c = card.bounds;
          if (pointer.x >= c.x && pointer.x <= c.x + c.w &&
              pointer.y >= c.y && pointer.y <= c.y + c.h) {
            card.buff.apply(this);
            this.sfx.pickup();
            this.closeBuffSelection();
            return;
          }
        }
      }
      return;
    }
    const b = this.muteBounds;
    if (b && pointer.x >= b.x && pointer.x <= b.x + b.w &&
        pointer.y >= b.y && pointer.y <= b.y + b.h) {
      const muted = this.sfx.toggle();
      this.muteIcon.setText(muted ? '소리 OFF' : '소리 ON');
      return;
    }
    this.targetX = Phaser.Math.Clamp(pointer.x, PLAYABLE_LEFT, PLAYABLE_RIGHT);
    if (this.hintText.alpha > 0)
      this.tweens.add({ targets: this.hintText, alpha: 0, duration: 400 });
  }

  // ─── 게임 오버 ───────────────────────────────────────────

  endGame() {
    this.gameOver = true;
    if (this.shootEvent)      this.shootEvent.remove();
    if (this.spawnEvent)      this.spawnEvent.remove();
    if (this.weaponBoxEvent)  this.weaponBoxEvent.remove();
    if (this.stageEvent)      this.stageEvent.remove();
    if (this.squadItemTimer)  this.squadItemTimer.remove();
    this.stopBossFire();
    this.sfx.gameOver();
    this.physics.pause();

    // 네이티브 DOM 이벤트로 재시작 — Phaser 입력 시스템 우회
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

    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x000000, 0.6);
    this.add.text(WORLD_W / 2, WORLD_H / 2 - 80, 'GAME OVER', {
      fontFamily: 'monospace', fontSize: '56px', color: '#ff5577',
    }).setOrigin(0.5);
    this.add.text(WORLD_W / 2, WORLD_H / 2 - 20, `점수: ${this.score}`, {
      fontFamily: 'monospace', fontSize: '32px', color: '#ffffff',
    }).setOrigin(0.5);
    this.add.text(WORLD_W / 2, WORLD_H / 2 + 20, `최고: ${this.hiScore}`, {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffe066',
    }).setOrigin(0.5);
    if (newRecord) {
      this.add.text(WORLD_W / 2, WORLD_H / 2 + 60, '★ 신기록! ★', {
        fontFamily: 'monospace', fontSize: '26px', color: '#4cc2ff',
      }).setOrigin(0.5);
    }

    const btnY = WORLD_H / 2 + 140;
    const btnBg = this.add.rectangle(WORLD_W / 2, btnY, 320, 96, 0x4cc2ff, 0.35)
      .setStrokeStyle(5, 0xffffff, 1);
    this.add.text(WORLD_W / 2, btnY, '▶ 다시하기', {
      fontFamily: 'sans-serif', fontSize: '40px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.tweens.add({
      targets: btnBg, alpha: { from: 1, to: 0.55 },
      duration: 700, yoyo: true, repeat: -1,
    });
  }

  // ─── 매 프레임 ───────────────────────────────────────────

  update(_, deltaMs) {
    if (this.gameOver || this.choosing) return;
    const dt      = deltaMs / 1000;
    const maxStep = PLAYER_SPEED * this.moveMult * dt;

    this.squad.forEach((m) => {
      if (!m.active) return;
      const wantX = this.targetX + (m.getData('offsetX') ?? 0);
      const wantY = PLAYER_Y    + (m.getData('offsetY') ?? 0);
      m.x += Phaser.Math.Clamp(wantX - m.x, -maxStep, maxStep);
      m.y += Phaser.Math.Clamp(wantY - m.y, -maxStep, maxStep);
    });

    this.bullets.getChildren().forEach((b) => {
      if (!b.active) return;
      if (b.y < -30 || b.y > WORLD_H + 30 || b.x < -30 || b.x > WORLD_W + 30)
        this.recycleBullet(b);
    });

    this.enemies.getChildren().forEach((e) => {
      if (!e.active) return;
      if (e.hpBarBg) {
        e.hpBarBg.x  = e.x;
        e.hpBarBg.y  = e.y - e.displayHeight / 2 - 8;
        e.hpBarFg.x  = e.x - e.hpBarW / 2;
        e.hpBarFg.y  = e.hpBarBg.y;
      }
      if (e.y > WORLD_H + 30) {
        if (e === this.activeBoss) this.onBossEscape(e);
        else this.killEnemy(e);
      }
    });

    this.weaponBoxes.getChildren().forEach((b) => {
      if (!b.active) return;
      if (b.label)   { b.label.x = b.x; b.label.y = b.y; }
      if (b.hpBarBg) {
        b.hpBarBg.x = b.x;
        b.hpBarBg.y = b.y - WEAPON_BOX_RADIUS - 8;
        b.hpBarFg.x = b.x - b.hpBarW / 2;
        b.hpBarFg.y = b.hpBarBg.y;
      }
      if (b.y > WORLD_H + 30) this.killWeaponBox(b);
    });

    const trackItem = (it) => {
      if (!it.active) return;
      if (it.label) { it.label.x = it.x; it.label.y = it.y; }
      if (it.y > WORLD_H + 30) {
        if (it.label) it.label.setVisible(false);
        it.disableBody(true, true);
      }
    };
    this.weaponPickups.getChildren().forEach(trackItem);
    this.squadItems.getChildren().forEach(trackItem);

    const boss = this.activeBoss;
    if (boss && boss.active && !boss.getData('holding') && boss.y >= BOSS_HOLD_Y) {
      boss.y = BOSS_HOLD_Y;
      boss.body.setVelocity(0, 0);
      boss.setData('holding', true);
      this.startBossFire();
    }

    this.bossBullets.getChildren().forEach((b) => {
      if (!b.active) return;
      if (b.y < -30 || b.y > WORLD_H + 30 || b.x < -30 || b.x > WORLD_W + 30)
        b.disableBody(true, true);
    });
  }
}
