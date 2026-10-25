// 블로그: posts.json 으로 폴더 트리/목록을 그리고, 글은 posts/<경로>.md 를 불러와 렌더링한다.
// 주소 형식: #blog  /  #blog/folder/<폴더경로>  /  #blog/tag/<태그>  /  #blog/post/<폴더경로>/<글>

let blogDataPromise = null;
function getBlogData() {
    if (!blogDataPromise) {
        blogDataPromise = fetch('posts.json', { cache: 'no-cache' })
            .then((r) => (r.ok ? r.json() : {}))
            .catch(() => ({}))
            .then((d) => {
                const posts = Array.isArray(d) ? d : Array.isArray(d.posts) ? d.posts : [];
                const folders = Array.isArray(d.folders) ? d.folders : [];
                posts.forEach((p) => {
                    if (typeof p.folder !== 'string') p.folder = '';
                    if (!Array.isArray(p.tags)) p.tags = [];
                });
                return { folders, posts };
            });
    }
    return blogDataPromise;
}

function getPosts() {
    return getBlogData().then((d) => d.posts);
}

function pathToHash(path) {
    return path.split('/').map(encodeURIComponent).join('/');
}

// 폴더 경로(예: "hacking")를 주면 그 폴더 화면으로, 없으면 블로그 첫 화면으로 이동
function openBlog(folder) {
    location.hash = folder ? '#blog/folder/' + pathToHash(folder) : '#blog';
}

