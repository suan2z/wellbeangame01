// 운석피하기2 공용 상수 — 일직선 길 러너
// 좌표계: 전진 방향은 -Z. 플레이어는 z=0 고정, 월드(길/도시)가 +Z로 스크롤되며 재활용.
//          파괴(화염벽)는 플레이어 뒤(+Z)에서 쫓아온다.

export const ROAD_WIDTH = 26;          // 길 폭 (화면보다 살짝 넓게)
export const ROAD_HALF = ROAD_WIDTH / 2;
export const PLAYER_X_LIMIT = ROAD_HALF - 1.4; // 캐릭터 좌우 이동 한계

export const SEGMENT_LEN = 20;         // 길 한 구획 길이(Z)
export const SEGMENT_COUNT = 16;       // 동시에 존재하는 구획 수
export const TRACK_LEN = SEGMENT_LEN * SEGMENT_COUNT; // 전체 트랙 길이 320
export const RECYCLE_BACK = 60;        // z가 이 값보다 커지면(카메라 뒤) 맨 앞으로 재배치

export const RUN_SPEED_BASE = 26;      // 기본 질주 속도(월드 스크롤)
export const RUN_SPEED_GROWTH = 0.25;  // 초당 가속

// 파괴(화염벽) — lead = 플레이어와 화염벽 사이 거리
export const LEAD_START = 16;
export const LEAD_MAX = 22;
export const LEAD_REGEN = 2.6;         // 달리며 거리 회복(초당)
export const LEAD_DEAD = 0;            // 0 이하 → 따라잡힘(게임오버)

// 거대 운석 — 5초마다 길 전체를 강타
export const GIANT_INTERVAL = 5.0;
export const GIANT_TELEGRAPH = 1.4;    // 예고 시간
export const GIANT_IMPACT_Z = 16;      // 플레이어(z=0) 뒤 착지 지점(카메라보다 앞 → 화면에 보임)
export const GIANT_SURGE_BASE = 9;     // 충돌 시 화염벽이 밀려오는 양
export const GIANT_SURGE_GROWTH = 0.06;
