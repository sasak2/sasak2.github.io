const loadedSections = new Set();

async function loadSection(tabName) {
    if (loadedSections.has(tabName)) return;

    try {
        const response = await fetch(`sections/${tabName}.html`);
        if (response.ok) {
            const html = await response.text();
            const section = document.getElementById('tab-' + tabName);
            if (section) {
                section.innerHTML = html;
                loadedSections.add(tabName);
            }
        }
    } catch (e) {
        console.error(`섹션 로드 실패: ${tabName}`, e);
    }
}

async function switchTab(tabName) {
    await loadSection(tabName);

    document.querySelectorAll('.nav-item').forEach(item => {
        const isActive = item.getAttribute('data-tab') === tabName;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-selected', isActive);
    });

    document.querySelectorAll('.section').forEach(section => {
        const isActive = section.id === 'tab-' + tabName;
        section.classList.toggle('active', isActive);
    });

    history.pushState(null, null, '#' + tabName);
}

function openLink(url) {
    window.open(url, '_blank');
}

function scrollToBlog(blogId) {
    switchTab('blog').then(() => {
        setTimeout(() => {
            const blogItem = document.querySelector(`[data-blog-id="${blogId}"]`);
            if (blogItem) {
                blogItem.scrollIntoView({ behavior: 'smooth', block: 'start' });
                blogItem.style.background = 'var(--color-background-secondary)';
                blogItem.style.borderRadius = 'var(--border-radius-sm)';
                setTimeout(() => {
                    blogItem.style.background = '';
                    blogItem.style.borderRadius = '';
                }, 1500);
            }
        }, 100);
    });
}

window.addEventListener('load', async () => {
    const hash = window.location.hash.slice(1);
    const initialTab = (hash && ['main', 'links', 'history', 'work', 'blog'].includes(hash))
        ? hash
        : 'main';
    await switchTab(initialTab);
});

window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    if (hash && ['main', 'links', 'history', 'work', 'blog'].includes(hash)) {
        switchTab(hash);
    }
});
