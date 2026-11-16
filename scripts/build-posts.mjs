// 1) posts/ 아래 폴더와 *.md 의 front matter를 읽어서 posts.json 을 생성한다.
// 2) styles.css, *.js, sections/*.html 의 해시를 index.html 의 ?v= 에 넣어 브라우저 캐시를 갱신한다.
// 3) 주소마다 실제 페이지를 만든다: blog/post/<글>/ (글), blog/ history/ work/ links/ (각 페이지), 404.html, p/<글>/ (예전 주소 안내), sitemap.xml
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

// 검색용 본문 텍스트 (마크다운 기호를 대충 걷어낸 것)
// 한 줄짜리 유튜브 주소(플레이어가 되는 줄)는 본문 글자가 아니므로 뺀다. 검색 인덱스에는 마크업이 들어가지 않는다.
function plainText(md) {
    return mapYoutubeLines(md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''), () => ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[`*_>#|~]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 20000);
}

const posts = [];
const unlistedPosts = []; // 링크로만 열리는 글 (목록, 검색, sitemap 에는 없음)
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
        rawBySlug[slug] = raw;
        const item = {
            slug,
            folder: relPath,
            title: meta.title,
            date: meta.date,
            ...(upd && upd > meta.date ? { updated: upd } : {}),
            tags: Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [],
            summary: meta.summary || '',
        };
        // unlisted: true 인 글은 링크로만 열린다. 목록, 폴더 글 수, 태그, 이전/다음 글, 검색, sitemap 에는 빠지고
        // 글 페이지(blog/post/...)만 noindex 로 만들어진다. (posts.json, search.json 에도 들어가지 않는다)
        if (meta.unlisted === 'true') {
            unlistedPosts.push({ ...item, tags: [], unlisted: true });
            continue;
        }
        searchIndex[slug] = plainText(raw);
        posts.push(item);
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

// ---- 글 페이지 (blog/post/<slug>/index.html) 와 sitemap.xml ----
// 이 사이트는 한 페이지 안에서 화면만 바꾸는 방식이지만, 글 주소(/blog/post/<글>/)마다 실제 파일이 있어야
// 검색엔진이 글을 색인하고, 링크를 공유했을 때 글 제목과 요약이 미리보기로 뜬다. (GitHub Pages 는 파일이 있는 주소만 정상 응답한다)
// 그래서 글마다 블로그 화면과 같은 모양으로 본문(마크다운, 수식, 코드)까지 완성된 페이지를 만든다.
// 사용법: npm ci 후 node scripts/build-posts.mjs  (패키지가 없으면 제목, 설명, 본문 텍스트만 담은 간단한 페이지가 만들어진다)
const siteUrl = 'https://sasak2.github.io/';
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const encPath = (path) => path.split('/').map(encodeURIComponent).join('/');

// 사이트 안의 주소 (blog.js 의 blogHref 와 같은 형식)
const blogHref = {
    home: '/blog/',
    folder: (path) => `/blog/folder/${encPath(path)}/`,
    tag: (tag) => `/blog/tag/${encodeURIComponent(tag)}/`,
    post: (slug, id) => `/blog/post/${encPath(slug)}/` + (id ? '#' + encodeURIComponent(id) : ''),
};

// 예전 해시 주소를 새 경로 주소로 바꾼다. 예: #blog/post/a/b?h=sec-x -> /blog/post/a/b/#sec-x  (script.js 에 같은 함수가 있다)
const TABS = ['main', 'links', 'history', 'work', 'blog'];
function legacyHashToPath(hash) {
    const raw = String(hash || '').replace(/^#/, '');
    const qAt = raw.indexOf('?');
    const segs = (qAt >= 0 ? raw.slice(0, qAt) : raw).split('/').filter(Boolean);
    if (!segs.length || segs[0] === 'main' || !TABS.includes(segs[0])) return null;
    const h = qAt >= 0 ? new URLSearchParams(raw.slice(qAt + 1)).get('h') : '';
    return '/' + segs.join('/') + '/' + (h ? '#' + encodeURIComponent(h) : '');
}

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

// 제목의 글자만 뽑는다 (목차와 제목 id 에 쓴다). blog.js 의 headingText 와 같은 규칙:
// 수식(<span class="katex">...</span>)은 MathML 쪽 글자만 남기고 화면용 마크업과 원문 주석(annotation)은 뺀다.
function headingPlain(inner) {
    const open = '<span class="katex">';
    let out = '';
    let i = 0;
    for (let at = inner.indexOf(open, i); at >= 0; at = inner.indexOf(open, i)) {
        out += inner.slice(i, at);
        // 짝이 맞는 </span> 까지가 수식 하나
        const tag = /<span\b|<\/span>/g;
        tag.lastIndex = at;
        let depth = 0;
        let end = inner.length;
        for (let m = tag.exec(inner); m; m = tag.exec(inner)) {
            depth += m[0] === '</span>' ? -1 : 1;
            if (depth === 0) {
                end = tag.lastIndex;
                break;
            }
        }
        const mathml = /<span class="katex-mathml">([\s\S]*?)<\/math><\/span>/.exec(inner.slice(at, end));
        if (mathml) out += mathml[1].replace(/<annotation[\s\S]*?<\/annotation>/g, '');
        i = end;
    }
    return (out + inner.slice(i)).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// blog.js 의 renderMarkdown / fixHashLinks / enhanceCode / buildToc 와 같은 방식으로 만든다.
// (사람이 열면 blog.js 가 같은 내용을 다시 그려 바꿔 끼우므로, 모양이 달라지지 않게 두 곳을 같이 고친다)
function renderPostHtml(raw, slug) {
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
    // 한 줄에 유튜브 주소만 있는 줄은 변환 전에 자리표시자로 바꿔 두고, 변환 후 플레이어로 되돌린다 (blog.js 와 같은 방식).
    const embeds = [];
    let html = marked.parse(protectYoutube(parts.join(''), embeds));
    html = html.replace(/@@MATH(\d+)@@/g, (m, n) => {
        const item = maths[Number(n)];
        if (!item) return m;
        try {
            return katex.renderToString(item.tex, { displayMode: item.display, throwOnError: false });
        } catch (e) {
            return item.raw.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        }
    });
    html = restoreYoutube(html, embeds);

    // 본문 안의 # 링크를 글 주소 기준으로 바꾼다 (blog.js 의 fixHashLinks 와 같은 규칙)
    html = html.replace(/(<a\b[^>]*?\shref=")(#[^"]+)(")/g, (m, pre, href, post) => {
        const rawHref = decodeEntities(href);
        const fixed = rawHref === '#main' || rawHref.startsWith('#main/') ? '/' + rawHref : legacyHashToPath(rawHref) || blogHref.post(slug) + rawHref;
        return pre + esc(fixed) + post;
    });

    // 코드 블록: 문법 색 + 언어 라벨 + 복사 버튼 (버튼은 blog.js 가 화면을 이어받은 뒤부터 동작한다)
    html = html.replace(/<pre><code(?: class="language-([\w+#.-]+)")?>([\s\S]*?)<\/code><\/pre>/g, (m, lang = '', code) => {
        let inner = code;
        let cls = lang ? `language-${lang}` : '';
        if (lang && hljs.getLanguage(lang)) {
            try {
                inner = hljs.highlight(decodeEntities(code), { language: lang }).value;
                cls += ' hljs';
            } catch (e) { /* 색 강조 없이 */ }
        }
        return `<div class="code-block"><div class="code-bar"><span class="code-lang">${lang}</span><button class="code-copy" type="button">복사</button></div><pre><code${cls ? ` class="${cls}"` : ''}>${inner}</code></pre></div>`;
    });

    // 제목에 id 와 # 링크를 달고, 제목이 3개 이상이면 목차를 만든다
    // <!-- toc:off --> 와 <!-- toc:on --> 사이의 제목은 목차에서 뺀다 (스포일러 가리기용, blog.js 와 같은 규칙)
    const used = new Set();
    const items = [];
    let tocOff = false;
    html = html.replace(/<!--\s*toc:(off|on)\s*-->|<h([23])>([\s\S]*?)<\/h\2>/g, (m, mark, level, inner) => {
        if (mark) {
            tocOff = mark === 'off';
            return m;
        }
        const text = headingPlain(inner);
        const base = decodeEntities(text).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || 'section';
        let id = 'sec-' + base;
        for (let n = 2; used.has(id); n++) id = 'sec-' + base + '-' + n;
        used.add(id);
        if (!tocOff) items.push({ id, text, level: Number(level) });
        return `<h${level} id="${id}">${inner}<a class="h-anchor" href="${blogHref.post(slug, id)}" title="이 제목의 링크 복사">#</a></h${level}>`;
    });
    // 목차는 blog.js 와 같이 넓은 화면에서만 펼친다 (바로 뒤의 짧은 스크립트가 페이지가 그려지기 전에 펼쳐 둔다)
    const toc =
        items.length >= 3
            ? `<details class="toc"><summary class="toc-title">목차</summary><ul class="toc-list">` +
              items.map((it) => `<li class="toc-l${it.level}"><a class="toc-link" href="${blogHref.post(slug, it.id)}" data-id="${it.id}">${it.text}</a></li>`).join('') +
              `</ul></details><script>if (window.matchMedia('(min-width: 961px)').matches) document.currentScript.previousElementSibling.open = true;</script>`
            : '';

    // 글 안의 사진 경로(posts/img/...)는 사이트 루트 기준으로 적어 둔다
    html = html.replace(/(src|href)="posts\//g, '$1="/posts/');
    return { html, toc };
}


