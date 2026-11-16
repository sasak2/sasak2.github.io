// 로컬 미리보기 서버. GitHub Pages 와 같은 규칙으로 파일을 보여준다.
//   - 폴더 주소는 그 안의 index.html
//   - 끝에 / 가 빠진 폴더 주소는 / 를 붙인 주소로 넘김
//   - 파일이 없는 주소는 404.html (상태 코드 404)
// python3 -m http.server 는 404.html 을 쓰지 않아서, 폴더/태그 주소(/blog/folder/...)를 직접 열거나 새로고침하면 안 열린다.
// 사용법: node scripts/serve.mjs [포트]   (기본 8000)

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2]) || 8000;

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
};

function send(res, status, file) {
    res.writeHead(status, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(readFileSync(file));
}

createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname;
    try {
        pathname = decodeURIComponent(url.pathname);
    } catch (e) {
        pathname = url.pathname;
    }
    const file = normalize(join(root, pathname));
    const inside = file === root || file.startsWith(root + sep);
    const hidden = pathname.split('/').some((s) => s.startsWith('.') && s.length > 1) || pathname.startsWith('/node_modules/');

    if (inside && !hidden && existsSync(file)) {
        if (statSync(file).isDirectory()) {
            if (!url.pathname.endsWith('/')) {
                res.writeHead(301, { Location: url.pathname + '/' + url.search });
                res.end();
                return;
            }
            if (existsSync(join(file, 'index.html'))) {
                send(res, 200, join(file, 'index.html'));
                return;
            }
        } else {
            send(res, 200, file);
            return;
        }
    }
    const notFound = join(root, '404.html');
    if (existsSync(notFound)) send(res, 404, notFound);
    else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404');
    }
}).listen(port, () => {
    console.log(`http://localhost:${port} 에서 미리보기 중이에요. (끝내려면 Ctrl+C)`);
});
