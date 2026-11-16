document.documentElement.classList.add('js');

// 주소 형식 (경로 방식. 글마다 실제 주소가 있어서 링크를 공유하면 글 제목과 요약이 미리보기로 뜬다)
//   /                           메인. 메인 안의 섹션 위치는 /#main/<섹션>
//   /links/  /history/  /work/  각 페이지
//   /blog/                      블로그 전체글
//   /blog/folder/<폴더경로>/    폴더
//   /blog/tag/<태그>/           태그
//   /blog/post/<폴더경로>/<글>/ 글. 글 안의 제목 위치는 뒤에 #sec-... 을 붙인다
// 글과 각 페이지는 빌드 때 실제 파일(blog/post/.../index.html 등)로 만들어지고, 파일이 없는 주소(폴더, 태그)는 404.html 이 받아서 같은 화면을 그린다.
// 예전 주소(/#blog/post/글?h=제목, /p/글/)로 들어오면 새 주소로 바꿔서 연다.

const TABS = ['main', 'links', 'history', 'work', 'blog'];
// 브라우저 탭 제목. 블로그 글은 blog.js 가 글 제목으로 바꾼다.
const SITE_TITLE = 'sasak2 포트폴리오 | 김현민';
const TAB_TITLES = { main: SITE_TITLE, links: '링크 | sasak2', history: '이력 | sasak2', work: '작업 | sasak2', blog: '블로그 | sasak2' };
const loadedSections = new Set();
// 빌드 때 내용이 미리 들어간 채로 열린 섹션 (글 페이지, 이력/작업/링크 페이지)
const prerenderedSections = new Set();
// 섹션 HTML이 처음 로드된 직후 실행할 초기화 함수. showcase.js 등이 등록한다.
const sectionInit = {};

async function loadSection(tabName) {
    if (loadedSections.has(tabName)) return;

    const section = document.getElementById('tab-' + tabName);
    // 미리 그려진 섹션은 다시 불러오지 않는다 (불러오면 화면이 한 번 비었다가 다시 그려진다)
    if (section && section.childElementCount) {
        loadedSections.add(tabName);
        prerenderedSections.add(tabName);
        if (sectionInit[tabName]) sectionInit[tabName](section);
        return;
    }

    try {
        const response = await fetch(`sections/${tabName}.html`, { cache: 'no-cache' });
        if (response.ok) {
            const html = await response.text();
            if (section) {
                section.innerHTML = html;
                loadedSections.add(tabName);
                if (sectionInit[tabName]) sectionInit[tabName](section);
            }
        }
    } catch (e) {
        console.error(`섹션 로드 실패: ${tabName}`, e);
    }
}

