# sasak2 Portfolio

경북대학교 전자공학부 1학년 김현민(@sasak2)의 포트폴리오입니다.

## 구조

- `index.html`, `script.js`, `styles.css`: 왼쪽 사이드바(모바일은 상단 메뉴), 해시 라우팅, 다크 테마 스타일. 페이지 내용은 `sections/*.html`을 불러와요.
- `showcase.js`: 메인 페이지 스크롤 애니메이션(소개, 전자, 해킹, 알고리즘, 메이커, 체스, 베이스). 순서와 문구는 `sections/main.html`에서, 사이드바 항목은 `index.html`에서 바꿔요. 파일을 고친 뒤에는 `node scripts/build-posts.mjs`를 실행해 캐시 버전(`?v=`)을 갱신하세요.
- `blog.js`: 블로그 폴더 트리(접기/펴기), 태그 보기, 글 렌더링.
- `posts/<폴더>/.../<글>.md`: 블로그 글. 폴더 경로가 분류가 돼요. `posts.json`은 이 파일들에서 자동으로 만들어져요.

## 글 쓰는 법

`posts/` 아래 폴더에 마크다운 파일을 추가하면 돼요. 파일 이름은 영어나 번호로 쓰고, 폴더 경로가 주소(`#blog/post/폴더/.../파일이름`)가 돼요.

```
posts/hacking/dreamhack/123.md
```

```
---
title: 글 제목
date: 2026-10-25
tags: [CTF]
summary: 목록에 보일 한두 줄 요약
---

본문
```

- 폴더마다 `_folder.json`으로 화면에 보일 이름을 정해요: `{ "title": "드림핵", "description": "설명", "order": 1 }`. 없으면 폴더 이름이 그대로 보여요. 하위 폴더는 자유롭게 만들 수 있어요.
- 최상위 폴더가 메인의 "확인해보기" 버튼과 연결돼요: `electronics`, `hacking`, `algorithm`, `maker`, `chess`, `bass`. 해당 폴더에 글이 없으면 버튼이 "준비 중"으로 비활성화돼요. 새 섹션을 만들면 `sections/main.html`의 `data-folder`와 `openBlog('폴더')`를 맞춰요.
- 글 상단에 `updated: 2026-10-30`을 적으면 최종 수정일로 표시돼요. 안 적으면 GitHub Actions가 git 이력의 마지막 수정일을 써요. 작성일과 같은 날이면 표시하지 않아요.
- `##`, `###` 제목이 3개 이상이면 목차가 생기고, 제목에 마우스를 올리면 나오는 `#`을 누르면 그 제목의 링크가 복사돼요 (`#blog/post/글주소?h=제목`).
- 같은 폴더의 글끼리 날짜순으로 이전/다음 글 링크가 붙어요.
- 블로그 검색은 제목, 요약, 태그, 폴더 이름, 본문을 찾아요. 본문은 빌드 때 만들어지는 `search.json`을 써요.
- 태그(`tags`)는 선택 사항이에요. 폴더와 별개로 붙이는 꼬리표이고, 블로그 첫 화면의 태그 칩으로 모아볼 수 있어요.
- 이미지는 `posts/img/`에 넣고 `![설명](posts/img/파일.png)`로 불러와요.
- 수식은 LaTeX로 써요: 인라인 `$O(n)$`, 별도 줄 `$$ ... $$` (KaTeX). 달러 기호 자체는 `\$`로 써요. 코드 블록 안은 그대로 보여요.
- `draft: true`를 넣으면 목록에서 빠져요.
- `main`에 푸시하면 GitHub Actions(`.github/workflows/build-posts.yml`)가 `posts.json`을 갱신해요. 직접 갱신하려면 `node scripts/build-posts.mjs`를 실행하세요.

## 로컬에서 보기

```
python3 -m http.server 8000
```

그리고 `http://localhost:8000`을 열어요.
