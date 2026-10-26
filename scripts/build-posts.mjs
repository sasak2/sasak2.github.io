// 1) posts/ 아래 폴더와 *.md 의 front matter를 읽어서 posts.json 을 생성한다.
// 2) styles.css, *.js, sections/*.html 의 해시를 index.html 의 ?v= 에 넣어 브라우저 캐시를 갱신한다.
// 사용법: node scripts/build-posts.mjs
// 의존성 없음 (Node 18+).

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
// 이 페이지는 제목, 설명, 본문 텍스트를 담고, 꾸며진 화면(블로그)으로 가는 링크를 둔다.
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

const pagesDir = join(root, 'p');
rmSync(pagesDir, { recursive: true, force: true }); // 삭제된 글의 페이지가 남지 않게 매번 새로 만든다
for (const post of posts) {
    const url = `${siteUrl}p/${encPath(post.slug)}/`;
    const blogUrl = `${siteUrl}#blog/post/${encPath(post.slug)}`;
    const desc = post.summary || plainText(rawBySlug[post.slug]).slice(0, 120);
    const page = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(post.title)} | sasak2</title>
    <meta name="description" content="${esc(desc)}">
    <meta name="author" content="김현민">
    <link rel="canonical" href="${url}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${esc(post.title)}">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:url" content="${url}">
    <meta property="article:published_time" content="${post.date}">
    <meta name="color-scheme" content="dark">
    <style>
        body { margin: 0; background: #0a0a0b; color: #e6e6e6; font: 16px/1.8 'Noto Sans KR', system-ui, sans-serif; }
        main { max-width: 760px; margin: 0 auto; padding: 48px 20px 80px; }
        a { color: #8ab4ff; }
        .meta { opacity: 0.6; font-size: 14px; }
        .go { display: inline-block; margin: 20px 0 28px; padding: 10px 16px; border: 1px solid #8ab4ff; border-radius: 8px; text-decoration: none; }
    </style>
</head>
<body>
    <main>
        <p class="meta"><a href="${siteUrl}">sasak2</a> / 블로그</p>
        <article>
            <h1>${esc(post.title)}</h1>
            <p class="meta">${post.date}${post.tags.length ? ' · ' + post.tags.map(esc).join(', ') : ''}</p>
            <a class="go" href="${blogUrl}">블로그에서 보기 (수식, 이미지, 코드 포함)</a>
${bodyToHtml(rawBySlug[post.slug])}
        </article>
    </main>
</body>
</html>
`;
    mkdirSync(join(pagesDir, post.slug), { recursive: true });
    writeFileSync(join(pagesDir, post.slug, 'index.html'), page);
}
console.log(`p/ 글 페이지 생성: ${posts.length}개`);

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
