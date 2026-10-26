// 메인 페이지 스크롤 쇼케이스.
// 각 섹션이 화면에 들어오면 애니메이션을 시작하고, 벗어나면 멈춘다.
// prefers-reduced-motion 이면 정지 화면 한 장만 그린다.

(function () {
    'use strict';

    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 구형 사파리(16 미만)에는 roundRect 가 없다.
    if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
            r = Math.min(Array.isArray(r) ? r[0] : r || 0, w / 2, h / 2);
            this.moveTo(x + r, y);
            this.arcTo(x + w, y, x + w, y + h, r);
            this.arcTo(x + w, y + h, x, y + h, r);
            this.arcTo(x, y + h, x, y, r);
            this.arcTo(x, y, x + w, y, r);
            this.closePath();
        };
    }

    /* ---------- 공용 도구 ---------- */

    function mkCanvas(stage) {
        const canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        stage.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        const s = { ctx, W: 0, H: 0 };
        s.resize = function () {
            const W = stage.clientWidth;
            const H = stage.clientHeight;
            if (!W || !H) return false;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
            canvas.style.width = W + 'px';
            canvas.style.height = H + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            s.W = W;
            s.H = H;
            return true;
        };
        s.clear = function () {
            ctx.clearRect(0, 0, s.W, s.H);
        };
        s.resize();
        return s;
    }

    function withAlpha(ctx, a, fn) {
        const prev = ctx.globalAlpha;
        ctx.globalAlpha = prev * a;
        fn();
        ctx.globalAlpha = prev;
    }

    function rng(seed) {
        let s = seed >>> 0;
        return function () {
            s = (s + 0x6d2b79f5) >>> 0;
            let t = s;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* ---------- 소개: 물음표를 단 실루엣이 올라온다 ---------- */

    function animIntro(stage, C, accent) {
        const cv = mkCanvas(stage);
        const CYCLE = 9;
        let t = 0;

        function ease(x) {
            x = Math.max(0, Math.min(1, x));
            return 1 - Math.pow(1 - x, 3);
        }
        function pop(x) {
            // 0 -> 1 로 튀어나오며 살짝 넘쳤다가 안정
            x = Math.max(0, Math.min(1, x));
            return 1 + Math.sin(x * Math.PI * 2.2) * Math.exp(-x * 4) * 0.35 - Math.exp(-x * 9) * 1;
        }

        return {
            preview: 40,
            resize: cv.resize,
            update(dt) {
                t = (t + dt) % CYCLE;
            },
            render() {
                if (!cv.W) return;
                const ctx = cv.ctx;
                cv.clear();
                const W = cv.W, H = cv.H;
                const cx = W / 2;
                const r = H * 0.14;

                // 올라오기(0~1.5s) / 머무르기 / 가라앉기(7.6~8.6s)
                const rise = ease(t / 1.5);
                const sink = ease((t - 7.6) / 1.0);
                const off = (1 - rise) * H * 0.55 + sink * H * 0.55;
                const headY = H * 0.5 + off;
                const shoulderY = headY + r * 1.55;
                const sw = Math.min(W * 0.3, H * 0.5);

                // 뒤쪽 빛
                const glow = ctx.createRadialGradient(cx, H * 0.55, 0, cx, H * 0.55, H * 0.75);
                glow.addColorStop(0, accent);
                glow.addColorStop(1, 'rgba(0,0,0,0)');
                withAlpha(ctx, 0.16 * rise * (1 - sink), () => {
                    ctx.fillStyle = glow;
                    ctx.fillRect(0, 0, W, H);
                });

                // 실루엣
                const body = ctx.createLinearGradient(0, headY - r, 0, H);
                body.addColorStop(0, '#34343b');
                body.addColorStop(1, '#17171a');
                ctx.fillStyle = body;
                ctx.beginPath();
                ctx.roundRect(cx - sw, shoulderY, sw * 2, H * 1.2, [sw * 0.6, sw * 0.6, 0, 0]);
                ctx.fill();
                ctx.fillRect(cx - r * 0.4, headY + r * 0.6, r * 0.8, r * 1.2);
                ctx.beginPath();
                ctx.arc(cx, headY, r, 0, Math.PI * 2);
                ctx.fill();

                // 윗선 하이라이트
                ctx.strokeStyle = accent;
                ctx.lineWidth = 1.5;
                withAlpha(ctx, 0.5, () => {
                    ctx.beginPath();
                    ctx.arc(cx, headY, r, Math.PI * 1.1, Math.PI * 1.9);
                    ctx.stroke();
                });

                // 물음표 -> 느낌표
                const q0 = 1.3, q1 = 4.6, q2 = 5.0;
                let glyph = null, k = 0;
                if (t >= q0 && t < q1) {
                    glyph = '?';
                    k = pop((t - q0) / 0.9);
                } else if (t >= q1 && t < 7.6) {
                    glyph = '!';
                    k = pop((t - q1) / 0.8);
                }
                if (glyph) {
                    const fade = 1 - sink;
                    const bob = Math.sin(t * 3) * r * 0.08;
                    const wiggle = glyph === '?' ? Math.sin(t * 2.4) * 0.12 : 0;
                    ctx.save();
                    ctx.translate(cx, headY - r * 2.1 + bob);
                    ctx.rotate(wiggle);
                    ctx.scale(Math.max(k, 0), Math.max(k, 0));
                    ctx.font = '700 ' + Math.round(r * 1.7) + 'px "Courier Prime", "Noto Sans KR", monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = accent;
                    ctx.shadowBlur = 16;
                    withAlpha(ctx, fade, () => {
                        ctx.fillStyle = glyph === '?' ? C.text : accent;
                        ctx.fillText(glyph, 0, 0);
                    });
                    ctx.restore();
                }
            },
        };
    }

    /* ---------- 전자공학: RLC 직렬 회로의 감쇠 진동 ---------- */

    function animCircuit(stage, C, accent) {
        const cv = mkCanvas(stage);
        const T = 11, HOLD = 1.6, W0 = (2 * Math.PI) / 2.4, AL = 0.36, N = 44;
        const MATH = '"STIX Two Text", "Cambria Math", "Times New Roman", Georgia, serif';
        let t = 0, S = 0;
        // i(t): 전류, q(t): 커패시터 전압(전하)에 비례. 둘 다 e^(-αt) 로 잦아든다.
        const I = (x) => Math.exp(-AL * x) * Math.sin(W0 * x);
        const Q = (x) => Math.exp(-AL * x) * (Math.cos(W0 * x) + (AL / W0) * Math.sin(W0 * x));

        const lerp = (a, b, k) => a + (b - a) * k;
        function line(ctx, pts, color, w) {
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.strokeStyle = color;
            ctx.lineWidth = w;
            ctx.stroke();
        }
        function dotAt(ctx, x, y, r, color) {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
        }
        // 수식 글자: 이탤릭 세리프, 아래첨자는 작게 내려서 그린다. parts = [{ s, it, sub, color }]
        function mathFont(p, size) {
            return (p.it ? 'italic ' : '') + '400 ' + (p.sub ? size * 0.7 : size) + 'px ' + MATH;
        }
        function mathW(ctx, parts, size) {
            let w = 0;
            parts.forEach((p) => {
                ctx.font = mathFont(p, size);
                w += ctx.measureText(p.s).width;
            });
            return w;
        }
        function math(ctx, parts, x, base, size, align) {
            const total = mathW(ctx, parts, size);
            let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            parts.forEach((p) => {
                ctx.font = mathFont(p, size);
                ctx.fillStyle = p.color;
                ctx.fillText(p.s, cx, base + (p.sub ? size * 0.28 : 0));
                cx += ctx.measureText(p.s).width;
            });
        }

        function layout() {
            const W = cv.W, H = cv.H;
            return { W, H, x0: W * 0.1, x1: W * 0.46, y0: H * 0.24, y1: H * 0.78, gx: W * 0.56, gw: W * 0.4, gy: H * 0.2, gh: H * 0.6 };
        }
        // 회로 한 바퀴를 u(0~1)로 매겨 위치를 구한다. 왼쪽 위에서 시계 방향.
        function loopPt(L, u) {
            const w = L.x1 - L.x0, h = L.y1 - L.y0;
            let d = (((u % 1) + 1) % 1) * 2 * (w + h);
            if (d < w) return [L.x0 + d, L.y0];
            d -= w;
            if (d < h) return [L.x1, L.y0 + d];
            d -= h;
            if (d < w) return [L.x1 - d, L.y1];
            d -= w;
            return [L.x0, L.y1 - d];
        }

        return {
            preview: 120,
            resize: cv.resize,
            update(dt) {
                t += dt;
                if (t < T) S += dt * I(t) * 1.1;
                if (t >= T + HOLD) {
                    t = 0;
                    S = 0;
                }
            },
            render() {
                if (!cv.W) return;
                const ctx = cv.ctx;
                cv.clear();
                const L = layout();
                const ms = Math.round(Math.max(12, Math.min(L.H * 0.05, 17)));
                const w = L.x1 - L.x0, h = L.y1 - L.y0, midY = (L.y0 + L.y1) / 2;
                const gap = h * 0.07, pw = w * 0.09;
                const ix0 = L.x0 + w * 0.3, ix1 = L.x0 + w * 0.7;
                const ry0 = L.y0 + h * 0.28, ry1 = L.y0 + h * 0.72;
                const tt = Math.min(t, T);
                const i = I(tt), q = Q(tt);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                // 인덕터 주변 자기장, 저항 발열을 은은한 빛으로
                const glow = (x, y, r, a) => {
                    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
                    gr.addColorStop(0, accent);
                    gr.addColorStop(1, 'rgba(0,0,0,0)');
                    withAlpha(ctx, a, () => {
                        ctx.fillStyle = gr;
                        ctx.beginPath();
                        ctx.arc(x, y, r, 0, Math.PI * 2);
                        ctx.fill();
                    });
                };
                glow((ix0 + ix1) / 2, L.y0, w * 0.24, Math.abs(i) * 0.5);
                glow(L.x1, midY, w * 0.16, i * i * 0.45);

                // 전선
                [
                    [[L.x0, L.y1], [L.x1, L.y1], [L.x1, ry1]],
                    [[L.x1, ry0], [L.x1, L.y0], [ix1, L.y0]],
                    [[ix0, L.y0], [L.x0, L.y0], [L.x0, midY - gap / 2]],
                    [[L.x0, midY + gap / 2], [L.x0, L.y1]],
                ].forEach((p) => line(ctx, p, C.ter, 2.5));

                // 저항
                const amp = w * 0.035, segs = 7, rz = [];
                for (let s = 0; s <= segs; s++) rz.push([L.x1 + (s === 0 || s === segs ? 0 : s % 2 ? -amp : amp), lerp(ry0, ry1, s / segs)]);
                line(ctx, rz, C.sec, 2.5);

                // 인덕터
                const cw = (ix1 - ix0) / 4;
                ctx.beginPath();
                ctx.moveTo(ix0, L.y0);
                for (let k = 0; k < 4; k++) ctx.arc(ix0 + (k + 0.5) * cw, L.y0, cw / 2, Math.PI, 2 * Math.PI);
                ctx.strokeStyle = C.sec;
                ctx.lineWidth = 2.5;
                ctx.stroke();

                // 커패시터: 전하가 쌓인 쪽 판이 밝아진다
                const yTop = midY - gap / 2, yBot = midY + gap / 2, aq = Math.abs(q);
                line(ctx, [[L.x0 - pw, yTop], [L.x0 + pw, yTop]], C.sec, 3.5);
                line(ctx, [[L.x0 - pw, yBot], [L.x0 + pw, yBot]], C.sec, 3.5);
                const posY = q >= 0 ? yTop : yBot, negY = q >= 0 ? yBot : yTop;
                withAlpha(ctx, aq, () => {
                    line(ctx, [[L.x0 - pw, posY], [L.x0 + pw, posY]], accent, 5);
                    line(ctx, [[L.x0 - pw, negY], [L.x0 + pw, negY]], C.text, 5);
                    for (const dx of [-pw / 2, 0, pw / 2]) line(ctx, [[L.x0 + dx, yTop + 3], [L.x0 + dx, yBot - 3]], C.ter, 1.2);
                    math(ctx, [{ s: '+', color: accent }], L.x0 - pw - 6, posY + ms * 0.32, ms + 2, 'right');
                    math(ctx, [{ s: '−', color: C.text }], L.x0 - pw - 6, negY + ms * 0.32, ms + 2, 'right');
                });

                // 전류 입자 (부품 구간은 건너뛴다)
                for (let k = 0; k < N; k++) {
                    const [px, py] = loopPt(L, k / N + S);
                    if (py === L.y0 && px > ix0 && px < ix1) continue;
                    if (px === L.x1 && py > ry0 && py < ry1) continue;
                    if (px === L.x0 && Math.abs(py - midY) < gap / 2 + 4) continue;
                    withAlpha(ctx, 0.3 + 0.7 * Math.min(1, Math.abs(i) * 1.4), () => dotAt(ctx, px, py, 2.6, accent));
                }

                // 부품 이름
                math(ctx, [{ s: 'L', it: true, color: C.ter }], (ix0 + ix1) / 2, L.y0 - cw * 0.5 - 6, ms, 'center');
                math(ctx, [{ s: 'R', it: true, color: C.ter }], L.x1 + amp + 10, midY + ms * 0.32, ms, 'left');
                math(ctx, [{ s: 'C', it: true, color: C.ter }], L.x0 + pw + 10, midY + ms * 0.32, ms, 'left');

                // 그래프
                const my = L.gy + L.gh / 2, A = L.gh * 0.42;
                line(ctx, [[L.gx, my], [L.gx + L.gw, my]], C.border, 1.5);
                line(ctx, [[L.gx, L.gy], [L.gx, L.gy + L.gh]], C.border, 1.5);
                ctx.setLineDash([4, 4]);
                for (const sg of [1, -1]) {
                    const env = [];
                    for (let x = 0; x <= T; x += 0.25) env.push([L.gx + (x / T) * L.gw, my - sg * A * Math.exp(-AL * x)]);
                    withAlpha(ctx, 0.5, () => line(ctx, env, C.ter, 1));
                }
                ctx.setLineDash([]);
                const curve = (fn, color, lw) => {
                    const pts = [];
                    for (let x = 0; x < tt; x += 0.04) pts.push([L.gx + (x / T) * L.gw, my - fn(x) * A]);
                    pts.push([L.gx + (tt / T) * L.gw, my - fn(tt) * A]);
                    if (pts.length > 1) line(ctx, pts, color, lw);
                    dotAt(ctx, pts[pts.length - 1][0], pts[pts.length - 1][1], 3.5, color);
                };
                curve(Q, C.sec, 2);
                curve(I, accent, 2.5);

                // 범례: 선 색 견본 + 수식 글자
                const ls = ms + 3, ly = L.gy - 8;
                const iParts = [{ s: 'i', it: true, color: accent }, { s: '(', color: accent }, { s: 't', it: true, color: accent }, { s: ')', color: accent }];
                const vParts = [{ s: 'v', it: true, color: C.text }, { s: 'C', it: true, sub: true, color: C.text }, { s: '(', color: C.text }, { s: 't', it: true, color: C.text }, { s: ')', color: C.text }];
                const right = L.gx + L.gw;
                const iw = mathW(ctx, iParts, ls), vw = mathW(ctx, vParts, ls);
                const ix = right - iw, vx = ix - 18 - 22 - vw;
                line(ctx, [[ix - 20, ly - ls * 0.3], [ix - 6, ly - ls * 0.3]], accent, 2.5);
                math(ctx, iParts, ix, ly, ls, 'left');
                line(ctx, [[vx - 20, ly - ls * 0.3], [vx - 6, ly - ls * 0.3]], C.sec, 2);
                math(ctx, vParts, vx, ly, ls, 'left');
                math(ctx, [{ s: 't', it: true, color: C.ter }], right, my + ms + 6, ms + 1, 'right');
            },
        };
    }

    /* ---------- 해킹: 펌웨어를 뜯어보는 터미널 ---------- */

    function animTerminal(stage, C, accent) {
        const pre = document.createElement('pre');
        pre.className = 'term';
        pre.setAttribute('aria-hidden', 'true');
        stage.appendChild(pre);

        const script = [
            { cmd: 'binwalk firmware.bin' },
            { out: '0x0       ELF, 32-bit LSB executable, ARM' },
            { out: '0x1A40    SquashFS filesystem, little endian' },
            { cmd: 'xxd -s 0x31c00 -l 32 firmware.bin' },
            {
                html:
                    '<span class="t-dim">00031c00:</span> 6261 7564 7261 7465 <span class="t-hit">3d</span>31 3135 3230 3000  <span class="t-dim">baudrate=115200.</span>',
            },
            {
                html:
                    '<span class="t-dim">00031c10:</span> 626f 6f74 6465 6c61 793d 3300 0000 0000  <span class="t-dim">bootdelay=3.....</span>',
            },
        ];
        let shown, li, ci, wait;
        function reset() {
            shown = [];
            li = 0;
            ci = 0;
            wait = 0.4;
        }
        reset();

        function esc(s) {
            return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        }
        function line(item, partial) {
            if (item.cmd !== undefined) {
                const t = partial === undefined ? item.cmd : item.cmd.slice(0, partial);
                return '<span class="t-prompt">$</span> ' + esc(t);
            }
            if (item.out !== undefined) return '<span class="t-dim">' + esc(item.out) + '</span>';
            return item.html;
        }

        return {
            preview: 78,
            update(dt) {
                if (wait > 0) {
                    wait -= dt;
                    return;
                }
                const cur = script[li];
                if (!cur) {
                    // 마지막 줄을 보여준 채로 대기한 뒤 처음부터 다시
                    reset();
                    return;
                }
                if (cur.cmd !== undefined) {
                    ci += dt * 26;
                    if (ci >= cur.cmd.length) {
                        shown.push(line(cur));
                        li++;
                        ci = 0;
                        wait = 0.35;
                    }
                } else {
                    shown.push(line(cur));
                    li++;
                    wait = li >= script.length ? 2.6 : 0.15;
                }
            },
            render() {
                const cur = script[li];
                const lines = shown.slice();
                const caret = '<span class="t-caret"></span>';
                if (cur && cur.cmd !== undefined && wait <= 0) lines.push(line(cur, Math.floor(ci)) + caret);
                else lines.push('<span class="t-prompt">$</span> ' + caret);
                pre.innerHTML = lines.slice(-7).join('\n');
            },
        };
    }

    /* ---------- 알고리즘: 격자 위의 BFS ---------- */

    function animBFS(stage, C, accent) {
        const cv = mkCanvas(stage);
        const COLS = 16, ROWS = 7;
        const start = [0, 3], goal = [COLS - 1, 3];
        let seed = 11;
        let walls, order, dist, path, revealed, pathShown, hold;

        function key(x, y) {
            return y * COLS + x;
        }
        function build() {
            for (;;) {
                const rand = rng(seed);
                const w = new Set();
                for (let y = 0; y < ROWS; y++)
                    for (let x = 0; x < COLS; x++) {
                        if ((x === start[0] && y === start[1]) || (x === goal[0] && y === goal[1])) continue;
                        if (rand() < 0.27) w.add(key(x, y));
                    }
                const parent = new Map([[key(start[0], start[1]), -1]]);
                const d = new Map([[key(start[0], start[1]), 0]]);
                const ord = [[start[0], start[1]]];
                const q = [[start[0], start[1]]];
                let found = false;
                for (let h = 0; h < q.length && !found; h++) {
                    const [cx, cy] = q[h];
                    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
                        const k = key(nx, ny);
                        if (w.has(k) || parent.has(k)) continue;
                        parent.set(k, key(cx, cy));
                        d.set(k, d.get(key(cx, cy)) + 1);
                        ord.push([nx, ny]);
                        q.push([nx, ny]);
                        if (nx === goal[0] && ny === goal[1]) {
                            found = true;
                            break;
                        }
                    }
                }
                if (found && d.get(key(goal[0], goal[1])) >= 18) {
                    walls = w;
                    order = ord;
                    dist = d;
                    path = [];
                    for (let k = key(goal[0], goal[1]); k !== -1; k = parent.get(k)) path.push([k % COLS, Math.floor(k / COLS)]);
                    path.reverse();
                    return;
                }
                seed++;
            }
        }
        function reset() {
            build();
            revealed = 0;
            pathShown = 0;
            hold = 0;
        }
        reset();

        return {
            preview: 70,
            resize: cv.resize,
            update(dt) {
                if (revealed < order.length) revealed = Math.min(order.length, revealed + dt * 40);
                else if (pathShown < path.length) pathShown = Math.min(path.length, pathShown + dt * 26);
                else {
                    hold += dt;
                    if (hold > 1.6) {
                        seed++;
                        reset();
                    }
                }
            },
            render() {
                if (!cv.W) return;
                const ctx = cv.ctx;
                cv.clear();
                const cell = Math.min(cv.W / COLS, cv.H / ROWS);
                const ox = (cv.W - cell * COLS) / 2, oy = (cv.H - cell * ROWS) / 2;
                const pad = Math.max(1.5, cell * 0.08);
                const rr = cell * 0.18;
                function box(x, y) {
                    ctx.beginPath();
                    ctx.roundRect(ox + x * cell + pad, oy + y * cell + pad, cell - pad * 2, cell - pad * 2, rr);
                }
                for (let y = 0; y < ROWS; y++)
                    for (let x = 0; x < COLS; x++) {
                        box(x, y);
                        ctx.fillStyle = walls.has(key(x, y)) ? '#8a8a96' : C.bg3;
                        ctx.fill();
                    }
                const n = Math.floor(revealed);
                for (let i = 0; i < n; i++) {
                    const [x, y] = order[i];
                    const age = revealed - i;
                    box(x, y);
                    ctx.globalAlpha = 0.16 + 0.5 * Math.max(0, 1 - age / 14);
                    ctx.fillStyle = accent;
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
                const pn = Math.floor(pathShown);
                for (let i = 0; i < pn; i++) {
                    box(path[i][0], path[i][1]);
                    ctx.fillStyle = accent;
                    ctx.fill();
                }
                // 시작/도착
                [[start, true], [goal, false]].forEach(([p, filled]) => {
                    const cx = ox + p[0] * cell + cell / 2, cy = oy + p[1] * cell + cell / 2;
                    ctx.beginPath();
                    ctx.arc(cx, cy, cell * 0.22, 0, Math.PI * 2);
                    if (filled) {
                        ctx.fillStyle = C.text;
                        ctx.fill();
                    } else {
                        ctx.lineWidth = 2.5;
                        ctx.strokeStyle = C.text;
                        ctx.stroke();
                    }
                });
            },
        };
    }

    /* ---------- 메이커: 두 발로 걷는 로봇 ---------- */

    function animBiped(stage, C, accent) {
        const cv = mkCanvas(stage);
        const TC = 1.3, STANCE = 0.55;
        const SANS = '"Noto Sans KR", -apple-system, "Segoe UI", sans-serif';
        const MONO = '"Courier Prime", "Noto Sans KR", monospace';
        let t = 0, gOff = 0;

        const clampv = (x, a, b) => Math.max(a, Math.min(b, x));
        const lerp = (a, b, k) => a + (b - a) * k;
        function line(ctx, pts, color, w) {
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.strokeStyle = color;
            ctx.lineWidth = w;
            ctx.stroke();
        }
        function dotAt(ctx, x, y, r, color) {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
        }

        // u: 한 다리의 보행 위상(0~1). 앞쪽 절반은 지면을 밀며 뒤로, 나머지는 들어서 앞으로 옮긴다.
        function footAt(u, s, lift) {
            if (u < STANCE) return [s / 2 - (s * u) / STANCE, 0];
            const k = (u - STANCE) / (1 - STANCE);
            return [-s / 2 + s * (k - Math.sin(2 * Math.PI * k) / (2 * Math.PI)), lift * Math.sin(Math.PI * k)];
        }
        function geom() {
            const W = cv.W, H = cv.H;
            const L = H * 0.2, hipY = H * 0.45;
            return { W, H, L, hipY, ankleY: hipY + 1.8 * L, groundY: hipY + 1.8 * L + 7, s: L * 0.95, lift: L * 0.28 };
        }
        // 2링크 역기구학. 무릎은 앞쪽으로 꺾인다.
        function ik(hx, hy, ax, ay, L) {
            const dx = ax - hx, dy = ay - hy;
            const d = Math.min(Math.hypot(dx, dy), 2 * L * 0.999);
            const ux = dx / Math.hypot(dx, dy), uy = dy / Math.hypot(dx, dy);
            const h = Math.sqrt(Math.max(0, L * L - (d / 2) * (d / 2)));
            let px = uy, py = -ux;
            if (px < 0) {
                px = -px;
                py = -py;
            }
            return [hx + ux * (d / 2) + px * h, hy + uy * (d / 2) + py * h, hx + ux * d, hy + uy * d];
        }

        return {
            preview: 40,
            resize: cv.resize,
            update(dt) {
                if (!cv.W) return;
                t += dt;
                const g = geom();
                gOff += dt * (g.s / (STANCE * TC));
            },
            render() {
                if (!cv.W) return;
                const ctx = cv.ctx;
                cv.clear();
                const g = geom();
                const fs = Math.round(clampv(g.H * 0.036, 9, 13));
                const cx = g.W * 0.5;
                const ph = t / TC;
                const bob = Math.cos(4 * Math.PI * ph) * g.L * 0.03;
                const hx = cx, hy = g.hipY + bob;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                // 지면: 점선이 뒤로 흘러 앞으로 걷는 느낌을 준다
                line(ctx, [[0, g.groundY], [g.W, g.groundY]], C.ter, 2);
                const sp = 34, off = gOff % sp;
                ctx.strokeStyle = C.border;
                ctx.lineWidth = 2;
                ctx.beginPath();
                for (let x = -off; x < g.W + sp; x += sp) {
                    ctx.moveTo(x, g.groundY + 8);
                    ctx.lineTo(x + 12, g.groundY + 8);
                }
                ctx.stroke();

                const legs = [0.5, 0].map((o) => {
                    const u = (((ph + o) % 1) + 1) % 1;
                    const [fx, fl] = footAt(u, g.s, g.lift);
                    const j = ik(hx, hy, hx + fx, g.ankleY - fl, g.L);
                    return { kx: j[0], ky: j[1], ax: j[2], ay: j[3] };
                });
                const drawLeg = (lg, col, w, jointCol) => {
                    line(ctx, [[hx, hy], [lg.kx, lg.ky], [lg.ax, lg.ay]], col, w);
                    line(ctx, [[lg.ax - g.L * 0.18, lg.ay + 5], [lg.ax + g.L * 0.42, lg.ay + 5]], col, w + 1);
                    [[hx, hy], [lg.kx, lg.ky], [lg.ax, lg.ay]].forEach((p) => {
                        dotAt(ctx, p[0], p[1], 5.5, C.bg2);
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = jointCol;
                        ctx.stroke();
                    });
                };
                drawLeg(legs[0], C.ter, 6, C.sec); // 뒤쪽 다리

                // 몸통과 머리
                const bw = g.L * 1.15, bh = g.L * 0.95;
                ctx.beginPath();
                ctx.roundRect(hx - bw / 2, hy - bh, bw, bh, 8);
                ctx.fillStyle = '#2a2a30';
                ctx.fill();
                ctx.strokeStyle = C.ter;
                ctx.lineWidth = 2;
                ctx.stroke();
                const hw = bw * 0.78, hh = g.L * 0.45;
                ctx.beginPath();
                ctx.roundRect(hx - hw / 2 + bw * 0.08, hy - bh - hh - 3, hw, hh, 7);
                ctx.fillStyle = '#34343b';
                ctx.fill();
                ctx.stroke();
                dotAt(ctx, hx + bw * 0.28, hy - bh - hh / 2 - 3, 4, accent);
                const beat = 0.5 + 0.5 * Math.sin(t * 6);
                withAlpha(ctx, 0.3 + 0.7 * beat, () => dotAt(ctx, hx - bw * 0.22, hy - bh * 0.55, 4, accent));
                line(ctx, [[hx - bw * 0.3, hy - bh * 0.2], [hx + bw * 0.3, hy - bh * 0.2]], C.border, 2);

                drawLeg(legs[1], C.sec, 7, accent); // 앞쪽 다리

                // 관절 각도 패널 (앞쪽 다리 기준)
                const a = legs[1];
                const hipDeg = (Math.atan2(a.kx - hx, a.ky - hy) * 180) / Math.PI;
                const l1x = a.kx - hx, l1y = a.ky - hy, l2x = a.ax - a.kx, l2y = a.ay - a.ky;
                const kneeDeg = (Math.acos(clampv((l1x * l2x + l1y * l2y) / (g.L * g.L), -1, 1)) * 180) / Math.PI;
                const sgn = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(0) + '°';
                const rows = [
                    ['엉덩이 관절', sgn(hipDeg), accent],
                    ['무릎 관절', sgn(kneeDeg), accent],
                    ['보행 주기', (TC * 1000).toFixed(0) + ' ms', C.sec],
                ];
                const px = g.W * 0.05, py = g.H * 0.07, pw = Math.min(g.W * 0.34, 176), rh = fs * 2.1, pad = fs * 0.9;
                ctx.beginPath();
                ctx.roundRect(px, py, pw, pad * 2 + rh * rows.length - (rh - fs * 1.4), 8);
                ctx.fillStyle = C.bg3;
                ctx.fill();
                ctx.strokeStyle = C.border;
                ctx.lineWidth = 1;
                ctx.stroke();
                rows.forEach((r, i) => {
                    const y = py + pad + fs * 0.9 + i * rh;
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'left';
                    ctx.font = '400 ' + (fs + 1) + 'px ' + SANS;
                    ctx.fillStyle = C.ter;
                    ctx.fillText(r[0], px + pad, y);
                    ctx.textAlign = 'right';
                    ctx.font = '700 ' + (fs + 3) + 'px ' + MONO;
                    ctx.fillStyle = r[2];
                    ctx.fillText(r[1], px + pw - pad, y);
                    if (i < rows.length - 1) line(ctx, [[px + pad, y + rh / 2], [px + pw - pad, y + rh / 2]], C.border, 1);
                });
            },
        };
    }

    /* ---------- 체스: 시실리안 하이퍼액셀러레이티드 드래곤 ---------- */

    // 기물은 글꼴 대신 단순한 도형으로 직접 그린다. 한 칸을 1로 보고, 중심이 (0, 0)인 좌표계에서 그린다.
    function drawPiece(ctx, type, white, cx, cy, cell) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(cell, cell);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = 0.045;
        const ink = white ? '#0b0b0d' : '#e4e4e7';
        ctx.fillStyle = white ? '#fafafa' : '#17171b';
        ctx.strokeStyle = ink;
        const paint = () => {
            ctx.fill();
            ctx.stroke();
        };
        const poly = (pts) => {
            ctx.beginPath();
            pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
            ctx.closePath();
            paint();
        };
        const circle = (x, y, r) => {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            paint();
        };
        const box = (x, y, w, h, r) => {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, r);
            paint();
        };

        switch (type) {
            case 'P':
                poly([[-0.07, -0.06], [0.07, -0.06], [0.17, 0.28], [-0.17, 0.28]]);
                circle(0, -0.16, 0.125);
                break;
            case 'R':
                poly([[-0.17, -0.12], [0.17, -0.12], [0.2, 0.28], [-0.2, 0.28]]);
                box(-0.23, -0.36, 0.11, 0.18, 0.015);
                box(-0.055, -0.36, 0.11, 0.18, 0.015);
                box(0.12, -0.36, 0.11, 0.18, 0.015);
                box(-0.23, -0.2, 0.46, 0.09, 0.02);
                break;
            case 'N':
                poly([[-0.2, 0.28], [0.24, 0.28], [0.22, 0.02], [0.18, -0.18], [0.08, -0.34], [0.04, -0.4], [-0.04, -0.32], [-0.3, -0.06], [-0.3, 0.04], [-0.22, 0.08], [-0.1, 0.02], [-0.02, 0], [-0.12, 0.14]]);
                ctx.beginPath();
                ctx.arc(-0.07, -0.19, 0.03, 0, Math.PI * 2);
                ctx.fillStyle = ink;
                ctx.fill();
                break;
            case 'B':
                poly([[-0.09, 0.04], [0.09, 0.04], [0.18, 0.28], [-0.18, 0.28]]);
                box(-0.17, 0, 0.34, 0.07, 0.03);
                ctx.beginPath();
                ctx.ellipse(0, -0.14, 0.13, 0.2, 0, 0, Math.PI * 2);
                paint();
                circle(0, -0.39, 0.045);
                ctx.beginPath();
                ctx.moveTo(0, -0.26);
                ctx.lineTo(0.09, -0.13);
                ctx.lineWidth = 0.04;
                ctx.stroke();
                break;
            case 'Q':
                poly([[-0.11, -0.04], [0.11, -0.04], [0.2, 0.28], [-0.2, 0.28]]);
                poly([[-0.22, 0.02], [-0.26, -0.28], [-0.12, -0.12], [0, -0.33], [0.12, -0.12], [0.26, -0.28], [0.22, 0.02]]);
                circle(-0.26, -0.31, 0.035);
                circle(0, -0.37, 0.035);
                circle(0.26, -0.31, 0.035);
                break;
            case 'K':
                poly([[-0.11, -0.04], [0.11, -0.04], [0.2, 0.28], [-0.2, 0.28]]);
                box(-0.2, -0.2, 0.4, 0.22, 0.07);
                poly([[-0.03, -0.43], [0.03, -0.43], [0.03, -0.37], [0.09, -0.37], [0.09, -0.31], [0.03, -0.31], [0.03, -0.2], [-0.03, -0.2], [-0.03, -0.31], [-0.09, -0.31], [-0.09, -0.37], [-0.03, -0.37]]);
                break;
        }
        box(-0.27, 0.28, 0.54, 0.11, 0.05);
        ctx.restore();
    }

    function animChess(stage, C, accent) {
        const cv = mkCanvas(stage);
        // 1. e4 c5 2. Nf3 g6 3. d4 cxd4 4. Nxd4 Bg7
        const MOVES = [
            ['e4', 'e2', 'e4'], ['c5', 'c7', 'c5'],
            ['Nf3', 'g1', 'f3'], ['g6', 'g7', 'g6'],
            ['d4', 'd2', 'd4'], ['cxd4', 'c5', 'd4'],
            ['Nxd4', 'f3', 'd4'], ['Bg7', 'f8', 'g7'],
        ];
        function sq(s) {
            return [s.charCodeAt(0) - 97, 8 - Number(s[1])];
        }
        let pieces, mi, phase, t, lastFrom, lastTo;
        function reset() {
            pieces = [];
            const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
            for (let x = 0; x < 8; x++) {
                pieces.push({ t: back[x], c: 'b', x, y: 0 });
                pieces.push({ t: 'P', c: 'b', x, y: 1 });
                pieces.push({ t: 'P', c: 'w', x, y: 6 });
                pieces.push({ t: back[x], c: 'w', x, y: 7 });
            }
            mi = 0;
            phase = 'pause';
            t = 0.7;
            lastFrom = lastTo = null;
        }
        reset();

        function find(x, y) {
            return pieces.find((p) => p.x === x && p.y === y);
        }

        return {
            preview: 200,
            resize: cv.resize,
            update(dt) {
                t -= dt;
                if (phase === 'pause' && t <= 0) {
                    if (mi >= MOVES.length) {
                        phase = 'end';
                        t = 3.4;
                    } else {
                        phase = 'move';
                        t = 0.6;
                    }
                } else if (phase === 'move' && t <= 0) {
                    const m = MOVES[mi];
                    const a = sq(m[1]), b = sq(m[2]);
                    const cap = find(b[0], b[1]);
                    if (cap) pieces.splice(pieces.indexOf(cap), 1);
                    const mover = find(a[0], a[1]);
                    mover.x = b[0];
                    mover.y = b[1];
                    lastFrom = a;
                    lastTo = b;
                    mi++;
                    phase = 'pause';
                    t = 0.55;
                } else if (phase === 'end' && t <= 0) {
                    reset();
                }
            },
            render() {
                if (!cv.W) return;
                const ctx = cv.ctx;
                cv.clear();
                const size = Math.min(cv.H - 14, cv.W * 0.46);
                const cell = size / 8;
                const ox = 14, oy = (cv.H - size) / 2;
                const done = phase === 'end' || (phase === 'pause' && mi === MOVES.length);

                for (let y = 0; y < 8; y++)
                    for (let x = 0; x < 8; x++) {
                        ctx.fillStyle = (x + y) % 2 ? '#5b5b63' : '#8f8f98';
                        ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
                    }
                if (lastFrom && lastTo) {
                    withAlpha(ctx, 0.35, () => {
                        ctx.fillStyle = accent;
                        [lastFrom, lastTo].forEach((s) => ctx.fillRect(ox + s[0] * cell, oy + s[1] * cell, cell, cell));
                    });
                }

                // 마지막 수 뒤에는 드래곤 비숍의 긴 대각선(g7-a1)을 보여 준다
                if (done) {
                    ctx.save();
                    ctx.setLineDash([cell * 0.2, cell * 0.16]);
                    ctx.lineCap = 'round';
                    ctx.lineWidth = Math.max(2, cell * 0.07);
                    ctx.strokeStyle = accent;
                    ctx.globalAlpha = 0.85;
                    ctx.beginPath();
                    ctx.moveTo(ox + 6.5 * cell, oy + 1.5 * cell);
                    ctx.lineTo(ox + 0.5 * cell, oy + 7.5 * cell);
                    ctx.stroke();
                    ctx.restore();
                }

                // 이동 중인 기물
                let moving = null, fx = 0, fy = 0;
                if (phase === 'move') {
                    const m = MOVES[mi];
                    const a = sq(m[1]), b = sq(m[2]);
                    moving = find(a[0], a[1]);
                    const k = 1 - Math.max(0, t) / 0.6;
                    const e = k * k * (3 - 2 * k);
                    fx = a[0] + (b[0] - a[0]) * e;
                    fy = a[1] + (b[1] - a[1]) * e;
                }
                const draw = (p, x, y) => drawPiece(ctx, p.t, p.c === 'w', ox + (x + 0.5) * cell, oy + (y + 0.52) * cell, cell * 0.96);
                pieces.forEach((p) => {
                    if (p !== moving) draw(p, p.x, p.y);
                });
                if (moving) draw(moving, fx, fy);

                // 기보와 오프닝 이름
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
                const fs = Math.max(12, Math.min(16, cv.W * 0.032));
                const tx = ox + size + Math.max(18, cv.W * 0.06);
                const rowH = fs * 1.9, nameH = fs * 1.55 * 3 + fs * 0.6;
                const ty = oy + (size - (rowH * 4 + nameH)) / 2 + fs;
                ctx.font = '700 ' + fs + 'px "Courier Prime", "Noto Sans KR", monospace';
                for (let r = 0; r < 4; r++) {
                    const w = MOVES[r * 2], b = MOVES[r * 2 + 1];
                    const parts = [];
                    if (w && mi > r * 2) parts.push({ s: w[0], last: mi === r * 2 + 1 });
                    if (b && mi > r * 2 + 1) parts.push({ s: b[0], last: mi === r * 2 + 2 });
                    if (!parts.length) continue;
                    ctx.fillStyle = C.ter;
                    ctx.fillText(r + 1 + '.', tx, ty + r * rowH);
                    let x = tx + fs * 2;
                    parts.forEach((pt) => {
                        ctx.fillStyle = pt.last ? accent : C.text;
                        ctx.fillText(pt.s, x, ty + r * rowH);
                        x += ctx.measureText(pt.s).width + fs * 0.9;
                    });
                }
                if (done) {
                    const ny = ty + rowH * 4 + fs * 0.2;
                    ctx.font = '400 ' + (fs - 1) + 'px "Courier Prime", "Noto Sans KR", monospace';
                    ctx.fillStyle = C.ter;
                    ctx.fillText('B27', tx, ny);
                    ctx.fillStyle = C.sec;
                    ctx.fillText('Sicilian Defense', tx, ny + fs * 1.55);
                    ctx.font = '700 ' + (fs - 1) + 'px "Courier Prime", "Noto Sans KR", monospace';
                    ctx.fillStyle = accent;
                    ctx.fillText('Hyperaccelerated', tx, ny + fs * 3.1);
                    ctx.fillText('Dragon', tx, ny + fs * 4.65);
                }
            },
        };
    }

    /* ---------- 베이스: 줄이 울리는 모습 ---------- */

    function animBass(stage, C, accent) {
        const cv = mkCanvas(stage);
        const NAMES = ['G', 'D', 'A', 'E'];
        const FREQ = [11.8, 8.8, 6.6, 4.9];
        const WIDTH = [1.6, 2.1, 2.7, 3.4];
        const RIFF = [3, 3, 1, 3, 2, 2, 0, 1];
        const STEP = 0.42;
        const amp = [0, 0, 0, 0];
        const phase = [0, 0, 0, 0];
        let time = 0, lastStep = -1;

        return {
            preview: 8,
            resize: cv.resize,
            update(dt) {
                time += dt;
                const step = Math.floor(time / STEP);
                if (step !== lastStep) {
                    lastStep = step;
                    const s = RIFF[step % RIFF.length];
                    amp[s] = 1;
                    phase[s] = 0;
                }
                for (let i = 0; i < 4; i++) {
                    phase[i] += dt * FREQ[i] * Math.PI * 2;
                    amp[i] *= Math.exp(-dt * 1.7);
                }
            },
            render() {
                if (!cv.W) return;
                const ctx = cv.ctx;
                cv.clear();
                const x0 = 0.1 * cv.W, x1 = 0.94 * cv.W;
                const maxA = cv.H * 0.09;
                ctx.lineCap = 'round';

                // 너트 / 브릿지
                ctx.strokeStyle = C.border;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(x0, cv.H * 0.12);
                ctx.lineTo(x0, cv.H * 0.88);
                ctx.moveTo(x1, cv.H * 0.12);
                ctx.lineTo(x1, cv.H * 0.88);
                ctx.stroke();

                ctx.font = '700 12px "Courier Prime", "Noto Sans KR", monospace';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                for (let i = 0; i < 4; i++) {
                    const y = cv.H * (0.22 + i * 0.185);
                    ctx.fillStyle = amp[i] > 0.15 ? accent : C.ter;
                    ctx.fillText(NAMES[i], cv.W * 0.03, y);

                    ctx.lineWidth = WIDTH[i];
                    ctx.strokeStyle = amp[i] > 0.05 ? accent : C.sec;
                    ctx.beginPath();
                    const N = 64;
                    for (let k = 0; k <= N; k++) {
                        const u = k / N;
                        const yy = y + Math.sin(Math.PI * u) * Math.cos(phase[i]) * amp[i] * maxA;
                        const xx = x0 + (x1 - x0) * u;
                        if (k) ctx.lineTo(xx, yy);
                        else ctx.moveTo(xx, yy);
                    }
                    ctx.stroke();
                }
            },
        };
    }

    const ANIMS = {
        intro: animIntro,
        circuit: animCircuit,
        terminal: animTerminal,
        bfs: animBFS,
        biped: animBiped,
        chess: animChess,
        bass: animBass,
    };

    /* ---------- 컨트롤러 ---------- */

    function readColors() {
        const css = getComputedStyle(document.documentElement);
        const v = (n) => css.getPropertyValue(n).trim();
        return {
            text: v('--color-text-primary') || '#000',
            sec: v('--color-text-secondary') || '#666',
            ter: v('--color-text-tertiary') || '#999',
            border: v('--color-border-primary') || '#e0e0e0',
            bg2: v('--color-background-secondary') || '#f8f8f8',
            bg3: v('--color-background-tertiary') || '#f0f0f0',
        };
    }

    function build(section, C) {
        const stage = section.querySelector('.show-stage');
        const make = ANIMS[section.dataset.anim];
        if (!stage || !make) return null;
        const accent = getComputedStyle(section).getPropertyValue('--accent').trim() || C.text;
        const sim = make(stage, C, accent);

        let raf = 0, running = false, last = 0;
        function frame(now) {
            if (!running) return;
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;
            sim.update(dt);
            sim.render();
            raf = requestAnimationFrame(frame);
        }

        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(() => {
                if (sim.resize) sim.resize();
                sim.render();
            }).observe(stage);
        }

        if (REDUCED) {
            for (let i = 0; i < (sim.preview || 0); i++) sim.update(0.05);
            sim.render();
            return { start() {}, stop() {} };
        }

        sim.render();
        return {
            start() {
                if (running) return;
                running = true;
                last = performance.now();
                raf = requestAnimationFrame(frame);
            },
            stop() {
                running = false;
                cancelAnimationFrame(raf);
            },
        };
    }

    function initShowcase(root) {
        const C = readColors();
        const ctrls = new Map();
        const sections = root.querySelectorAll('.show');

        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver(
                (entries) => {
                    entries.forEach((e) => {
                        const el = e.target;
                        if (e.isIntersecting) {
                            el.classList.add('in');
                            if (!ctrls.has(el)) ctrls.set(el, build(el, C));
                            const c = ctrls.get(el);
                            if (c) c.start();
                        } else {
                            const c = ctrls.get(el);
                            if (c) c.stop();
                        }
                    });
                },
                { threshold: 0.25 }
            );
            sections.forEach((s) => io.observe(s));
        } else {
            sections.forEach((s) => {
                s.classList.add('in');
                const c = build(s, C);
                if (c) c.start();
            });
        }

        // 스크롤 위치에 맞춰 사이드바 강조 (화면 가운데 근처에 있는 섹션)
        if ('IntersectionObserver' in window) {
            const spy = new IntersectionObserver(
                (entries) => {
                    entries.forEach((e) => {
                        if (!e.isIntersecting || !document.getElementById('tab-main').classList.contains('active')) return;
                        const slug = e.target.dataset.anim;
                        document.querySelectorAll('.side-link[data-go]').forEach((a) => a.classList.toggle('active', a.dataset.go === slug));
                    });
                },
                { rootMargin: '-40% 0px -55% 0px' }
            );
            sections.forEach((s) => spy.observe(s));
        }

        // PC: 휠/트랙패드 제스처의 "누적 이동량"으로 몇 칸 넘어갈지 정한다.
        //   살짝(약 100~140px 이하) -> 1칸, 그 뒤로 SECTION_STEP_PX 만큼 더 굴릴 때마다 1칸 추가.
        //   (CSS scroll-snap 은 터치/키보드용 보조. 처음/끝 섹션 너머는 기본 스크롤.)
        const FIRST_STEP_PX = 140;   // 이 이하로 굴리면 1칸
        const SECTION_STEP_PX = 240; // 이후 이만큼 더 굴릴 때마다 +1칸
        const GESTURE_GAP_MS = 160;  // 이 시간 동안 휠 입력이 없으면 새 제스처
        const mainEl = document.getElementById('tab-main');
        const list = Array.from(sections);
        let lastWheel = 0;
        let lastJump = 0;
        let gesture = null; // { base, dir, total, applied }
        let targetIndex = 0;

        function currentIndex() {
            const mid = window.innerHeight / 2;
            let cur = 0, best = Infinity;
            list.forEach((el, i) => {
                const r = el.getBoundingClientRect();
                const d = Math.abs(r.top + r.height / 2 - mid);
                if (d < best) { best = d; cur = i; }
            });
            return cur;
        }

        window.addEventListener(
            'wheel',
            (e) => {
                if (e.ctrlKey || e.metaKey || e.shiftKey || Math.abs(e.deltaY) < 1 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
                if (!mainEl.classList.contains('active') || !window.matchMedia('(min-width: 961px)').matches) return;
                if (!e.target.closest || !e.target.closest('.site')) return;

                const now = performance.now();
                const gap = now - lastWheel;
                lastWheel = now;
                const dir = e.deltaY > 0 ? 1 : -1;

                if (!gesture || gap > GESTURE_GAP_MS || gesture.dir !== dir) {
                    // 새 제스처. 직전 이동이 아직 진행 중이면 그 목적지에서 이어간다.
                    const base = now - lastJump < 800 ? targetIndex : currentIndex();
                    const edge = dir > 0 ? base >= list.length - 1 : base <= 0;
                    if (edge) {
                        gesture = null;
                        return; // 처음/끝: 기본 스크롤
                    }
                    gesture = { base, dir, total: 0, applied: -1 };
                }

                e.preventDefault();
                gesture.total += Math.abs(e.deltaY);
                const extra = Math.max(0, gesture.total - FIRST_STEP_PX);
                const steps = 1 + Math.floor(extra / SECTION_STEP_PX);
                const next = Math.max(0, Math.min(list.length - 1, gesture.base + gesture.dir * steps));
                if (next === gesture.applied) return;
                gesture.applied = next;
                targetIndex = next;
                lastJump = now;
                list[next].scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
            },
            { passive: false }
        );

        // 폴더별 글 수 표시. 글이 없으면 버튼 비활성화.
        getPosts().then((posts) => {
            sections.forEach((s) => {
                if (!s.dataset.folder) return;
                const btn = s.querySelector('.show-btn');
                if (!btn) return;
                const f = s.dataset.folder;
                const n = posts.filter((p) => p.folder === f || p.folder.startsWith(f + '/')).length;
                if (n > 0) {
                    btn.querySelector('.show-count').textContent = n;
                } else {
                    btn.disabled = true;
                    btn.querySelector('.show-label').textContent = '준비 중';
                    btn.querySelector('.show-count').textContent = '';
                }
            });
        });
    }

    sectionInit.main = initShowcase;
})();
