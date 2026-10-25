// 블로그: posts.json 으로 목록/태그 필터를 그리고, 글은 posts/<slug>.md 를 불러와 렌더링한다.
// 주소 형식: #blog  /  #blog/tag/<태그>  /  #blog/post/<slug>

const TAG_ORDER = ['전자', '해킹', '알고리즘', '메이커', '체스', '베이스'];

let postsPromise = null;
function getPosts() {
    if (!postsPromise) {
        postsPromise = fetch('posts.json', { cache: 'no-cache' })
            .then((r) => (r.ok ? r.json() : []))
            .then((list) => (Array.isArray(list) ? list : []))
            .catch(() => []);
    }
    return postsPromise;
}

function openBlog(tag) {
    location.hash = tag ? '#blog/tag/' + encodeURIComponent(tag) : '#blog';
}

(function () {
    'use strict';

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function sortedTags(posts) {
        const count = new Map();
        posts.forEach((p) => p.tags.forEach((t) => count.set(t, (count.get(t) || 0) + 1)));
        const known = TAG_ORDER.filter((t) => count.has(t));
        const rest = [...count.keys()].filter((t) => !TAG_ORDER.includes(t)).sort();
        return [...known, ...rest].map((t) => [t, count.get(t)]);
    }

    function renderChips(box, posts, active) {
        box.replaceChildren();
        const make = (label, n, tag) => {
            const a = el('a', 'chip' + (tag === active ? ' active' : ''));
            a.href = tag ? '#blog/tag/' + encodeURIComponent(tag) : '#blog';
            a.append(label, el('span', 'chip-n', String(n)));
            box.appendChild(a);
        };
        make('전체', posts.length, null);
        sortedTags(posts).forEach(([t, n]) => make(t, n, t));
    }

    function renderList(box, posts) {
        box.replaceChildren();
        if (!posts.length) {
            box.appendChild(el('div', 'blog-empty', '아직 글이 없어요.'));
            return;
        }
        posts.forEach((p) => {
            const a = el('a', 'blog-item');
            a.href = '#blog/post/' + encodeURIComponent(p.slug);
            a.appendChild(el('div', 'blog-date', p.date.replace(/-/g, '.')));
            a.appendChild(el('div', 'blog-title', p.title));
            if (p.summary) a.appendChild(el('div', 'blog-preview', p.summary));
            if (p.tags.length) {
                const row = el('div', 'tag-row tag-row-sm');
                p.tags.forEach((t) => row.appendChild(el('span', 'tag', t)));
                a.appendChild(row);
            }
            box.appendChild(a);
        });
    }

    function stripFrontMatter(text) {
        return text.replace(/^﻿/, '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    }

    // 마크다운 변환기가 수식 안의 \ 나 _ 를 망가뜨리지 않도록,
    // 코드 블록을 제외한 $...$ / $$...$$ 를 먼저 빼 두었다가 변환 후 KaTeX 로 되돌린다.
    function renderMarkdown(md) {
        const maths = [];
        const parts = md.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/);
        for (let i = 0; i < parts.length; i += 2) {
            parts[i] = parts[i]
                .replace(/\$\$([\s\S]+?)\$\$/g, (m, tex) => {
                    maths.push({ tex: tex.trim(), display: true, raw: m });
                    return '@@MATH' + (maths.length - 1) + '@@';
                })
                .replace(/(^|[^\\$\w])\$(?!\s)([^$\n]+?)(?<!\s)\$(?![\w$])/g, (m, pre, tex) => {
                    maths.push({ tex, display: false, raw: m.slice(pre.length) });
                    return pre + '@@MATH' + (maths.length - 1) + '@@';
                });
        }
        let html = window.marked.parse(parts.join(''));
        html = html.replace(/@@MATH(\d+)@@/g, (m, n) => {
            const item = maths[Number(n)];
            if (!item) return m;
            if (window.katex) {
                try {
                    return window.katex.renderToString(item.tex, { displayMode: item.display, throwOnError: false });
                } catch (e) { /* 아래 원문으로 */ }
            }
            return item.raw.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        });
        return html;
    }

    async function renderPost(box, post, backTag) {
        box.replaceChildren();
        const back = el('a', 'post-back', '← 목록');
        back.href = backTag ? '#blog/tag/' + encodeURIComponent(backTag) : '#blog';
        box.appendChild(back);
        box.appendChild(el('div', 'blog-date', post.date.replace(/-/g, '.')));
        box.appendChild(el('h3', 'post-title', post.title));
        if (post.tags.length) {
            const row = el('div', 'tag-row tag-row-sm');
            post.tags.forEach((t) => {
                const a = el('a', 'tag tag-link', t);
                a.href = '#blog/tag/' + encodeURIComponent(t);
                row.appendChild(a);
            });
            box.appendChild(row);
        }
        const body = el('div', 'post-body');
        box.appendChild(body);
        body.textContent = '불러오는 중...';

        try {
            const res = await fetch('posts/' + encodeURIComponent(post.slug) + '.md', { cache: 'no-cache' });
            if (!res.ok) throw new Error(res.status);
            const md = stripFrontMatter(await res.text());
            if (window.marked) {
                body.innerHTML = renderMarkdown(md);
            } else {
                const pre = el('pre', 'post-raw', md);
                body.replaceChildren(pre);
            }
        } catch (e) {
            body.textContent = '글을 불러오지 못했어요.';
        }
    }

    let seq = 0;
    async function blogRoute(parts) {
        const mine = ++seq;
        const root = document.getElementById('tab-blog');
        const chips = root.querySelector('#blog-chips');
        const list = root.querySelector('#blog-list');
        const post = root.querySelector('#blog-post');
        if (!chips || !list || !post) return;

        const posts = await getPosts();
        if (mine !== seq) return;

        const safe = (s) => {
            try {
                return decodeURIComponent(s || '');
            } catch (e) {
                return '';
            }
        };

        if (parts[0] === 'post') {
            const slug = safe(parts[1]);
            const found = posts.find((p) => p.slug === slug);
            chips.hidden = true;
            list.hidden = true;
            post.hidden = false;
            if (!found) {
                post.replaceChildren();
                const back = el('a', 'post-back', '← 목록');
                back.href = '#blog';
                post.append(back, el('div', 'blog-empty', '글을 찾을 수 없어요.'));
                return;
            }
            await renderPost(post, found, null);
            return;
        }

        const tag = parts[0] === 'tag' ? safe(parts[1]) : null;
        post.hidden = true;
        post.replaceChildren();
        chips.hidden = false;
        list.hidden = false;
        renderChips(chips, posts, tag);
        renderList(list, tag ? posts.filter((p) => p.tags.includes(tag)) : posts);
    }

    window.blogRoute = blogRoute;
})();
