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

const SQUAD_MAX = 100;        // 표시(논리) 최대 인원
const SQUAD_SOFTCAP = 10;     // 이 인원까지는 실제 전투원과 1:1
const SQUAD_ACTUAL_MAX = 30;  // 실제 전투원(스프라이트) 최대 — 논리 100명일 때 30명
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
  { key: 'pistol',     tier: 1,  name: '권총',         damage: 1, interval: 300, speed: 700,  count: 1, spread: 0,  color: 0xffe066 },
  { key: 'smg',        tier: 2,  name: '기관단총',     damage: 1, interval: 150, speed: 700,  count: 1, spread: 0,  color: 0x4cffc2 },
  { key: 'shotgun',    tier: 3,  name: '샷건',         damage: 1, interval: 600, speed: 620,  count: 5, spread: 35, color: 0xff9933 },
  { key: 'rifle',      tier: 4,  name: '라이플',       damage: 3, interval: 350, speed: 850,  count: 1, spread: 0,  color: 0x4cc2ff },
  { key: 'dualpistol', tier: 5,  name: '듀얼권총',     damage: 1, interval: 220, speed: 700,  count: 2, spread: 12, color: 0xf4d97e },
  { key: 'sniper',     tier: 6,  name: '저격총',       damage: 8, interval: 600, speed: 1100, count: 1, spread: 0,  color: 0xa066ff },
  { key: 'flame',      tier: 7,  name: '화염방사기',   damage: 1, interval: 70,  speed: 500,  count: 1, spread: 18, color: 0xff5a18 },
  { key: 'mg',         tier: 8,  name: '기관총',       damage: 2, interval: 100, speed: 700,  count: 1, spread: 0,  color: 0xff5577 },
  { key: 'cannon',     tier: 9,  name: '핸드캐논',     damage: 7, interval: 300, speed: 900,  count: 1, spread: 0,  color: 0xd03030 },
  { key: 'gauss',      tier: 10, name: '가우스라이플', damage: 4, interval: 130, speed: 950,  count: 2, spread: 8,  color: 0x80ffff },
];

const STARTING_WEAPON_KEY = 'pistol';

function getWeapon(key) {
  return WEAPONS.find((w) => w.key === key) ?? WEAPONS[0];
}

function weaponLabel(w) {
  return `[T${w.tier}] ${w.name}`;
}

// 색 보간 유틸 (무기 등급별 외형 생성용)
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

// 무기별 부대원 텍스처 키
function playerTexKey(weapon) {
  return `tex_player_${weapon.key}`;
}

// 부대원 아이템: 좌/우 랜덤, 3~5초 간격
const SQUAD_ITEM_LEFT_X  = ZONE_W / 2;
const SQUAD_ITEM_RIGHT_X = WORLD_W - ZONE_W / 2;
const SQUAD_ITEM_SPAWN_MIN_MS = 3000;
const SQUAD_ITEM_SPAWN_MAX_MS = 5000;
const SQUAD_ITEM_FALL_SPEED = 90;
const STARTING_SQUAD = 1;

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

// 스테이지별 배경 팔레트 (순환)
const STAGE_PALETTES = [
  { base: 0x080818, neb1: 0x18083c, neb2: 0x081828, neb3: 0x200828 }, // S1 보라/딥스페이스
  { base: 0x041814, neb1: 0x083c2c, neb2: 0x0c2818, neb3: 0x102822 }, // S2 청록
  { base: 0x180404, neb1: 0x3c0808, neb2: 0x281418, neb3: 0x281008 }, // S3 적색
  { base: 0x080418, neb1: 0x1818a0, neb2: 0x102060, neb3: 0x0a1a40 }, // S4 블루
  { base: 0x180810, neb1: 0x4a2a18, neb2: 0x3a1a08, neb3: 0x281408 }, // S5 노을
];
function paletteFor(stage) {
  return STAGE_PALETTES[(stage - 1) % STAGE_PALETTES.length];
}

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

