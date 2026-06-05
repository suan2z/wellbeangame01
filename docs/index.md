# 게임 라이브러리

여러 모바일 게임 프로토타입의 기획 문서와 빌드 산출물을 한곳에서 관리합니다.

🕒 **최종 빌드:** `BUILD_TIMESTAMP`

---

## 게임 목록

| 게임 | 장르 | 상태 | 문서 |
|------|------|------|------|
| **Lane Defense** | 캐주얼 슈터 · 라스트워 류 | 🟢 플레이 가능 프로토타입 v0.3 | [📖 기획](lane-defense/index.md) · [🎮 플레이](play/) |
| **운석피하기** | 캐주얼 회피 | ⚪ 컨셉 단계 | [📖 기획](meteor-dodge/index.md) |

---

## 사이트 구조

- **상단 탭** 으로 게임을 전환합니다.
- 각 게임 탭의 **좌측 사이드바**에서 개별 문서를 탐색합니다.
- 새 게임을 추가하려면 `docs/<게임명>/` 폴더와 `mkdocs.yml` nav에 항목을 추가하면 됩니다.

---

## 공통 인프라

| 영역 | 사용 도구 |
|------|----------|
| 문서 | MkDocs + Material |
| 게임 빌드 | Vite + Phaser 3 |
| 배포 | GitHub Actions → GitHub Pages |
| 호스팅 | `https://suan2z.github.io/wellbeangame01/` |