const day = (post) => (post.updated && post.updated > post.date ? post.updated : post.date);
const lastmodAll = posts.reduce((acc, post) => (day(post) > acc ? day(post) : acc), '');

// 메인 말고 따로 주소가 있는 페이지들. 제목은 script.js 의 TAB_TITLES 와 맞춘다.
const tabPages = [
    { tab: 'blog', title: '블로그 | sasak2', desc: 'sasak2(김현민)의 블로그 글 목록입니다.' },
    { tab: 'history', title: '이력 | sasak2', desc: 'sasak2(김현민)의 이력입니다.' },
    { tab: 'work', title: '작업 | sasak2', desc: 'sasak2(김현민)의 작업 모음입니다.' },
    { tab: 'links', title: '링크 | sasak2', desc: 'sasak2(김현민)의 링크 모음입니다.' },
];

const urlEntry = (loc, lastmod) => `  <url>\n    <loc>${loc}</loc>\n${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ''}  </url>\n`;
writeFileSync(
    join(root, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        urlEntry(siteUrl, lastmodAll) +
        tabPages.map((t) => urlEntry(`${siteUrl}${t.tab}/`, t.tab === 'blog' ? lastmodAll : '')).join('') +
        posts.map((post) => urlEntry(siteUrl.slice(0, -1) + blogHref.post(post.slug), day(post))).join('') +
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

// ---- 주소별 페이지 ----
// 사이트 첫 화면(index.html)과 같은 틀 안에, 그 주소의 내용을 미리 넣은 페이지를 만든다.
//   blog/post/<폴더>/<글>/index.html  글 (본문까지 완성)
//   blog/  history/  work/  links/    각 페이지 (sections/*.html 내용을 넣음)
//   404.html                          파일이 없는 주소(폴더, 태그 목록 등)를 받아서 같은 화면을 그리는 틀
//   p/<폴더>/<글>/index.html          예전 글 주소. 새 주소로 넘겨 주는 작은 페이지
// 검색엔진과 링크 미리보기는 이 완성된 페이지의 제목, 요약을 읽고, 사람이 열면 script.js, blog.js 가 그대로 이어받아서
// 사이트 안에서 눌러 들어온 것과 똑같은 화면이 된다.
const folderTitle = new Map(folders.map((f) => [f.path, f.title]));
const dateLabel = (post) => {
    let t = post.date.replace(/-/g, '.');
    if (post.updated && post.updated > post.date) t += '  ·  최종 수정 ' + post.updated.replace(/-/g, '.');
    return t;
};

function replaceOnce(text, from, to, what) {
    if (!text.includes(from)) throw new Error(`index.html 또는 sections/blog.html 에서 ${what} 부분을 찾지 못했어요. 페이지 틀 생성 코드를 확인하세요.`);
    return text.replace(from, () => to);
}

const shellHtml = readFileSync(join(root, 'index.html'), 'utf8');
if (!shellHtml.includes('<base href="/">')) throw new Error('index.html 에 <base href="/"> 가 없어요. 주소가 깊은 페이지에서 styles.css 같은 상대 경로가 깨져요.');

// index.html 틀에 제목, 설명, head 추가 태그를 넣고, tab 을 주면 그 탭을 활성화한 채 sectionHtml 을 채운다.
function makePage({ title, desc, head, tab, sectionHtml }) {
    let page = shellHtml;
    page = replaceOnce(page, /<title>[\s\S]*?<\/title>/.exec(page)[0], `<title>${esc(title)}</title>`, 'title');
    if (desc) page = replaceOnce(page, /<meta name="description"[^>]*>/.exec(page)[0], `<meta name="description" content="${esc(desc)}">`, 'meta description');
    page = replaceOnce(page, '</head>', head.map((line) => `    ${line}\n`).join('') + '</head>', '</head>');
    if (tab) {
        page = replaceOnce(page, `<a class="side-link" href="/${tab}/" data-tab="${tab}">`, `<a class="side-link active" href="/${tab}/" data-tab="${tab}">`, `사이드바 ${tab} 링크`);
        page = replaceOnce(page, `<div id="tab-${tab}" class="section"></div>`, `<div id="tab-${tab}" class="section active">${sectionHtml}</div>`, `#tab-${tab}`);
    }
    return page;
}

function writePage(relDir, page) {
    mkdirSync(join(root, relDir), { recursive: true });
    writeFileSync(join(root, relDir, 'index.html'), page);
}

// 삭제된 글, 폴더의 페이지가 남지 않게 만들어지는 폴더는 매번 비우고 새로 만든다.
// (여기 적힌 폴더는 전부 이 스크립트가 만드는 것이라 직접 고친 내용은 다음 빌드 때 사라진다)
for (const dir of ['blog', 'p', ...tabPages.map((t) => t.tab)]) rmSync(join(root, dir), { recursive: true, force: true });

// 각 페이지: blog/ history/ work/ links/
for (const t of tabPages) {
    const url = `${siteUrl}${t.tab}/`;
    writePage(
        t.tab,
        makePage({
            title: t.title,
            desc: t.desc,
            head: [
                `<link rel="canonical" href="${url}">`,
                `<meta property="og:type" content="website">`,
                `<meta property="og:site_name" content="sasak2">`,
                `<meta property="og:title" content="${esc(t.title)}">`,
                `<meta property="og:description" content="${esc(t.desc)}">`,
                `<meta property="og:url" content="${url}">`,
                `<meta name="twitter:card" content="summary">`,
            ],
            tab: t.tab,
            sectionHtml: readFileSync(join(root, 'sections', `${t.tab}.html`), 'utf8'),
        })
    );
}

// 404.html: GitHub Pages 가 파일이 없는 주소에 대신 보여 주는 페이지.
// 폴더(/blog/folder/...), 태그(/blog/tag/...)처럼 파일을 만들지 않는 주소도 이 틀이 열리고 script.js 가 주소를 읽어 화면을 그린다.
writeFileSync(join(root, '404.html'), makePage({ title: 'sasak2 포트폴리오 | 김현민', head: [`<meta name="robots" content="noindex">`] }));

// 글 페이지와 예전 주소(p/) 안내 페이지
const blogSectionHtml = readFileSync(join(root, 'sections', 'blog.html'), 'utf8');
for (const post of [...posts, ...unlistedPosts]) {
    const path = blogHref.post(post.slug);
    const url = siteUrl.slice(0, -1) + path;
    const desc = post.summary || plainText(rawBySlug[post.slug]).slice(0, 120);
    const { html: bodyHtml, toc } = renderers
        ? renderPostHtml(rawBySlug[post.slug], post.slug)
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
            ? `<a class="post-nav-item ${cls}" href="${blogHref.post(p.slug)}"><span class="post-nav-label">${label}</span><span class="post-nav-title">${esc(p.title)}</span></a>`
            : '<span class="post-nav-empty"></span>';
    const postNav = !post.unlisted && (prev || next) ? `<nav class="post-nav">${navItem(prev, '← 이전 글', 'prev')}${navItem(next, '다음 글 →', 'next')}</nav>` : '';

    // 링크 전용(unlisted) 글은 폴더 이름을 드러내지 않고 "블로그" 만 보여준다 (blog.js 도 같음)
    const folderParts = post.folder && !post.unlisted ? post.folder.split('/') : [];
    const crumb =
        `<a class="crumb-link" href="${blogHref.home}">블로그</a>` +
        folderParts
            .map((_, i) => {
                const sub = folderParts.slice(0, i + 1).join('/');
                return `<span class="crumb-sep">&gt;</span><a class="crumb-link" href="${blogHref.folder(sub)}">${esc(folderTitle.get(sub) || folderParts[i])}</a>`;
            })
            .join('');

    // blog.js 의 renderPost 가 만드는 글 화면과 같은 구조.
    // data-prerendered 는 blog.js 가 이 글을 처음 그릴 때 화면을 비우지 않고 한 번에 바꿔 끼우라는 표시다.
    const postArticle =
        `<article id="blog-post" class="post" data-prerendered="${esc(post.slug)}">` +
        `<nav class="blog-crumb post-crumb">${crumb}</nav>` +
        `<div class="blog-date">${dateLabel(post)}</div>` +
        `<h3 class="post-title">${esc(post.title)}</h3>` +
        (post.tags.length ? `<div class="tag-row tag-row-sm">${post.tags.map((t) => `<a class="tag tag-link" href="${blogHref.tag(t)}">${esc(t)}</a>`).join('')}</div>` : '') +
        `<div class="post-share-row"><button class="post-share" type="button">공유 링크 복사</button></div>` +
        toc +
        `<div class="post-body">\n${bodyHtml}\n</div>` +
        postNav +
        `</article>`;

    let blogSection = replaceOnce(blogSectionHtml, '<article id="blog-post" class="post" hidden></article>', postArticle, '글 영역(#blog-post)');
    blogSection = replaceOnce(blogSection, '<div id="blog-browse" class="blog-browse">', '<div id="blog-browse" class="blog-browse" hidden>', '글 목록 영역(#blog-browse)');

    // 링크 전용 글: 검색엔진에 색인되지 않게 noindex 를 넣고, canonical/og:url, 요약은 넣지 않는다.
    // (robots.txt 로 막으면 검색엔진이 noindex 를 읽지 못하므로 robots.txt 는 건드리지 않는다)
    const head = post.unlisted
        ? [`<meta name="robots" content="noindex, nofollow">`, `<meta property="og:type" content="article">`, `<meta property="og:title" content="${esc(post.title)}">`]
        : [
              `<link rel="canonical" href="${url}">`,
              `<meta property="og:type" content="article">`,
              `<meta property="og:site_name" content="sasak2">`,
              `<meta property="og:title" content="${esc(post.title)}">`,
              `<meta property="og:description" content="${esc(desc)}">`,
              `<meta property="og:url" content="${url}">`,
              `<meta property="article:published_time" content="${post.date}">`,
              `<meta name="twitter:card" content="summary">`,
          ];

    writePage(join('blog', 'post', post.slug), makePage({ title: `${post.title} | sasak2`, desc, head, tab: 'blog', sectionHtml: blogSection }));

    // 예전 글 주소(/p/<글>/): 이미 공유된 링크와 검색 결과가 계속 열리게, 같은 제목, 요약을 담고 새 주소로 바로 넘긴다.
    const stubHead = post.unlisted
        ? `<meta name="robots" content="noindex, nofollow">\n    <meta property="og:type" content="article">\n    <meta property="og:title" content="${esc(post.title)}">`
        : `<meta name="description" content="${esc(desc)}">\n    <link rel="canonical" href="${url}">\n    <meta property="og:type" content="article">\n    <meta property="og:site_name" content="sasak2">\n    <meta property="og:title" content="${esc(post.title)}">\n    <meta property="og:description" content="${esc(desc)}">\n    <meta property="og:url" content="${url}">\n    <meta name="twitter:card" content="summary">`;
    writePage(
        join('p', post.slug),
        `<!DOCTYPE html>\n<html lang="ko">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>${esc(post.title)} | sasak2</title>\n    ${stubHead}\n` +
            `    <script>location.replace(${JSON.stringify(path)} + location.hash);</script>\n    <meta http-equiv="refresh" content="0; url=${path}">\n</head>\n<body>\n    <p><a href="${path}">${esc(post.title)}</a> 글은 새 주소로 옮겼어요.</p>\n</body>\n</html>\n`
    );
}
console.log(`글 페이지 생성 (blog/post/): ${posts.length}개${unlistedPosts.length ? ` + 링크 전용 ${unlistedPosts.length}개` : ''} (${renderers ? '전체 렌더링' : '간단한 형태'}), 페이지 ${tabPages.length}개, 404.html`);
