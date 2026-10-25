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

async function route() {
    const mine = ++routeSeq;
    const { tab, rest } = parseHash();
    await loadSection(tab);
    if (mine !== routeSeq) return;

    document.querySelectorAll('.nav-item').forEach(item => {
        const isActive = item.getAttribute('data-tab') === tab;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-selected', isActive);
    });

    document.querySelectorAll('.section').forEach(section => {
        section.classList.toggle('active', section.id === 'tab-' + tab);
    });

    if (tab === 'blog' && window.blogRoute) await window.blogRoute(rest);

    // 탭이 바뀌었거나 블로그 안에서 목록/글을 오갈 때는 맨 위로
    if (tab !== currentTab || tab === 'blog') window.scrollTo(0, 0);
    currentTab = tab;
}

function switchTab(tabName) {
    if (window.location.hash.slice(1) === tabName) {
        route();
    } else {
        window.location.hash = tabName;
    }
}

function openLink(url) {
    window.open(url, '_blank');
}

window.addEventListener('load', route);
window.addEventListener('hashchange', route);
