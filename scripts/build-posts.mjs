// 1) posts/ 아래 폴더와 *.md 의 front matter를 읽어서 posts.json 을 생성한다.
// 2) styles.css, *.js, sections/*.html 의 해시를 index.html 의 ?v= 에 넣어 브라우저 캐시를 갱신한다.
// 사용법: node scripts/build-posts.mjs
// Node 18+. 글 페이지를 전체 렌더링하려면 npm ci 로 marked, katex, highlight.js 를 설치한다 (없어도 동작).

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const postsDir = join(root, 'posts');

function parseFrontMatter(text) {
    const m = text.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!m) return null;
    const meta = {};
    for (const line of m[1].split(/\r?\n/)) {
        const kv = line.match(/^([A-Za-z_]+)\s*:\s*(.*)$/);
        if (!kv) continue;
        let value = kv[2].trim();
        if (value.startsWith('[') && value.endsWith(']')) {
            value = value
                .slice(1, -1)
                .split(',')
                .map((s) => s.trim().replace(/^["']|["']$/g, ''))
                .filter(Boolean);
        } else {
            value = value.replace(/^["']|["']$/g, '');
        }
        meta[kv[1]] = value;
    }
    return meta;
}

// posts/ 아래를 폴더째 훑는다.
//   posts/<폴더>/<하위폴더>/<글>.md  ->  slug = "<폴더>/<하위폴더>/<글>"
//   posts/<폴더>/_folder.json        ->  폴더 표시 이름/설명/순서 (없으면 폴더명 그대로)
// 최종 수정일: front matter 의 updated 가 우선, 없으면 git 이력의 마지막 커밋 날짜.
// 얕은 클론(--depth)에서는 git 날짜가 부정확하므로 쓰지 않는다 (GitHub Actions 는 fetch-depth: 0).
function isShallow() {
    try {
        return execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: root, encoding: 'utf8' }).trim() !== 'false';
    } catch (e) {
        return true;
    }
}
const shallow = isShallow();
function gitUpdated(file) {
    if (shallow) return '';
    try {
        return execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: root, encoding: 'utf8' }).trim();
    } catch (e) {
        return '';
    }
}

// 검색용 본문 텍스트 (마크다운 기호를 대충 걷어낸 것)
function plainText(md) {
    return md
        .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[`*_>#|~]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 20000);
}

const posts = [];
const searchIndex = {};
const rawBySlug = {};
const folderMeta = new Map(); // path -> { title, description, order }

function readFolderMeta(dir, relPath) {
    const file = join(dir, '_folder.json');
    if (!existsSync(file)) return;
    try {
        const m = JSON.parse(readFileSync(file, 'utf8'));
        folderMeta.set(relPath, {
            title: typeof m.title === 'string' && m.title ? m.title : null,
            description: typeof m.description === 'string' ? m.description : '',
            order: Number.isFinite(m.order) ? m.order : null,
        });
    } catch (e) {
        console.warn(`무시됨: ${relPath}/_folder.json (JSON 형식 오류: ${e.message})`);
    }
}

function walk(dir, relPath) {
    if (relPath) readFolderMeta(dir, relPath);
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) {
        if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
        const rel = relPath ? `${relPath}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            if (!relPath && entry.name === 'img') continue; // 이미지 폴더
            walk(join(dir, entry.name), rel);
            continue;
        }
        if (!entry.name.endsWith('.md')) continue;
        const slug = rel.slice(0, -3);
        const raw = readFileSync(join(dir, entry.name), 'utf8');
        const meta = parseFrontMatter(raw);
        if (!meta) {
            console.warn(`건너뜀: ${rel} (front matter 없음)`);
            continue;
        }
        if (meta.draft === 'true') continue;
        if (!meta.title || !/^\d{4}-\d{2}-\d{2}$/.test(meta.date || '')) {
            console.warn(`건너뜀: ${rel} (title 또는 date(YYYY-MM-DD) 누락)`);
            continue;
        }
        const upd = /^\d{4}-\d{2}-\d{2}$/.test(meta.updated || '') ? meta.updated : gitUpdated(join('posts', rel));
        searchIndex[slug] = plainText(raw);
        rawBySlug[slug] = raw;
        posts.push({
            slug,
            folder: relPath,
            title: meta.title,
            date: meta.date,
            ...(upd && upd > meta.date ? { updated: upd } : {}),
            tags: Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [],
            summary: meta.summary || '',
        });
    }
}
walk(postsDir, '');
// posts/_test/ 는 기능 확인용 샘플 글이라 평소에는 건너뛴다 (목록, 글 수, 검색에 안 나옴).
// 로컬에서 보고 싶을 때만: node scripts/build-posts.mjs --with-test  (결과 posts.json 은 커밋하지 말 것)
if (process.argv.includes('--with-test')) {
    walk(join(postsDir, '_test'), '');
    console.log('주의: _test 글을 포함해서 빌드했어요. posts.json, search.json 을 커밋하지 마세요.');
}

posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));

// 글이 하나라도 들어 있는 폴더(상위 폴더 포함)만 내보낸다.
const used = new Set();
for (const p of posts) {
    const parts = p.folder ? p.folder.split('/') : [];
    for (let i = 1; i <= parts.length; i++) used.add(parts.slice(0, i).join('/'));
}
const folders = [...used].sort().map((path) => {
    const m = folderMeta.get(path) || {};
    return {
        path,
        title: m.title || path.split('/').pop(),
        description: m.description || '',
        order: m.order ?? 999,
    };
});
for (const path of folderMeta.keys()) {
    if (!used.has(path)) console.log(`참고: ${path} 폴더는 공개된 글이 없어 목록에서 빠져요.`);
}

writeFileSync(join(root, 'posts.json'), JSON.stringify({ folders, posts }, null, 2) + '\n');
writeFileSync(join(root, 'search.json'), JSON.stringify(searchIndex) + '\n');
console.log(`posts.json 생성: 글 ${posts.length}개, 폴더 ${folders.length}개`);

// ---- 글별 검색용 페이지 (p/<slug>/index.html) 와 sitemap.xml ----
// 이 사이트는 #해시 주소로 글을 보여주는데, 구글은 # 뒤의 주소를 별도 페이지로 보지 않는다.
// 그래서 글마다 실제 주소를 가진 가벼운 정적 페이지를 만들어 색인되게 한다.
// 이 페이지는 블로그 화면과 같은 모양으로 본문(마크다운, 수식, 코드)까지 완성된 채로 만들어진다.
// 사용법: npm ci 후 node scripts/build-posts.mjs  (패키지가 없으면 제목, 설명, 본문 텍스트만 담은 간단한 페이지가 만들어진다)
const siteUrl = 'https://sasak2.github.io/';
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const encPath = (path) => path.split('/').map(encodeURIComponent).join('/');

// 마크다운을 검색엔진이 읽기 좋은 간단한 HTML (제목 + 문단) 로 바꾼다. 코드, 수식, 이미지, 표는 뺀다.
function bodyToHtml(raw) {
    const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').replace(/```[\s\S]*?```/g, '').replace(/\$\$[\s\S]*?\$\$/g, '');
    const out = [];
    for (const block of body.split(/\r?\n\s*\r?\n/)) {
        const text = block.trim();
        if (!text || text.startsWith('|')) continue;
        const h = text.match(/^(#{1,6})\s+(.+)$/m);
        if (h && text.split(/\r?\n/).length === 1) {
            const level = Math.min(Math.max(h[1].length + 1, 2), 4);
            out.push(`<h${level}>${esc(h[2].replace(/[`*_]/g, ''))}</h${level}>`);
            continue;
        }
        const plain = text
            .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/<[^>]+>/g, '')
            .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
            .replace(/^>\s?/gm, '')
            .replace(/[`*_~]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (plain) out.push(`<p>${esc(plain)}</p>`);
    }
    return out.join('\n');
}

// ---- 글 본문을 빌드 때 완성된 HTML 로 렌더링 (marked + KaTeX + highlight.js) ----
// 패키지가 설치돼 있지 않으면(npm ci 를 안 한 로컬 실행 등) 아래 간단한 요약 형태로 대신 만든다.
let renderers = null;
try {
    const { marked } = await import('marked');
    const katex = (await import('katex')).default;
    const hljs = (await import('highlight.js')).default;
    renderers = { marked, katex, hljs };
} catch (e) {
    console.log('참고: marked/katex/highlight.js 가 없어 글 페이지를 간단한 형태로 만들어요. 전체 렌더링은 npm ci 후 다시 실행하세요.');
}