// 예전 해시 주소를 새 경로 주소로 바꾼다. 예: #blog/post/a/b?h=sec-x -> /blog/post/a/b/#sec-x
// 메인의 섹션 위치(#main/...)나 글 안의 제목 위치(#sec-...)처럼 예전 주소가 아니면 null.
// (같은 함수가 scripts/build-posts.mjs 에도 있다)
function legacyHashToPath(hash) {
    const raw = String(hash || '').replace(/^#/, '');
    const qAt = raw.indexOf('?');
    const segs = (qAt >= 0 ? raw.slice(0, qAt) : raw).split('/').filter(Boolean);
    if (!segs.length || segs[0] === 'main' || !TABS.includes(segs[0])) return null;
    const h = qAt >= 0 ? new URLSearchParams(raw.slice(qAt + 1)).get('h') : '';
    return '/' + segs.join('/') + '/' + (h ? '#' + encodeURIComponent(h) : '');
}

// 주소(URL 객체) -> { tab, rest, anchor, href }. 사이트 화면이 아닌 주소(이미지 같은 파일, 없는 주소)는 null.
//   rest: 탭 뒤의 경로 조각들 (인코딩된 그대로), anchor: # 뒤의 제목 id, href: 정리된 주소
function resolveRoute(url) {
    const segs = url.pathname.split('/').filter(Boolean);
    if (segs.length && segs[segs.length - 1] === 'index.html') segs.pop();

    if (!segs.length || segs[0] === 'main') {
        if (!segs.length) {
            const moved = legacyHashToPath(url.hash);
            if (moved) return resolveRoute(new URL(moved, url));
        }
        const parts = url.hash.slice(1).split('/');
        const slug = segs[1] || (parts[0] === 'main' ? parts[1] || '' : '');
        return { tab: 'main', rest: slug ? [slug] : [], anchor: '', href: '/' + url.search + (slug ? '#main/' + slug : '') };
    }
    // 예전 글 주소 /p/<글>/
    if (segs[0] === 'p' && segs.length > 1) {
        return resolveRoute(new URL('/blog/post/' + segs.slice(1).join('/') + '/' + url.search + url.hash, url));
    }
    if (!TABS.includes(segs[0])) return null;

    let anchor = url.hash.slice(1);
    try { anchor = decodeURIComponent(anchor); } catch (e) { /* 인코딩이 깨져 있으면 그대로 쓴다 */ }
    return { tab: segs[0], rest: segs.slice(1), anchor, href: '/' + segs.join('/') + '/' + url.search + url.hash };
}

function currentHref() {
    return location.pathname + location.search + location.hash;
}

let currentTab = null;
let currentKey = null; // 지금 화면의 경로 (탭 + 나머지 조각)
let routeSeq = 0;
let routedOnce = false;
// 마지막으로 화면에 반영한 주소. 뒤로가기 한 번에 popstate, hashchange 가 둘 다 오는 경우 한 번만 처리하려고 기억한다.
let handledHref = null;

// 주소 표시줄만 바꾼다 (화면은 그대로). 글 안에서 제목으로 이동할 때 blog.js 가 쓴다.
function replaceUrl(href) {
    history.replaceState(null, '', href);
    handledHref = location.href;
}

// 사이트 안의 다른 화면으로 이동한다. 같은 주소면 주소는 그대로 두고 화면만 다시 맞춘다.
function navigate(href) {
    const target = resolveRoute(new URL(href, location.href));
    if (!target) {
        location.href = href;
        return;
    }
    if (target.href !== currentHref()) history.pushState(null, '', target.href);
    route();
}

// GoatCounter 집계. 한 페이지 안에서 화면만 바꾸는 방식이라 자동 집계는 끄고 라우트마다 직접 보낸다.
// 메인의 섹션 이동(/#main/circuit 등)은 같은 페이지 안의 스크롤이라 /main 하나로 묶는다.
let lastTrackedPath = null;

function sendWhenReady(data, tries = 0) {
    if (window.goatcounter && typeof window.goatcounter.count === 'function') {
        window.goatcounter.count(data);
    } else if (tries < 50) {
        // count.js 는 async 로 로드되므로 준비될 때까지 잠깐 기다린다. 광고 차단기 등으로 막히면 조용히 포기한다.
        setTimeout(() => sendWhenReady(data, tries + 1), 200);
    }
}

function trackPageview(tab, rest) {
    let path = '/' + (tab === 'main' ? 'main' : [tab, ...rest].join('/'));
    try { path = decodeURI(path); } catch (e) { /* 인코딩이 깨져 있으면 그대로 보낸다 */ }
    if (path === lastTrackedPath) return;
    const data = { path, title: path };
    // 첫 방문은 외부 유입 경로(document.referrer)를 쓰고, 이후 이동은 사이트 안에서 온 것으로 기록한다.
    if (lastTrackedPath !== null) data.referrer = location.origin + lastTrackedPath;
    lastTrackedPath = path;
    sendWhenReady(data);
}

function setActiveLink(match) {
    document.querySelectorAll('.side-link').forEach(link => {
        link.classList.toggle('active', match(link));
    });
}

async function route() {
    const mine = ++routeSeq;
    let target = resolveRoute(new URL(location.href));
    if (!target) {
        // 없는 주소(404.html 로 들어온 경우)는 메인으로
        target = { tab: 'main', rest: [], anchor: '', href: '/' };
    }
    // 예전 주소나 끝에 / 가 빠진 주소는 정리된 주소로 바꿔 둔다
    if (target.href !== currentHref()) history.replaceState(null, '', target.href);
    handledHref = location.href;

    const { tab, rest, anchor } = target;
    const key = [tab, ...rest].join('/');
    // 보고 있는 글 안에서 제목 위치만 바뀐 경우: 다시 그리지 않고 그 제목으로 이동만 한다
    if (tab === 'blog' && key === currentKey && anchor && window.blogJump && window.blogJump(anchor)) return;

    const first = !routedOnce; // 페이지를 열고 처음 그리는 화면
    routedOnce = true;
    await loadSection(tab);
    if (mine !== routeSeq) return;

    document.querySelectorAll('.section').forEach(section => {
        section.classList.toggle('active', section.id === 'tab-' + tab);
    });

    // 사이드바 활성 표시. 메인에서는 스크롤 위치에 따라 showcase.js 가 계속 갱신한다.
    if (tab === 'main') {
        const slug = rest[0] || 'intro';
        setActiveLink(link => link.dataset.go === slug);
    } else {
        setActiveLink(link => link.dataset.tab === tab);
    }

    // 미리 그려진 페이지를 처음 연 경우: 제목은 이미 그 페이지의 것이고,
    // 브라우저가 잡아 둔 스크롤 위치(새로고침 복원 등)도 건드리지 않는다
    const keepScroll = first && prerenderedSections.has(tab);
    if (!keepScroll) document.title = TAB_TITLES[tab] || SITE_TITLE;
    if (tab === 'blog' && window.blogRoute) await window.blogRoute(rest, anchor);
    if (mine !== routeSeq) return;

    if (tab === 'main' && rest[0]) {
        const el = document.getElementById('show-' + rest[0]);
        if (el) {
            const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            requestAnimationFrame(() => el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }));
        } else {
            window.scrollTo(0, 0);
        }
    } else if (!keepScroll && (tab !== currentTab || tab === 'blog' || tab === 'main')) {
        // 탭이 바뀌었거나 블로그 안에서 목록/글을 오갈 때는 맨 위로
        window.scrollTo(0, 0);
    }
    if (tab === 'blog' && window.blogAfterRoute) window.blogAfterRoute(keepScroll);
    currentTab = tab;
    currentKey = key;
    trackPageview(tab, rest);
}

