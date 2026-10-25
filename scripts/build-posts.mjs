// posts/*.md 의 front matter를 읽어서 posts.json 을 생성한다.
// 사용법: node scripts/build-posts.mjs
// 의존성 없음 (Node 18+).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