(function () {
    'use strict';

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    const parentOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
    const inFolder = (p, path) => p.folder === path || p.folder.startsWith(path + '/');

    function byOrder(a, b) {
        return a.order - b.order || a.title.localeCompare(b.title, 'ko');
    }

    function folderTitle(data, path) {
        const f = data.folders.find((x) => x.path === path);
        return f ? f.title : path.split('/').pop();
    }

    function sortedTags(posts) {
        const count = new Map();
        posts.forEach((p) => p.tags.forEach((t) => count.set(t, (count.get(t) || 0) + 1)));
        return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
    }

    function renderChips(box, posts, active) {
        box.replaceChildren();
        const tags = sortedTags(posts);
        if (!tags.length) return;
        box.appendChild(el('span', 'chip-label', '태그'));
        const make = (label, n, tag) => {
            const a = el('a', 'chip' + (tag === active ? ' active' : ''));
            a.href = tag ? '#blog/tag/' + encodeURIComponent(tag) : '#blog';
            a.append(label, el('span', 'chip-n', String(n)));
            box.appendChild(a);
        };
        if (active) make('전체', posts.length, null);
        tags.forEach(([t, n]) => make(t, n, t));
    }

    // 경로 표시: 블로그 > 전자공학 > 회로이론 (마지막 항목은 링크 없이)
    function renderCrumb(box, data, path, lastLabel, linkLast) {
        box.replaceChildren();
        const add = (label, href) => {
            if (box.childNodes.length) box.appendChild(el('span', 'crumb-sep', '>'));
            if (href) {
                const a = el('a', 'crumb-link', label);
                a.href = href;
                box.appendChild(a);
            } else {
                box.appendChild(el('span', 'crumb-here', label));
            }
        };
        const parts = path ? path.split('/') : [];
        add('블로그', parts.length || lastLabel ? '#blog' : null);
        parts.forEach((_, i) => {
            const sub = parts.slice(0, i + 1).join('/');
            const last = i === parts.length - 1 && !lastLabel && !linkLast;
            add(folderTitle(data, sub), last ? null : '#blog/folder/' + pathToHash(sub));
        });
        if (lastLabel) add(lastLabel, null);
    }

    function postItem(p, data, showFolder) {
        const a = el('a', 'blog-item');
        a.href = '#blog/post/' + pathToHash(p.slug);
        if (showFolder && p.folder) {
            const names = p.folder.split('/').map((_, i, arr) => folderTitle(data, arr.slice(0, i + 1).join('/')));
            a.appendChild(el('div', 'blog-folder', names.join(' > ')));
        }
        a.appendChild(el('div', 'blog-date', p.date.replace(/-/g, '.')));
        a.appendChild(el('div', 'blog-title', p.title));
        if (p.summary) a.appendChild(el('div', 'blog-preview', p.summary));
        if (p.tags.length) {
            const row = el('div', 'tag-row tag-row-sm');
            p.tags.forEach((t) => row.appendChild(el('span', 'tag', t)));
            a.appendChild(row);
        }
        return a;
    }

    function postList(posts, data, showFolder) {
        const box = el('div', 'blog-list');
        posts.forEach((p) => box.appendChild(postItem(p, data, showFolder)));
        return box;
    }

    // 접었다 펼 수 있는 폴더 한 칸. 안에는 하위 폴더와 이 폴더의 글이 들어 있다.
    function folderNode(data, folder) {
        const det = el('details', 'folder');
        const sum = el('summary', 'folder-sum');
        const main = el('div', 'folder-main');
        const line = el('div', 'folder-line');
        line.appendChild(el('span', 'folder-name', folder.title));
        line.appendChild(el('span', 'folder-count', String(data.posts.filter((p) => inFolder(p, folder.path)).length)));
        main.appendChild(line);
        if (folder.description) main.appendChild(el('div', 'folder-desc', folder.description));
        sum.appendChild(main);
        const go = el('a', 'folder-go', '이 폴더만 보기');
        go.href = '#blog/folder/' + pathToHash(folder.path);
        sum.appendChild(go);
        det.appendChild(sum);

        const body = el('div', 'folder-body');
        data.folders.filter((f) => parentOf(f.path) === folder.path).sort(byOrder).forEach((f) => body.appendChild(folderNode(data, f)));
        const direct = data.posts.filter((p) => p.folder === folder.path);
        if (direct.length) body.appendChild(postList(direct, data, false));
        det.appendChild(body);
        return det;
    }

    function renderFolderView(box, data, path) {
        box.replaceChildren();
        const subs = data.folders.filter((f) => parentOf(f.path) === path).sort(byOrder);
        const direct = data.posts.filter((p) => p.folder === path);
        if (path) {
            const f = data.folders.find((x) => x.path === path);
            const head = el('div', 'folder-head');
            head.appendChild(el('h3', 'folder-title', f ? f.title : path.split('/').pop()));
            if (f && f.description) head.appendChild(el('div', 'folder-head-desc', f.description));
            box.appendChild(head);
        }
        if (!subs.length && !direct.length) {
            box.appendChild(el('div', 'blog-empty', path ? '이 폴더에는 아직 글이 없어요.' : '아직 글이 없어요.'));
            return;
        }
        if (subs.length) {
            const tree = el('div', 'folder-tree');
            subs.forEach((f) => tree.appendChild(folderNode(data, f)));
            box.appendChild(tree);
        }
        if (direct.length) {
            if (subs.length) box.appendChild(el('div', 'blog-subhead', '이 폴더의 글'));
            box.appendChild(postList(direct, data, false));
        }
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

    // 코드 블록: 문법 색 강조 + 언어 라벨 + 복사 버튼
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
        return new Promise((resolve, reject) => {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy') ? resolve() : reject(new Error('copy failed'));
            } catch (e) {
                reject(e);
            } finally {
                ta.remove();
            }
        });
    }

    function enhanceCode(root) {
        root.querySelectorAll('pre').forEach((pre) => {
            const code = pre.querySelector('code');
            if (!code || pre.parentNode.classList.contains('code-block')) return;
            const m = /language-([\w+#.-]+)/.exec(code.className);
            const lang = m ? m[1] : '';
            if (lang && window.hljs && window.hljs.getLanguage(lang)) {
                try {
                    window.hljs.highlightElement(code);
                } catch (e) { /* 색 강조 없이 표시 */ }
            }

            const wrap = el('div', 'code-block');
            const bar = el('div', 'code-bar');
            bar.appendChild(el('span', 'code-lang', lang));
            const btn = el('button', 'code-copy', '복사');
            btn.type = 'button';
            btn.addEventListener('click', () => {
                copyText(code.innerText.replace(/\n$/, '')).then(
                    () => { btn.textContent = '복사됨'; },
                    () => { btn.textContent = '실패'; }
                );
                setTimeout(() => { btn.textContent = '복사'; }, 1500);
            });
            bar.appendChild(btn);
            pre.parentNode.insertBefore(wrap, pre);
            wrap.append(bar, pre);
        });
    }

    async function renderPost(box, data, post) {
        box.replaceChildren();
        const crumb = el('nav', 'blog-crumb post-crumb');
        renderCrumb(crumb, data, post.folder, null, true);
        box.appendChild(crumb);
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
            const res = await fetch('posts/' + post.slug.split('/').map(encodeURIComponent).join('/') + '.md', { cache: 'no-cache' });
            if (!res.ok) throw new Error(res.status);
            const md = stripFrontMatter(await res.text());
            if (window.marked) {
                body.innerHTML = renderMarkdown(md);
                enhanceCode(body);
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
        const crumb = root.querySelector('#blog-crumb');
        const chips = root.querySelector('#blog-chips');
        const view = root.querySelector('#blog-list');
        const post = root.querySelector('#blog-post');
        if (!crumb || !chips || !view || !post) return;

        const data = await getBlogData();
        if (mine !== seq) return;

        const safe = (s) => {
            try {
                return decodeURIComponent(s || '');
            } catch (e) {
                return '';
            }
        };
        const kind = parts[0];
        const rest = parts.slice(1).map(safe).filter(Boolean).join('/');

        if (kind === 'post') {
            const found = data.posts.find((p) => p.slug === rest);
            crumb.hidden = true;
            chips.hidden = true;
            view.hidden = true;
            post.hidden = false;
            if (!found) {
                post.replaceChildren();
                const back = el('a', 'post-back', '← 블로그');
                back.href = '#blog';
                post.append(back, el('div', 'blog-empty', '글을 찾을 수 없어요.'));
                return;
            }
            await renderPost(post, data, found);
            return;
        }

        post.hidden = true;
        post.replaceChildren();
        view.hidden = false;
        crumb.hidden = false;

        if (kind === 'tag') {
            chips.hidden = false;
            renderChips(chips, data.posts, rest);
            renderCrumb(crumb, data, '', '#' + rest);
            view.replaceChildren();
            const hits = data.posts.filter((p) => p.tags.includes(rest));
            if (hits.length) view.appendChild(postList(hits, data, true));
            else view.appendChild(el('div', 'blog-empty', '이 태그의 글이 없어요.'));
            return;
        }

        const path = kind === 'folder' ? rest : '';
        renderCrumb(crumb, data, path, null);
        crumb.hidden = !path;
        chips.hidden = !!path;
        if (!path) renderChips(chips, data.posts, null);
        renderFolderView(view, data, path);
    }

    window.blogRoute = blogRoute;
})();