const decodeEntities = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// blog.js 의 renderMarkdown / enhanceCode / buildToc 와 같은 방식으로 만든다.
function renderPostHtml(raw) {
    const { marked, katex, hljs } = renderers;
    const md = raw.replace(/^﻿/, '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');

    // 수식을 먼저 빼 두었다가 변환 후 KaTeX 로 되돌린다 (마크다운 변환기가 수식 기호를 망가뜨리지 않게)
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
    let html = marked.parse(parts.join(''));
    html = html.replace(/@@MATH(\d+)@@/g, (m, n) => {
        const item = maths[Number(n)];
        if (!item) return m;
        try {
            return katex.renderToString(item.tex, { displayMode: item.display, throwOnError: false });
        } catch (e) {
            return item.raw.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        }
    });

    // 코드 블록: 문법 색 + 언어 라벨 (복사 버튼은 스크립트가 없으므로 뺀다)
    html = html.replace(/<pre><code(?: class="language-([\w+#.-]+)")?>([\s\S]*?)<\/code><\/pre>/g, (m, lang = '', code) => {
        let inner = code;
        let cls = lang ? `language-${lang}` : '';
        if (lang && hljs.getLanguage(lang)) {
            try {
                inner = hljs.highlight(decodeEntities(code), { language: lang }).value;
                cls += ' hljs';
            } catch (e) { /* 색 강조 없이 */ }
        }
        return `<div class="code-block"><div class="code-bar"><span class="code-lang">${lang}</span></div><pre><code${cls ? ` class="${cls}"` : ''}>${inner}</code></pre></div>`;
    });

    // 제목에 id 와 # 링크를 달고, 제목이 3개 이상이면 목차를 만든다
    const used = new Set();
    const items = [];
    html = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (m, level, inner) => {
        const text = inner.replace(/<span class="katex-mathml">[\s\S]*?<\/math><\/span>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const base = decodeEntities(text).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || 'section';
        let id = 'sec-' + base;
        for (let n = 2; used.has(id); n++) id = 'sec-' + base + '-' + n;
        used.add(id);
        items.push({ id, text, level: Number(level) });
        return `<h${level} id="${id}">${inner}<a class="h-anchor" href="#${encodeURIComponent(id)}" title="이 제목의 링크">#</a></h${level}>`;
    });
    const toc =
        items.length >= 3
            ? `<details class="toc" open><summary class="toc-title">목차</summary><ul class="toc-list">` +
              items.map((it) => `<li class="toc-l${it.level}"><a class="toc-link" href="#${encodeURIComponent(it.id)}">${it.text}</a></li>`).join('') +
              `</ul></details>`
            : '';

    // 글 안의 사진 경로(posts/img/...)는 사이트 루트 기준으로 바꾼다 (글 페이지가 p/폴더/글/ 아래에 있으므로)
    html = html.replace(/(src|href)="posts\//g, '$1="/posts/');
    return { html, toc };
}


const day = (post) => (post.updated && post.updated > post.date ? post.updated : post.date);
const lastmodAll = posts.reduce((acc, post) => (day(post) > acc ? day(post) : acc), '');
const urlEntry = (loc, lastmod) => `  <url>\n    <loc>${loc}</loc>\n${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ''}  </url>\n`;
writeFileSync(
    join(root, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        urlEntry(siteUrl, lastmodAll) +
        posts.map((post) => urlEntry(`${siteUrl}p/${encPath(post.slug)}/`, day(post))).join('') +
        `</urlset>\n`
);

// ---- 캐시 무효화: 정적 파일이 바뀌면 index.html 의 ?v= 값도 바뀐다 ----
const assetFiles = ['styles.css', 'script.js', 'showcase.js', 'blog.js'];
const sectionFiles = readdirSync(join(root, 'sections'))
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((f) => join('sections', f));
const hash = createHash('sha1');
for (const f of [...assetFiles, ...sectionFiles]) hash.update(f).update(readFileSync(join(root, f)));
const version = hash.digest('hex').slice(0, 8);

const indexPath = join(root, 'index.html');
let html = readFileSync(indexPath, 'utf8');
const stamped = html.replace(/(styles\.css|script\.js|showcase\.js|blog\.js)(\?v=[0-9a-f]+)?(?=")/g, `$1?v=${version}`);
if (stamped !== html) {
    writeFileSync(indexPath, stamped);
    console.log(`index.html 에셋 버전: ${version}`);
}

// ---- 글별 주소(p/<폴더>/<글>/) 페이지 ----
// 사이트 첫 화면(index.html)과 같은 틀 안에 글을 미리 렌더링해 넣는다.
// 검색엔진은 이 완성된 글을 읽고, 사람이 열면 스크립트가 주소를 #blog/post/... 로 바꾸고 블로그가 그대로 이어받아서
// 메인 페이지에서 글을 눌러 들어온 것과 똑같은 화면이 된다 (이동, 버튼 없음).
const folderTitle = new Map(folders.map((f) => [f.path, f.title]));
const dateLabel = (post) => {
    let t = post.date.replace(/-/g, '.');
    if (post.updated && post.updated > post.date) t += '  ·  최종 수정 ' + post.updated.replace(/-/g, '.');
    return t;
};

function replaceOnce(text, from, to, what) {
    if (!text.includes(from)) throw new Error(`index.html 또는 sections/blog.html 에서 ${what} 부분을 찾지 못했어요. 글 페이지 틀 생성 코드를 확인하세요.`);
    return text.replace(from, () => to);
}

const shellHtml = readFileSync(join(root, 'index.html'), 'utf8');
const blogSectionHtml = readFileSync(join(root, 'sections', 'blog.html'), 'utf8');
const pagesDir = join(root, 'p');
rmSync(pagesDir, { recursive: true, force: true }); // 삭제된 글의 페이지가 남지 않게 매번 새로 만든다
for (const post of posts) {
    const url = `${siteUrl}p/${encPath(post.slug)}/`;
    const hashUrl = `/#blog/post/${encPath(post.slug)}`;
    const desc = post.summary || plainText(rawBySlug[post.slug]).slice(0, 120);
    const { html: bodyHtml, toc } = renderers
        ? renderPostHtml(rawBySlug[post.slug])
        : { html: bodyToHtml(rawBySlug[post.slug]), toc: '' };

    // 같은 폴더 안의 이전(더 오래된) / 다음(더 최근) 글
    const sibs = posts
        .filter((p) => p.folder === post.folder)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.slug.localeCompare(b.slug)));
    const idx = sibs.findIndex((p) => p.slug === post.slug);
    const prev = idx > 0 ? sibs[idx - 1] : null;
    const next = idx >= 0 && idx < sibs.length - 1 ? sibs[idx + 1] : null;
    const navItem = (p, label, cls) =>
        p
            ? `<a class="post-nav-item ${cls}" href="#blog/post/${encPath(p.slug)}"><span class="post-nav-label">${label}</span><span class="post-nav-title">${esc(p.title)}</span></a>`
            : '<span class="post-nav-empty"></span>';
    const postNav = prev || next ? `<nav class="post-nav">${navItem(prev, '← 이전 글', 'prev')}${navItem(next, '다음 글 →', 'next')}</nav>` : '';

    const folderParts = post.folder ? post.folder.split('/') : [];
    const crumb =
        `<a href="#blog">블로그</a>` +
        folderParts
            .map((_, i) => {
                const path = folderParts.slice(0, i + 1).join('/');
                return ` / <a href="#blog/folder/${encPath(path)}">${esc(folderTitle.get(path) || folderParts[i])}</a>`;
            })
            .join('');

    // blog.js 가 만드는 글 화면과 같은 구조
    const postArticle =
        `<article id="blog-post" class="post">` +
        `<nav class="blog-crumb post-crumb">${crumb}</nav>` +
        `<div class="blog-date">${dateLabel(post)}</div>` +
        `<h3 class="post-title">${esc(post.title)}</h3>` +
        (post.tags.length ? `<div class="tag-row tag-row-sm">${post.tags.map((t) => `<a class="tag tag-link" href="#blog/tag/${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>` : '') +
        toc.replace(/href="#(sec-[^"]+)"/g, (m, id) => `href="#blog/post/${encPath(post.slug)}?h=${id}"`) +
        `<div class="post-body">\n${bodyHtml}\n</div>` +
        postNav +
        `</article>`;

    let blogSection = replaceOnce(blogSectionHtml, '<article id="blog-post" class="post" hidden></article>', postArticle, '글 영역(#blog-post)');
    blogSection = replaceOnce(blogSection, '<div id="blog-browse" class="blog-browse">', '<div id="blog-browse" class="blog-browse" hidden style="display:none">', '글 목록 영역(#blog-browse)');

    let page = shellHtml;
    page = replaceOnce(page, '<meta charset="UTF-8">', '<meta charset="UTF-8">\n    <base href="/">', 'meta charset');
    page = replaceOnce(page, /<title>[\s\S]*?<\/title>/.exec(page)[0], `<title>${esc(post.title)} | sasak2</title>`, 'title');
    page = replaceOnce(page, /<meta name="description"[^>]*>/.exec(page)[0], `<meta name="description" content="${esc(desc)}">`, 'meta description');
    page = replaceOnce(
        page,
        '</head>',
        `    <link rel="canonical" href="${url}">\n    <meta property="og:type" content="article">\n    <meta property="og:title" content="${esc(post.title)}">\n    <meta property="og:description" content="${esc(desc)}">\n    <meta property="og:url" content="${url}">\n    <meta property="article:published_time" content="${post.date}">\n</head>`,
        '</head>'
    );
    page = replaceOnce(page, '<body>', `<body>\n    <script>history.replaceState(null, '', '${hashUrl}');</script>`, '<body>');
    page = replaceOnce(page, '<a class="side-link" href="#blog" data-tab="blog">', '<a class="side-link active" href="#blog" data-tab="blog">', '사이드바 블로그 링크');
    page = replaceOnce(page, '<div id="tab-blog" class="section"></div>', `<div id="tab-blog" class="section active">${blogSection}</div>`, '#tab-blog');

    mkdirSync(join(pagesDir, post.slug), { recursive: true });
    writeFileSync(join(pagesDir, post.slug, 'index.html'), page);
}
console.log(`p/ 글 페이지 생성: ${posts.length}개 (${renderers ? '전체 렌더링' : '간단한 형태'})`);
