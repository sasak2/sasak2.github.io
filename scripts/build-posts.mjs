// 1) posts/*.md 의 front matter를 읽어서 posts.json 을 생성한다.
// 2) styles.css, *.js, sections/*.html 의 해시를 index.html 의 ?v= 에 넣어 브라우저 캐시를 갱신한다.
// 사용법: node scripts/build-posts.mjs
// 의존성 없음 (Node 18+).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, basename } from 'node:path';
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

const posts = [];
for (const file of readdirSync(postsDir)) {
    if (!file.endsWith('.md')) continue;
    const slug = basename(file, '.md');
    const meta = parseFrontMatter(readFileSync(join(postsDir, file), 'utf8'));
    if (!meta) {
        console.warn(`건너뜀: ${file} (front matter 없음)`);
        continue;
    }
    if (meta.draft === 'true') continue;
    if (!meta.title || !/^\d{4}-\d{2}-\d{2}$/.test(meta.date || '')) {
        console.warn(`건너뜀: ${file} (title 또는 date(YYYY-MM-DD) 누락)`);
        continue;
    }
    posts.push({
        slug,
        title: meta.title,
        date: meta.date,
        tags: Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [],
        summary: meta.summary || '',
    });
}

posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));

writeFileSync(join(root, 'posts.json'), JSON.stringify(posts, null, 2) + '\n');
console.log(`posts.json 생성: ${posts.length}개`);

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
