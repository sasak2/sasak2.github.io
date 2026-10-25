document.documentElement.classList.add('js');

const TABS = ['main', 'links', 'history', 'work', 'blog'];
const loadedSections = new Set();
// 섹션 HTML이 처음 로드된 직후 실행할 초기화 함수. showcase.js 등이 등록한다.
const sectionInit = {};

async function loadSection(tabName) {
    if (loadedSections.has(tabName)) return;

    try {
        const response = await fetch(`sections/${tabName}.html`, { cache: 'no-cache' });
        if (response.ok) {
            const html = await response.text();
            const section = document.getElementById('tab-' + tabName);
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

function parseHash() {
    const [tab, ...rest] = window.location.hash.slice(1).split('/');
    return { tab: TABS.includes(tab) ? tab : 'main', rest };
}

let currentTab = null;
let routeSeq = 0;

function setActiveLink(match) {
    document.querySelectorAll('.side-link').forEach(link => {
        link.classList.toggle('active', match(link));
    });
}

async function route() {
    const mine = ++routeSeq;
    const { tab, rest } = parseHash();
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

    if (tab === 'blog' && window.blogRoute) await window.blogRoute(rest);
    if (mine !== routeSeq) return;

    if (tab === 'main' && rest[0]) {
        const target = document.getElementById('show-' + rest[0]);
        if (target) {
            const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            requestAnimationFrame(() => target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }));
        } else {
            window.scrollTo(0, 0);
        }
    } else if (tab !== currentTab || tab === 'blog' || tab === 'main') {
        // 탭이 바뀌었거나 블로그 안에서 목록/글을 오갈 때는 맨 위로
        window.scrollTo(0, 0);
    }
    currentTab = tab;
}

// 같은 주소의 사이드바 링크를 다시 눌러도 해당 위치로 이동
document.addEventListener('click', (e) => {
    const link = e.target.closest && e.target.closest('a[href^="#"]');
    if (!link) return;
    if (link.getAttribute('href') === window.location.hash) {
        e.preventDefault();
        route();
    }
});

function openLink(url) {
    window.open(url, '_blank');
}

window.addEventListener('load', route);
window.addEventListener('hashchange', route);
