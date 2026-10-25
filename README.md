# sasak2 Portfolio

경북대학교 전자공학부 1학년 김현민(@sasak2)의 포트폴리오입니다.

## 구조

- `index.html`, `script.js`, `styles.css`: 탭 전환과 공통 스타일. 탭 내용은 `sections/*.html`을 불러와요.
- `showcase.js`: 메인 페이지 스크롤 애니메이션(전자, 해킹, 알고리즘, 메이커, 체스, 베이스). 순서와 문구는 `sections/main.html`에서 바꿔요.
- `blog.js`: 블로그 목록, 태그 필터, 글 렌더링.
- `posts/*.md`: 블로그 글. `posts.json`은 이 파일들에서 자동으로 만들어져요.

## 글 쓰는 법

`posts/` 폴더에 마크다운 파일을 하나 추가하면 돼요. 파일 이름이 주소(`#blog/post/파일이름`)가 돼요.

```
---
title: 글 제목
date: 2026-10-25
tags: [알고리즘]
summary: 목록에 보일 한 줄 요약
---

본문
```

- 메인의 "확인해보기" 버튼은 태그와 연결돼요: `전자`, `해킹`, `알고리즘`, `메이커`, `체스`, `베이스`. 해당 태그 글이 없으면 버튼이 "준비 중"으로 비활성화돼요.
- 이미지는 `posts/img/`에 넣고 `![설명](posts/img/파일.png)`로 불러와요.
- `draft: true`를 넣으면 목록에서 빠져요.
- `main`에 푸시하면 GitHub Actions(`.github/workflows/build-posts.yml`)가 `posts.json`을 갱신해요. 직접 갱신하려면 `node scripts/build-posts.mjs`를 실행하세요.

## 로컬에서 보기

```
python3 -m http.server 8000
```

그리고 `http://localhost:8000`을 열어요.
