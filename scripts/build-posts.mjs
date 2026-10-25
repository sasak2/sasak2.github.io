// 1) posts/ 아래 폴더와 *.md 의 front matter를 읽어서 posts.json 을 생성한다.
// 2) styles.css, *.js, sections/*.html 의 해시를 index.html 의 ?v= 에 넣어 브라우저 캐시를 갱신한다.
// 사용법: node scripts/build-posts.mjs
// 의존성 없음 (Node 18+).

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
const posts = [];
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
        const meta = parseFrontMatter(readFileSync(join(dir, entry.name), 'utf8'));
        if (!meta) {
            console.warn(`건너뜀: ${rel} (front matter 없음)`);
            continue;
        }
        if (meta.draft === 'true') continue;
        if (!meta.title || !/^\d{4}-\d{2}-\d{2}$/.test(meta.date || '')) {
            console.warn(`건너뜀: ${rel} (title 또는 date(YYYY-MM-DD) 누락)`);
            continue;
        }
        posts.push({
            slug,
            folder: relPath,
            title: meta.title,
            date: meta.date,
            tags: Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [],
            summary: meta.summary || '',
        });
    }
}
walk(postsDir, '');

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
console.log(`posts.json 생성: 글 ${posts.length}개, 폴더 ${folders.length}개`);

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
