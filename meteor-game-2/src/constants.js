// 운석피하기2 공용 상수 — 일직선 길 (운석피하기1과 동일한 카메라/직접 이동)
// 좌표계: 운석피하기1과 동일. 카메라는 뒤(+Z)에서 화면 안쪽(-Z)을 비춘다.
//   - 길은 Z축을 따라 길게 뻗음. 플레이어는 조이스틱으로 자유 이동(좌우는 길 폭으로 제한).
//   - 화면 안쪽(-Z, 멀리=전방)의 길이 거대 운석에 부서지고, 붕괴 경계가 플레이어 쪽(+Z)으로
//     전진한다 → 플레이어는 카메라 쪽(아래)으로 후퇴할 수밖에 없다. (자동 이동 아님)

export const ROAD_WIDTH = 30;          // 길 폭 (화면보다 살짝 넓게)
export const ROAD_HALF = ROAD_WIDTH / 2;
export const PLAYER_X_LIMIT = ROAD_HALF - 1.5; // 좌우 이동 한계 (길 위)

// 길 구획(segment) — 플레이어 주변을 따라다니며 재활용 (끝없는 길, 같은 패턴 재생성)
export const SEGMENT_LEN = 24;
export const SEGMENT_COUNT = 18;
export const TRACK_LEN = SEGMENT_LEN * SEGMENT_COUNT; // 432
export const BAND_NEAR = 56;           // 플레이어보다 +Z(뒤/카메라쪽)로 이만큼까지 유지
export const BAND_FAR = TRACK_LEN - BAND_NEAR;

// 붕괴(파괴된 길) — collapseZ보다 안쪽(-Z, z<collapseZ)은 무너진 길. 경계가 +Z로 전진.
export const COLLAPSE_INITIAL_GAP = 42;  // 시작 시 붕괴 경계까지 거리(거대 운석이 가까이서 떨어지도록)
export const COLLAPSE_CREEP = 1.6;       // 평상시 경계 전진 속도(m/s)
export const COLLAPSE_CREEP_GROWTH = 0.02; // 시간당 가속

// 거대 운석 — 5초마다 길 전방(-Z)에 떨어져 길 전체 폭 파괴 + 붕괴 경계 전진
export const GIANT_INTERVAL = 5.0;
export const GIANT_TELEGRAPH = 1.3;
export const GIANT_SPAWN_Y = 40;        // 낙하 시작 높이(낮을수록 가까이서 시작)
export const GIANT_STEP = 16;           // 충돌 시 붕괴 경계가 플레이어 쪽으로 점프하는 양
export const GIANT_SAFE = 7;            // 거대 운석이 플레이어보다 이보다 가깝게는 안 떨어짐
export const GIANT_BLAST_HALF_X = 46;   // 폭발/불바다 반경 X (길 + 도시까지)
export const GIANT_BLAST_HALF_Z = 24;   // 폭발/불바다 반경 Z