// 사이트 안의 링크는 페이지를 새로 불러오지 않고 화면만 바꾼다.
// 새 탭으로 열기(Ctrl/가운데 클릭), 다른 사이트 링크, 파일 링크는 브라우저에 맡긴다.
document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = e.target.closest && e.target.closest('a[href]');
    if (!link || link.hasAttribute('download')) return;
    if (link.target && link.target !== '_self') return;
    // 글 안의 제목/목차 링크는 blog.js 가 처리한다
    if (link.classList.contains('h-anchor') || link.classList.contains('toc-link')) return;
    let url;
    try {
        url = new URL(link.href);
    } catch (e2) {
        return;
    }
    if (url.origin !== location.origin) return;
    const target = resolveRoute(url);
    if (!target) return;
    e.preventDefault();
    navigate(target.href);
});

function openLink(url) {
    window.open(url, '_blank');
}

// 뒤로/앞으로 가기, 주소의 # 부분을 직접 고친 경우
function onUrlChange() {
    if (location.href === handledHref) return;
    route();
}
window.addEventListener('popstate', onUrlChange);
window.addEventListener('hashchange', onUrlChange);

// 첫 화면. 메인은 예전처럼 모든 리소스가 로드된 뒤에 시작하고,
// 그 밖의 페이지는 문서가 준비되면 바로 시작한다 (글 페이지가 사진을 다 받을 때까지 기다리지 않게).
(function () {
    const initial = resolveRoute(new URL(location.href));
    if (!initial || initial.tab === 'main') window.addEventListener('load', route);
    else document.addEventListener('DOMContentLoaded', route);
})();