// 표시 인원(논리) → 실제 전투원 수. 10명까지는 1:1, 이후 완만히 증가해 100명이면 30명.
function actualSquadSize(logical) {
  if (logical <= SQUAD_SOFTCAP) return logical;
  const t = (logical - SQUAD_SOFTCAP) / (SQUAD_MAX - SQUAD_SOFTCAP); // 0~1
  return Math.round(SQUAD_SOFTCAP + t * (SQUAD_ACTUAL_MAX - SQUAD_SOFTCAP));
}

// 실제 전투원 수 → 표시 인원(역변환). 일괄 손실(상자 충돌) 시 표시 인원 보정용.
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

  // 무기 등급(T1~T10)에 따라 점점 강력해 보이는 전투기 텍스처.
  // 무기색(accent)을 동체/배기/날개끝에 반영해 무기 종류별로도 외형이 달라짐.
  makePlaneTextureForWeapon(key, weapon) {
    const tier   = weapon.tier;
    const accent = weapon.color;
    const power  = (tier - 1) / 9; // 0(T1) ~ 1(T10)
    const W = 48, H = 58, cx = W / 2, cy = 28;
    const g = this.add.graphics();

    const bodyCol = blendHex(0x6fd2ff, accent, 0.30 + power * 0.40);
    const wingCol = darken(blendHex(0x2ba8e8, accent, 0.35 + power * 0.40), 0.10 + power * 0.25);

    // ── 에너지 오라 (고티어일수록 강하게) ──
    if (tier >= 9) {
      g.fillStyle(accent, 0.16); g.fillCircle(cx, cy, 26);
      g.fillStyle(accent, 0.10); g.fillCircle(cx, cy, 30);
    } else if (tier >= 6) {
      g.fillStyle(accent, 0.10); g.fillCircle(cx, cy, 24);
    }

    // ── 주 날개 (등급↑ → 더 넓고 더 뒤로 후퇴) ──
    const span  = 10 + power * 9;
    const sweep = 4 + power * 8;
    const wingY = cy - 2;
    g.fillStyle(wingCol, 1);
    g.fillTriangle(cx - 6, wingY - 6, cx - 6 - span, wingY + sweep, cx - 6, wingY + 8);
    g.fillTriangle(cx + 6, wingY - 6, cx + 6 + span, wingY + sweep, cx + 6, wingY + 8);
    // 날개끝 무기색 스트라이프
    g.fillStyle(accent, 0.95);
    g.fillTriangle(cx - 6 - span, wingY + sweep, cx - 2 - span, wingY + sweep - 2, cx - 3 - span, wingY + sweep + 3);
    g.fillTriangle(cx + 6 + span, wingY + sweep, cx + 2 + span, wingY + sweep - 2, cx + 3 + span, wingY + sweep + 3);

    // ── 무기 포드 (T6+) : 날개 아래 총열 ──
    if (tier >= 6) {
      g.fillStyle(darken(accent, 0.2), 1);
      g.fillRoundedRect(cx - 6 - span * 0.6, wingY + 2, 4, 12, 2);
      g.fillRoundedRect(cx + 6 + span * 0.6 - 4, wingY + 2, 4, 12, 2);
    }

    // ── 카나드(앞날개) (T7+) ──
    if (tier >= 7) {
      g.fillStyle(wingCol, 1);
      g.fillTriangle(cx - 5, cy - 12, cx - 13, cy - 8, cx - 5, cy - 6);
      g.fillTriangle(cx + 5, cy - 12, cx + 13, cy - 8, cx + 5, cy - 6);
    }

    // ── 꼬리날개 ──
    g.fillStyle(wingCol, 1);
    g.fillTriangle(cx - 7, cy + 12, cx - 7, H - 4, cx - 1, H - 4);
    g.fillTriangle(cx + 7, cy + 12, cx + 1, H - 4, cx + 7, H - 4);

    // ── 동체 ──
    const noseY = 2 - power;
    g.fillStyle(bodyCol, 1);
    g.fillTriangle(cx - 8, cy - 14, cx, noseY, cx + 8, cy - 14);
    g.fillRoundedRect(cx - 8, cy - 16, 16, 34, 7);
    g.fillStyle(lighten(bodyCol, 0.3), 0.7);
    g.fillRoundedRect(cx - 5, cy - 14, 4, 28, 3);
    // 장갑판 (T8+)
    if (tier >= 8) {
      g.fillStyle(darken(bodyCol, 0.35), 0.85);
      g.fillRect(cx - 8, cy - 2, 16, 4);
      g.fillRect(cx - 8, cy + 8, 16, 3);
    }

    // ── 콕핏 ──
    const cockGlow = tier >= 9 ? lighten(accent, 0.4) : 0xffe98a;
    g.fillStyle(cockGlow, 1); g.fillCircle(cx, cy - 11, 5);
    g.fillStyle(0xffffff, 1);  g.fillCircle(cx - 2, cy - 13, 2);

    // ── 엔진 배기 (T5+ 2기, T8+ 3기) ──
    const engineXs = tier >= 8 ? [cx - 6, cx, cx + 6]
                   : tier >= 5 ? [cx - 5, cx + 5]
                   : [cx];
    for (const ex of engineXs) {
      g.fillStyle(0xff8800, 1);              g.fillEllipse(ex, H - 8, 8, 7);
      g.fillStyle(accent, 1);                g.fillEllipse(ex, H - 9, 5, 5);
      g.fillStyle(lighten(accent, 0.5), 1);  g.fillEllipse(ex, H - 10, 2.5, 3);
    }

    // ── 윙팁 스파이크 (T10) ──
    if (tier >= 10) {
      g.fillStyle(lighten(accent, 0.3), 1);
      g.fillTriangle(cx - 6 - span, wingY + sweep - 1, cx - 11 - span, wingY + sweep + 1, cx - 6 - span, wingY + sweep + 3);
      g.fillTriangle(cx + 6 + span, wingY + sweep - 1, cx + 11 + span, wingY + sweep + 1, cx + 6 + span, wingY + sweep + 3);
    }

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

    // 배경 — 딥 스페이스 (스테이지별 팔레트로 갱신됨)
    this.bgBase = this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x080818);
    this.bgNeb1 = this.add.rectangle(WORLD_W / 2,     WORLD_H * 0.3,  WORLD_W,        WORLD_H * 0.44, 0x18083c, 0.38);
    this.bgNeb2 = this.add.rectangle(WORLD_W * 0.3,   WORLD_H * 0.65, WORLD_W * 0.5,  WORLD_H * 0.32, 0x081828, 0.28);
    this.bgNeb3 = this.add.rectangle(WORLD_W * 0.75,  WORLD_H * 0.5,  WORLD_W * 0.4,  WORLD_H * 0.28, 0x200828, 0.22);

    // 흐르는 별 (parallax — 큰 별은 빠르게, 작은 별은 느리게)
    this.stars = [];
    for (let i = 0; i < 100; i++) {
      const bright = Phaser.Math.FloatBetween(0.15, 0.95);
      const scale  = bright > 0.75 ? Phaser.Math.FloatBetween(1.2, 2.2) : Phaser.Math.FloatBetween(0.4, 1.0);
      const star = this.add.image(
        Phaser.Math.Between(0, WORLD_W),
        Phaser.Math.Between(0, WORLD_H),
        'tex_star'
      ).setAlpha(bright).setScale(scale);
      star.vy = scale > 1.0 ? Phaser.Math.Between(55, 80) : Phaser.Math.Between(18, 32);
      this.stars.push(star);
    }
    this.applyStagePalette(this.stage);

    // 좌우 부대원 아이템 구역 (부드러운 연두 띠)
    this.add.rectangle(ZONE_W / 2,            WORLD_H / 2, ZONE_W, WORLD_H, 0x3ad27a, 0.07);
    this.add.rectangle(WORLD_W - ZONE_W / 2,  WORLD_H / 2, ZONE_W, WORLD_H, 0x3ad27a, 0.07);
    this.add.rectangle(COMBAT_LEFT,  WORLD_H / 2, 2, WORLD_H, 0x5aeea0, 0.22);
    this.add.rectangle(COMBAT_RIGHT, WORLD_H / 2, 2, WORLD_H, 0x5aeea0, 0.22);

    // 물리 그룹
    this.squadGroup   = this.physics.add.group();
    this.squad        = [];      // 실제 전투원 스프라이트
    this.squadCount   = 0;       // 표시(논리) 인원
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

    // 부대원 증가 시 반짝이 파티클 (금빛)
    this.sparkleEmitter = this.add.particles(0, 0, 'tex_star', {
      speed: { min: 40, max: 170 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.4, end: 0 },
      tint: 0xffe066,
      lifespan: 520,
      emitting: false,
    });
    this.sparkleEmitter.setDepth(6);

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
    this.squadText = this.add.text(WORLD_W / 2, 18, `부대원 ${this.squadCount}`, {
      fontFamily: 'monospace', fontSize: '20px', color: '#3ad27a', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.weaponText = this.add.text(WORLD_W / 2, 44, weaponLabel(this.weapon), {
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

    // 스테이지 진행/클리어는 stageClearTransition()이 담당. 여기선 다음 웨이브 보스만 스폰.
    const next = this.bossNum + 1;
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

    boss.setData('animPhase', Math.random() * Math.PI * 2);
    boss.setData('animFreq', Phaser.Math.FloatBetween(2.6, 3.6));
    boss.setScale(1);
    boss.setRotation(0);
    this.activeBoss = boss;
    this.sfx.bossAppear();
    this.bossText.setText(`스테이지 ${this.stage} · 웨이브 ${this.bossNum}/${this.bossCount}  HP ${actualHp}`);
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

  // 표시 인원을 count만큼 늘리고(최대 SQUAD_MAX) 실제 전투원 수를 맞춤 + 반짝이 연출
  addSquadMember(count = 1) {
    const before = this.squadCount;
    this.squadCount = Math.min(SQUAD_MAX, this.squadCount + count);
    this.syncSquadSprites();
    if (this.squadCount > before && before > 0) this.flashSquadGain();
  }

  // 실제 전투원 스프라이트 수를 표시 인원에 맞게 추가/제거
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

  // 부대원 증가 시 부대 전체 반짝임 (틴트 플래시 + 스케일 팝 + 금빛 파티클)
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

  // 스테이지 클리어 시 부대원을 시작 인원(STARTING_SQUAD)으로 되돌림
  resetSquad() {
    this.squad.slice().forEach((m) => m.destroy());
    this.squad = [];
    this.squadCount = STARTING_SQUAD;
    this.syncSquadSprites();
  }

  // 피격 1회 = 표시 인원 1 감소. 실제 전투원 수는 매핑에 따라 따라 줄어듦.
  loseSquadMember() {
    if (this.squadCount <= 0) return;
    this.squadCount -= 1;
    this.syncSquadSprites();
    this.tweens.add({ targets: this.squadText, scale: { from: 1.4, to: 1 }, duration: 200 });
    this.invulnUntil = this.time.now + SQUAD_SPAWN_INVULN_MS;
    this.squad.forEach((m) => m.setAlpha(0.5));
    this.time.delayedCall(SQUAD_SPAWN_INVULN_MS, () => this.squad.forEach((m) => m.setAlpha(1)));
    if (this.squadCount === 0) this.endGame();
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
    if (this.gameOver || this.choosing) return;
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

    // 살아있는 느낌 — squash & stretch + 미세 회전 (phase는 개체별 다름)
    enemy.setData('animPhase', Math.random() * Math.PI * 2);
    enemy.setData('animFreq', Phaser.Math.FloatBetween(3.6, 5.4));
    enemy.setScale(1);
    enemy.setRotation(0);

    if (enemy.hpBarBg) { enemy.hpBarBg.destroy(); enemy.hpBarBg = null; }
    if (enemy.hpBarFg) { enemy.hpBarFg.destroy(); enemy.hpBarFg = null; }
  }

  // ─── 무기 상자 ───────────────────────────────────────────

  spawnWeaponBox() {
    if (this.gameOver || this.choosing) return;
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

    const maxTier = Math.min(2 + this.stage, WEAPONS.length); // S1=T3, S2=T4, ..., S8+=T10
    const pool = WEAPONS.filter((w) => w.tier <= maxTier);
    const droppedWeapon = pool[Phaser.Math.Between(0, pool.length - 1)];
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
      box.label = this.add.text(spawnX, startY, weaponLabel(droppedWeapon), {
        fontFamily: 'monospace', fontSize: '11px',
        color: rgbHex(droppedWeapon.color), fontStyle: 'bold',
      }).setOrigin(0.5);
    } else {
      box.label.setVisible(true).setPosition(spawnX, startY)
        .setText(weaponLabel(droppedWeapon)).setColor(rgbHex(droppedWeapon.color));
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
      item.label = this.add.text(x, y, weaponLabel(w), {
        fontFamily: 'monospace', fontSize: '13px',
        color: rgbHex(w.color), fontStyle: 'bold',
      }).setOrigin(0.5);
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
    // 부대원 외형을 새 무기 등급에 맞게 교체 + 변신 팝 연출
    const texKey = playerTexKey(next);
    this.squad.forEach((m) => {
      if (!m.active) return;
      m.setTexture(texKey);
      this.tweens.add({ targets: m, scale: { from: 1.35, to: 1 }, duration: 220, ease: 'Back.easeOut' });
    });
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
        if (this.bossNum >= this.bossCount) {
          // 스테이지 마지막 보스 → 클리어 연출 (버프는 어차피 초기화되므로 생략)
          this.stageClearTransition();
        } else {
          this.showWavePopup(this.bossNum, this.bossCount);
          this.showBuffSelection();
        }
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
    const k = this.squad.filter((m) => {
      if (!m.active) return false;
      const dx = m.x - bx, dy = m.y - by;
      return dx * dx + dy * dy <= r2;
    }).length;
    this.killWeaponBox(box, false);
    if (k === 0) return;
    // 킬 반경 내 전투원 k명 즉사 → 남은 실제 인원을 표시 인원으로 역산
    const newActual = Math.max(0, this.squad.length - k);
    this.squadCount = logicalFromActual(newActual);
    this.syncSquadSprites();
    this.sfx.squadLoss();
    this.tweens.add({ targets: this.squadText, scale: { from: 1.4, to: 1 }, duration: 200 });
    this.invulnUntil = this.time.now + SQUAD_SPAWN_INVULN_MS;
    this.squad.forEach((m) => m.setAlpha(0.5));
    this.time.delayedCall(SQUAD_SPAWN_INVULN_MS, () => this.squad.forEach((m) => m.setAlpha(1)));
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

    let value = type === 'question'
      ? Phaser.Math.Between(-1, 2)
      : item.getData('value');

    if (value > 0) {
      this.addSquadMember(value);
      this.sfx.squadGain();
    } else if (value < 0 && this.squadCount > 0) {
      this.loseSquadMember();
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

  showWavePopup(num, total) {
    const t = this.add.text(WORLD_W / 2, WORLD_H * 0.35, `웨이브 ${num}/${total} 클리어!`, {
      fontFamily: 'sans-serif', fontSize: '22px', color: '#4cc2ff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(15);
    this.tweens.add({
      targets: t, y: WORLD_H * 0.28, alpha: 0, duration: 1100,
      onComplete: () => t.destroy(),
    });
  }

  applyStagePalette(stage) {
    if (!this.bgBase) return;
    const p = paletteFor(stage);
    this.bgBase.setFillStyle(p.base);
    this.bgNeb1.setFillStyle(p.neb1, 0.38);
    this.bgNeb2.setFillStyle(p.neb2, 0.28);
    this.bgNeb3.setFillStyle(p.neb3, 0.22);
  }

  // 필드 정리 (스테이지 전환 시 적/탄/상자/아이템 초기화. 부대원은 유지)
  clearStageField() {
    const wipe = (grp) => grp.getChildren().forEach((o) => {
      if (!o.active) return;
      if (o.hpBarBg) { o.hpBarBg.destroy(); o.hpBarBg = null; }
      if (o.hpBarFg) { o.hpBarFg.destroy(); o.hpBarFg = null; }
      if (o.label) o.label.setVisible(false);
      o.disableBody(true, true);
    });
    wipe(this.enemies);
    wipe(this.bullets);
    wipe(this.bossBullets);
    wipe(this.weaponBoxes);
    wipe(this.weaponPickups);
    wipe(this.squadItems);
  }

  // 스테이지 클리어 → 페이드아웃 → 리셋 → STAGE N 연출 → 페이드인 → 다음 스테이지
  stageClearTransition() {
    this.choosing = true;     // update/사격/입력 정지 (게임 진행 멈춤)
    this.physics.pause();
    const cleared = this.stage;

    const msg = this.add.text(WORLD_W / 2, WORLD_H / 2, `★ 스테이지 ${cleared} 클리어! ★`, {
      fontFamily: 'sans-serif', fontSize: '40px', color: '#ffe066', fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: msg, scale: { from: 0.4, to: 1 }, duration: 400, ease: 'Back.easeOut' });
    this.sfx.squadGain();

    this.time.delayedCall(1200, () => this.cameras.main.fadeOut(500, 0, 0, 0));

    this.cameras.main.once('camerafadeoutcomplete', () => {
      msg.destroy();
      this.clearStageField();

      // 무기 + 화력 버프 + 부대원 초기화 (점수·이동/점수 버프는 유지), 다음 스테이지 세팅
      this.stage++;
      this.bossNum   = 0;
      this.bossCount = 4 + this.stage;
      this.damageMult   = 1;
      this.fireRateMult = 1;
      this.bonusCount   = 0;
      this.equipWeapon(STARTING_WEAPON_KEY);
      this.resetSquad();
      this.applyStagePalette(this.stage);
      this.bossText.setText('');

      const t1 = this.add.text(WORLD_W / 2, WORLD_H / 2 - 24, `STAGE ${this.stage}`, {
        fontFamily: 'sans-serif', fontSize: '64px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(30);
      const t2 = this.add.text(WORLD_W / 2, WORLD_H / 2 + 36, `웨이브 ${this.bossCount}개`, {
        fontFamily: 'sans-serif', fontSize: '24px', color: '#ffe066',
      }).setOrigin(0.5).setDepth(30);

      this.cameras.main.fadeIn(500, 0, 0, 0);
      this.cameras.main.once('camerafadeincomplete', () => {
        this.tweens.add({ targets: t1, scale: { from: 0.6, to: 1 }, duration: 300, ease: 'Back.easeOut' });
        this.time.delayedCall(900, () => {
          this.tweens.add({
            targets: [t1, t2], alpha: 0, duration: 400,
            onComplete: () => { t1.destroy(); t2.destroy(); },
          });
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

    if (this.stars) {
      for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i];
        s.y += s.vy * dt;
        if (s.y > WORLD_H + 10) {
          s.y = -10;
          s.x = Phaser.Math.Between(0, WORLD_W);
        }
      }
    }

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

    const nowSec = this.time.now / 1000;
    this.enemies.getChildren().forEach((e) => {
      if (!e.active) return;
      // 살아있는 느낌 — squash & stretch (호흡) + 미세 회전 (좌우 흔들)
      const phase = e.getData('animPhase') ?? 0;
      const freq  = e.getData('animFreq')  ?? 4.0;
      const isBoss = e === this.activeBoss;
      const sqAmp  = isBoss ? 0.06 : 0.10;
      const rotAmp = isBoss ? 0.06 : 0.12;
      const breath = Math.sin(nowSec * freq + phase);
      e.scaleY = 1 + sqAmp * breath;
      e.scaleX = 1 - sqAmp * 0.55 * breath;
      e.rotation = rotAmp * Math.sin(nowSec * freq * 0.65 + phase + 1.2);
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
