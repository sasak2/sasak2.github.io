// 블로그: posts.json 으로 폴더 트리/목록을 그리고, 글은 posts/<경로>.md 를 불러와 렌더링한다.
// 화면: 왼쪽 폴더 트리(항상 펼침) + 오른쪽 글 목록(최신순). 폴더를 누르면 그 아래 모든 글이 보인다.
// 주소 형식: #blog(전체글)  /  #blog/folder/<폴더경로>  /  #blog/tag/<태그>  /  #blog/post/<폴더경로>/<글>

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

    // [youtube-embed:start]
    // 이 블록은 blog.js 와 scripts/build-posts.mjs 에 똑같이 들어 있어야 해요 (한쪽만 고치지 마세요).
    // 규칙: 코드(블록, 인라인) 밖에서, 한 줄에 유튜브 주소만 단독으로 있을 때만 플레이어로 바꾼다.
    // 링크 문법([글자](주소)), 문장 중간의 주소, 목록/인용 안의 주소, 들여쓴 주소는 그대로 둔다.
    const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
    const YT_ID = /^[A-Za-z0-9_-]{11}$/;
    const YT_CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/;
    const YT_LINE = /^(?:<(https?:\/\/[^\s<>\u0000]+)>|(https?:\/\/[^\s<>\u0000]+))[ \t]*$/gm;

    // 시작 시간: 90, 90s, 1m30s, 1h2m3s -> 초 (읽을 수 없으면 0)
    function ytSeconds(value) {
        if (!value) return 0;
        if (/^\d+$/.test(value)) return Number(value);
        const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(value);
        if (!m || !(m[1] || m[2] || m[3])) return 0;
        return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
    }

    // youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID 만 인식한다. 아니면 null.
    function parseYoutube(href) {
        let u;
        try {
            u = new URL(href);
        } catch (e) {
            return null;
        }
        const host = u.hostname.toLowerCase();
        if (!YT_HOSTS.has(host)) return null;
        const segs = u.pathname.split('/').filter(Boolean);
        let id = '';
        if (host === 'youtu.be') {
            if (segs.length === 1) id = segs[0];
        } else if (segs.length === 1 && segs[0] === 'watch') {
            id = u.searchParams.get('v') || '';
        } else if (segs.length === 2 && segs[0] === 'shorts') {
            id = segs[1];
        }
        if (!YT_ID.test(id)) return null;
        return { id, start: ytSeconds(u.searchParams.get('t')) || ytSeconds(u.searchParams.get('start')) };
    }

    function youtubeWatchUrl(info) {
        return 'https://www.youtube.com/watch?v=' + info.id + (info.start ? '&t=' + info.start + 's' : '');
    }

    function youtubeEmbedHtml(info) {
        const src = 'https://www.youtube-nocookie.com/embed/' + info.id + (info.start ? '?start=' + info.start : '');
        return (
            '<figure class="yt-embed"><div class="yt-frame">' +
            '<iframe src="' + src + '" title="YouTube 동영상 플레이어" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" ' +
            'allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"></iframe>' +
            '</div><figcaption class="yt-link"><a href="' + youtubeWatchUrl(info) + '" target="_blank" rel="noopener noreferrer">YouTube에서 보기</a></figcaption></figure>'
        );
    }

    // 코드 바깥에서 "유튜브 주소만 있는 줄"을 찾아 replacer(info) 가 돌려준 문자열로 바꾼다.
    // 코드는 잠시 토큰으로 가려 두기 때문에 코드 앞뒤 문장과 이어진 줄은 단독 줄로 보지 않는다.
    function mapYoutubeLines(md, replacer) {
        const codes = [];
        return md
            .split(YT_CODE)
            .map((part, i) => (i % 2 ? '\u0000' + (codes.push(part) - 1) + '\u0000' : part))
            .join('')
            .replace(YT_LINE, (line, angled, bare) => {
                const info = parseYoutube(angled || bare);
                return info ? replacer(info) : line;
            })
            .replace(/\u0000(\d+)\u0000/g, (m, n) => codes[Number(n)]);
    }

    // 마크다운 변환 전: 해당 줄을 자기 문단인 @@YT0@@ 로 바꿔 둔다 (앞뒤에 빈 줄을 넣어 다른 줄과 섞이지 않게)
    function protectYoutube(md, embeds) {
        return mapYoutubeLines(md, (info) => {
            embeds.push(info);
            return '\n@@YT' + (embeds.length - 1) + '@@\n';
        });
    }

    // 마크다운 변환 후: <p>@@YT0@@</p> 를 플레이어로 바꾼다. 문단이 아닌 곳에 남은 토큰은 일반 링크로 되돌린다.
    function restoreYoutube(html, embeds) {
        return html
            .replace(/<p>@@YT(\d+)@@<\/p>/g, (m, n) => (embeds[Number(n)] ? youtubeEmbedHtml(embeds[Number(n)]) : m))
            .replace(/@@YT(\d+)@@/g, (m, n) => {
                const info = embeds[Number(n)];
                return info ? '<a href="' + youtubeWatchUrl(info) + '">' + youtubeWatchUrl(info) + '</a>' : m;
            });
    }
    // [youtube-embed:end]

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
        box.appendChild(el('div', 'tag-box-label', '태그'));
        const wrap = el('div', 'chip-row');
        tags.forEach(([t, n]) => {
            const a = el('a', 'chip' + (t === active ? ' active' : ''));
            a.href = '#blog/tag/' + encodeURIComponent(t);
            a.append(t, el('span', 'chip-n', String(n)));
            wrap.appendChild(a);
        });
        box.appendChild(wrap);
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

    function postItem(p, data, showFolder, snippet) {
        const a = el('a', 'blog-item');
        a.href = '#blog/post/' + pathToHash(p.slug);
        if (showFolder && p.folder) {
            const names = p.folder.split('/').map((_, i, arr) => folderTitle(data, arr.slice(0, i + 1).join('/')));
            a.appendChild(el('div', 'blog-folder', names.join(' > ')));
        }
        a.appendChild(el('div', 'blog-date', p.date.replace(/-/g, '.')));
        a.appendChild(el('div', 'blog-title', p.title));
        if (snippet) a.appendChild(el('div', 'blog-preview blog-snippet', snippet));
        else if (p.summary) a.appendChild(el('div', 'blog-preview', p.summary));
        if (p.tags.length) {
            const row = el('div', 'tag-row tag-row-sm');
            p.tags.forEach((t) => row.appendChild(el('span', 'tag', t)));
            a.appendChild(row);
        }
        return a;
    }

    function postList(posts, data, showFolder, snippets) {
        const box = el('div', 'blog-list');
        posts.forEach((p) => box.appendChild(postItem(p, data, showFolder, snippets && snippets.get(p.slug))));
        return box;
    }

    // ---- 검색: 제목, 요약, 태그, 폴더 이름, 본문(search.json)을 한꺼번에 찾는다 ----
    let searchPromise = null;
    function getSearchIndex() {
        if (!searchPromise) {
            searchPromise = fetch('search.json', { cache: 'no-cache' })
                .then((r) => (r.ok ? r.json() : {}))
                .catch(() => ({}));
        }
        return searchPromise;
    }

    function searchPosts(data, index, query) {
        const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
        const snippets = new Map();
        const scored = [];
        data.posts.forEach((p) => {
            const title = p.title.toLowerCase();
            const folderNames = p.folder
                ? p.folder.split('/').map((_, i, arr) => folderTitle(data, arr.slice(0, i + 1).join('/'))).join(' ')
                : '';
            const meta = [p.summary, p.tags.join(' '), folderNames].join(' ').toLowerCase();
            const body = (index[p.slug] || '').toLowerCase();
            if (!tokens.every((t) => title.includes(t) || meta.includes(t) || body.includes(t))) return;
            const inTitle = tokens.filter((t) => title.includes(t)).length;
            scored.push({ p, inTitle });
            if (!tokens.some((t) => title.includes(t) || p.summary.toLowerCase().includes(t))) {
                const raw = index[p.slug] || '';
                const at = body.indexOf(tokens.find((t) => body.includes(t)) || '');
                if (at >= 0) {
                    const from = Math.max(0, at - 30);
                    snippets.set(p.slug, (from > 0 ? '…' : '') + raw.slice(from, at + 100).trim() + '…');
                }
            }
        });
        scored.sort((a, b) => b.inTitle - a.inTitle || (a.p.date < b.p.date ? 1 : a.p.date > b.p.date ? -1 : 0));
        return { posts: scored.map((x) => x.p), snippets };
    }

    // 왼쪽 폴더 트리: 전체글 + 모든 폴더를 항상 펼쳐서 보여준다. 선택된 항목에는 밑줄.
    function renderTree(box, data, selected) {
        box.replaceChildren();
        const row = (label, count, href, depth, on) => {
            const a = el('a', 'tree-item' + (on ? ' active' : '') + (depth === 0 ? ' top' : ''));
            a.href = href;
            a.style.paddingLeft = 10 + depth * 16 + 'px';
            a.appendChild(el('span', 'tree-name', label));
            a.appendChild(el('span', 'tree-count', String(count)));
            if (on) a.setAttribute('aria-current', 'page');
            box.appendChild(a);
        };
        row('전체글', data.posts.length, '#blog', 0, selected === null);
        const walkTree = (parent, depth) => {
            data.folders
                .filter((f) => parentOf(f.path) === parent)
                .sort(byOrder)
                .forEach((f) => {
                    const n = data.posts.filter((p) => inFolder(p, f.path)).length;
                    row(f.title, n, '#blog/folder/' + pathToHash(f.path), depth, selected === f.path);
                    walkTree(f.path, depth + 1);
                });
        };
        walkTree('', 0);
    }

    // 오른쪽 목록 머리말: 폴더/태그 이름, 설명, 글 수
    function listHead(title, desc, count) {
        const head = el('div', 'folder-head');
        const line = el('div', 'folder-head-line');
        line.appendChild(el('h3', 'folder-title', title));
        line.appendChild(el('span', 'folder-count', count + '개의 글'));
        head.appendChild(line);
        if (desc) head.appendChild(el('div', 'folder-head-desc', desc));
        return head;
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
        // 한 줄에 유튜브 주소만 있는 줄은 변환 전에 자리표시자로 바꿔 두고, 변환 후 플레이어로 되돌린다.
        // (수식을 먼저 뺀 뒤라서 $$ ... $$ 안의 줄은 건드리지 않는다)
        const embeds = [];
        let html = window.marked.parse(protectYoutube(parts.join(''), embeds));
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
        return restoreYoutube(html, embeds);
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

    // ---- 제목 앵커와 목차 ----
    // 주소가 해시 라우팅이라 #제목 은 쓸 수 없어서, 글 주소 뒤에 ?h=<제목id> 를 붙인다.
    let currentSlug = '';
    let pendingAnchor = null;

    function anchorHash(slug, id) {
        return '#blog/post/' + pathToHash(slug) + (id ? '?h=' + encodeURIComponent(id) : '');
    }

    function headingText(h) {
        const clone = h.cloneNode(true);
        clone.querySelectorAll('.katex-html, .h-anchor').forEach((n) => n.remove());
        return clone.textContent.replace(/\s+/g, ' ').trim();
    }

    function buildToc(body, slug) {
        const heads = [...body.querySelectorAll('h2, h3')];
        const used = new Set();
        const items = [];
        heads.forEach((h) => {
            const text = headingText(h);
            let base = text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || 'section';
            let id = 'sec-' + base;
            for (let n = 2; used.has(id); n++) id = 'sec-' + base + '-' + n;
            used.add(id);
            h.id = id;
            const a = el('a', 'h-anchor', '#');
            a.href = anchorHash(slug, id);
            a.title = '이 제목의 링크 복사';
            h.appendChild(a);
            items.push({ id, text, level: h.tagName === 'H3' ? 3 : 2 });
        });
        if (items.length < 3) return null;
        const det = el('details', 'toc');
        det.open = window.matchMedia('(min-width: 961px)').matches;
        det.appendChild(el('summary', 'toc-title', '목차'));
        const list = el('ul', 'toc-list');
        items.forEach((it) => {
            const li = el('li', 'toc-l' + it.level);
            const a = el('a', 'toc-link', it.text);
            a.href = anchorHash(slug, it.id);
            a.dataset.id = it.id;
            li.appendChild(a);
            list.appendChild(li);
        });
        det.appendChild(list);
        return det;
    }

    function jumpTo(id, replace) {
        const target = id && document.getElementById(id);
        if (!target) return false;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        if (replace) history.replaceState(null, '', anchorHash(currentSlug, id));
        return true;
    }

    document.addEventListener('click', (e) => {
        const a = e.target.closest && e.target.closest('a.h-anchor, .toc-link');
        if (!a) return;
        e.preventDefault();
        const id = a.dataset.id || (a.parentElement && a.parentElement.id);
        if (!jumpTo(id, true)) return;
        if (a.classList.contains('h-anchor')) {
            copyText(location.origin + location.pathname + location.hash).then(() => {
                a.classList.add('copied');
                setTimeout(() => a.classList.remove('copied'), 1400);
            }, () => {});
        }
    });

    // 라우팅이 끝나 맨 위로 스크롤된 뒤, 주소에 ?h= 가 있으면 그 제목으로 이동 (script.js 가 호출)
    window.blogAfterRoute = function () {
        if (!pendingAnchor) return;
        const id = pendingAnchor;
        pendingAnchor = null;
        requestAnimationFrame(() => jumpTo(id, false));
    };

    function dateLabel(post) {
        let t = post.date.replace(/-/g, '.');
        if (post.updated && post.updated > post.date) t += '  ·  최종 수정 ' + post.updated.replace(/-/g, '.');
        return t;
    }

    // 같은 폴더 안에서 날짜순으로 이전(더 오래된) / 다음(더 최근) 글
    function renderPostNav(box, data, post) {
        const sibs = data.posts
            .filter((p) => p.folder === post.folder)
            .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.slug.localeCompare(b.slug)));
        const i = sibs.findIndex((p) => p.slug === post.slug);
        const prev = i > 0 ? sibs[i - 1] : null;
        const next = i >= 0 && i < sibs.length - 1 ? sibs[i + 1] : null;
        if (!prev && !next) return;
        const nav = el('nav', 'post-nav');
        const make = (p, label, cls) => {
            if (!p) {
                nav.appendChild(el('span', 'post-nav-empty'));
                return;
            }
            const a = el('a', 'post-nav-item ' + cls);
            a.href = '#blog/post/' + pathToHash(p.slug);
            a.appendChild(el('span', 'post-nav-label', label));
            a.appendChild(el('span', 'post-nav-title', p.title));
            nav.appendChild(a);
        };
        make(prev, '← 이전 글', 'prev');
        make(next, '다음 글 →', 'next');
        box.appendChild(nav);
    }

    async function renderPost(box, data, post, anchor) {
        currentSlug = post.slug;
        pendingAnchor = anchor || null;
        box.replaceChildren();
        const crumb = el('nav', 'blog-crumb post-crumb');
        renderCrumb(crumb, data, post.folder, null, true);
        box.appendChild(crumb);
        box.appendChild(el('div', 'blog-date', dateLabel(post)));
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
                const toc = buildToc(body, post.slug);
                if (toc) box.insertBefore(toc, body);
            } else {
                const pre = el('pre', 'post-raw', md);
                body.replaceChildren(pre);
            }
        } catch (e) {
            body.textContent = '글을 불러오지 못했어요.';
            return;
        }
        renderPostNav(box, data, post);
    }

    let seq = 0;
    async function blogRoute(parts) {
        const mine = ++seq;
        const root = document.getElementById('tab-blog');
        const crumb = root.querySelector('#blog-crumb');
        const browse = root.querySelector('#blog-browse');
        const toggle = root.querySelector('#blog-side-toggle');
        const tree = root.querySelector('#blog-tree');
        const tags = root.querySelector('#blog-tags');
        const view = root.querySelector('#blog-list');
        const post = root.querySelector('#blog-post');
        if (!crumb || !browse || !toggle || !tree || !tags || !view || !post) return;

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
        // 글 주소 끝의 ?h=<제목id> 는 떼어 둔다
        const rawRest = parts.slice(1).join('/');
        const qAt = rawRest.indexOf('?');
        const query = qAt >= 0 ? new URLSearchParams(rawRest.slice(qAt + 1)) : new URLSearchParams();
        const rest = (qAt >= 0 ? rawRest.slice(0, qAt) : rawRest).split('/').map(safe).filter(Boolean).join('/');

        if (kind === 'post') {
            const found = data.posts.find((p) => p.slug === rest);
            browse.hidden = true;
            crumb.hidden = true;
            post.hidden = false;
            if (!found) {
                post.replaceChildren();
                const back = el('a', 'post-back', '← 블로그');
                back.href = '#blog';
                post.append(back, el('div', 'blog-empty', '글을 찾을 수 없어요.'));
                return;
            }
            await renderPost(post, data, found, query.get('h'));
            return;
        }

        post.hidden = true;
        post.replaceChildren();
        browse.hidden = false;
        crumb.hidden = true;
        browse.classList.remove('tree-open');

        // 선택 상태: 전체글(null) / 폴더 경로 / 태그
        const isTag = kind === 'tag';
        const folder = kind === 'folder' && data.folders.some((f) => f.path === rest) ? rest : null;
        renderTree(tree, data, isTag ? undefined : folder);
        renderChips(tags, data.posts, isTag ? rest : null);

        let hits;
        let head;
        if (isTag) {
            hits = data.posts.filter((p) => p.tags.includes(rest));
            head = listHead('#' + rest, '', hits.length);
            toggle.textContent = '#' + rest;
        } else if (folder) {
            const f = data.folders.find((x) => x.path === folder);
            hits = data.posts.filter((p) => inFolder(p, folder));
            head = listHead(f.title, f.description, hits.length);
            toggle.textContent = f.title;
        } else {
            hits = data.posts;
            head = listHead('전체글', '모든 글을 최신순으로 보여줘요.', hits.length);
            toggle.textContent = '전체글';
        }

        currentRender = () => {
            view.replaceChildren(head);
            if (hits.length) view.appendChild(postList(hits, data, true));
            else view.appendChild(el('div', 'blog-empty', '아직 글이 없어요.'));
        };
        const box = root.querySelector('#blog-search');
        if (box) box.value = '';
        currentRender();
    }

    // 검색 입력: 입력 중에는 검색 결과를, 비우면 원래 목록을 보여준다
    let currentRender = null;
    function runSearch() {
        const root = document.getElementById('tab-blog');
        const box = root && root.querySelector('#blog-search');
        const view = root && root.querySelector('#blog-list');
        if (!box || !view || !currentRender) return;
        const q = box.value.trim();
        if (!q) {
            currentRender();
            return;
        }
        Promise.all([getBlogData(), getSearchIndex()]).then(([data, index]) => {
            if (box.value.trim() !== q) return; // 그 사이 입력이 바뀜
            const res = searchPosts(data, index, q);
            view.replaceChildren(listHead('검색: ' + q, '', res.posts.length));
            if (res.posts.length) view.appendChild(postList(res.posts, data, true, res.snippets));
            else view.appendChild(el('div', 'blog-empty', '찾는 글이 없어요.'));
        });
    }
    document.addEventListener('input', (e) => {
        if (e.target && e.target.id === 'blog-search') runSearch();
    });

    // 모바일: 폴더 트리를 접었다 펴는 버튼
    document.addEventListener('click', (e) => {
        const t = e.target.closest && e.target.closest('#blog-side-toggle');
        if (t) t.closest('#blog-browse').classList.toggle('tree-open');
    });

    window.blogRoute = blogRoute;
})();
