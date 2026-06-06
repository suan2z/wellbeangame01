// 운석피하기2 공용 상수 — 일직선 길 러너
// 좌표계: 플레이어는 z=0 고정, 카메라를 향해(+Z, 화면 아래) 도망친다.
//   - 재앙(거대 운석·화염벽)은 화면 위쪽 = 멀리 = 전방 = -Z 에서 내려온다.
//   - 월드(길/도시)는 -Z로 스크롤(화면 위로 흘러감)하며 카메라 뒤(+Z)에서 재생성.
//   - 플레이어가 도망쳐 새로 밟는 길("뒤쪽길")은 화면 아래(+Z)에서 등장.

export const ROAD_WIDTH = 26;          // 길 폭 (화면보다 살짝 넓게)
export const ROAD_HALF = ROAD_WIDTH / 2;
export const PLAYER_X_LIMIT = ROAD_HALF - 1.4; // 캐릭터 좌우 이동 한계

export const SEGMENT_LEN = 20;         // 길 한 구획 길이(Z)
export const SEGMENT_COUNT = 16;       // 동시에 존재하는 구획 수
export const TRACK_LEN = SEGMENT_LEN * SEGMENT_COUNT; // 전체 트랙 길이 320
export const NEAR_Z = 48;              // 재생성 위치(카메라 뒤 +Z, 화면 밖) — 여기서 등장해 -Z로 흘러감

export const RUN_SPEED_BASE = 26;      // 기본 질주 속도(월드 스크롤)
export const RUN_SPEED_GROWTH = 0.25;  // 초당 가속

// 파괴(화염벽) — lead = 플레이어와 화염벽 사이 거리. 화염벽은 화면 위(-Z)에 위치(z = -lead).
export const LEAD_START = 16;
export const LEAD_MAX = 22;
export const LEAD_REGEN = 2.6;         // 달리며 거리 회복(초당)
export const LEAD_DEAD = 0;            // 0 이하 → 따라잡힘(게임오버)

// 거대 운석 — 5초마다 길 전체를 강타 (화면 위 -Z, 지나온 도시를 파괴)
export const GIANT_INTERVAL = 5.0;
export const GIANT_TELEGRAPH = 1.4;    // 예고 시간
export const GIANT_IMPACT_Z = 16;      // 착지 거리(실제 z = -GIANT_IMPACT_Z, 화면 위·카메라보다 멀리)
export const GIANT_SURGE_BASE = 9;     // 충돌 시 화염벽이 밀려오는 양
export const GIANT_SURGE_GROWTH = 0.06;
