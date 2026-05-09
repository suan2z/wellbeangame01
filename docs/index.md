# WellBean Game 기획 문서

모바일 게임 개발을 위한 기획 및 설계 문서 사이트입니다.

## 🎮 플레이

> [**▶ Lane Defense 프로토타입 플레이**](play/){ .md-button .md-button--primary }
>
> 폰 브라우저에서 바로 실행됨. 드래그로 좌우 이동.

## 문서 목록

- [**게임 기획서 (Lane Defense)**](게임_기획서.md) — 본격 기획서 v0.1
- [개발 테스트 개요 문서](개발_테스트_개요_문서.md) — 일반 템플릿

## 진행 상태

!!! info "현재 단계"
    **프로토타입 v0.1** — Phaser 3 기반, 좌우 이동 + 자동 사격 + 적 웨이브 동작

## 사용 방법

이 사이트는 [MkDocs](https://www.mkdocs.org/) + [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) 로 만들어졌습니다.

### 로컬에서 미리보기

```bash
pip install mkdocs mkdocs-material
mkdocs serve
```

브라우저에서 [http://localhost:8000](http://localhost:8000) 접속.

### 정적 사이트 빌드

```bash
mkdocs build
```

`site/` 폴더에 결과물이 생성됩니다.
