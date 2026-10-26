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

    /* ---------- 전자공학: PCB 트레이스 위를 달리는 신호 ---------- */

    function animCircuit(stage, C, accent) {
        const cv = mkCanvas(stage);
        const paths = [
            [[0.05, 0.5], [0.28, 0.5], [0.28, 0.2], [0.58, 0.2], [0.58, 0.5], [0.9, 0.5]],
            [[0.28, 0.5], [0.28, 0.82], [0.72, 0.82], [0.72, 0.5]],
            [[0.58, 0.5], [0.58, 0.82]],
            [[0.28, 0.43], [0.38, 0.43]],
            [[0.28, 0.57], [0.38, 0.57]],
            [[0.5, 0.43], [0.58, 0.43]],
            [[0.5, 0.57], [0.58, 0.57]],
        ];
        const nodes = [[0.05, 0.5], [0.28, 0.5], [0.58, 0.5], [0.72, 0.5], [0.58, 0.82], [0.28, 0.82]];
        const pulses = [
            { path: 0, d: 0, speed: 150 },
            { path: 0, d: -260, speed: 150 },
            { path: 1, d: -80, speed: 130 },
        ];
        let led = 0;

        function scaled(p) {
            return p.map((pt) => [pt[0] * cv.W, pt[1] * cv.H]);
        }
        function length(pts) {
            let L = 0;
            for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
            return L;
        }
        function pointAt(pts, d) {
            for (let i = 1; i < pts.length; i++) {
                const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
                if (d <= seg) {
                    const k = seg ? d / seg : 0;
                    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
                }
                d -= seg;
            }
            return pts[pts.length - 1];
        }

        return {
            preview: 24,
            resize: cv.resize,
            update(dt) {
                if (!cv.W) return;
                led = Math.max(0, led - dt * 2.2);
                pulses.forEach((p) => {
                    const total = length(scaled(paths[p.path]));
                    const before = p.d;
                    p.d += dt * p.speed;
                    if (p.path === 0 && before < total && p.d >= total) led = 1;
                    if (p.d > total + 120) p.d = -60;
                });
            },
            render() {
                if (!cv.W) return;
                const ctx = cv.ctx;
                cv.clear();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                // 트레이스
                ctx.strokeStyle = C.border;
                ctx.lineWidth = 3;
                paths.forEach((p) => {
                    const pts = scaled(p);
                    ctx.beginPath();
                    ctx.moveTo(pts[0][0], pts[0][1]);
                    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
                    ctx.stroke();
                });

                // IC
                const x0 = 0.38 * cv.W, y0 = 0.36 * cv.H, w = 0.12 * cv.W, h = 0.28 * cv.H;
                ctx.fillStyle = '#34343b';
                ctx.beginPath();
                ctx.roundRect(x0, y0, w, h, 4);
                ctx.fill();
                ctx.strokeStyle = C.ter;
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.fillStyle = C.sec;
                ctx.beginPath();
                ctx.arc(x0 + 8, y0 + 8, 2.5, 0, Math.PI * 2);
                ctx.fill();

                // 패드
                nodes.forEach((n) => {
                    ctx.beginPath();
                    ctx.arc(n[0] * cv.W, n[1] * cv.H, 4, 0, Math.PI * 2);
                    ctx.fillStyle = C.bg2;
                    ctx.fill();
                    ctx.strokeStyle = C.sec;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                });

                // LED
                const lx = 0.9 * cv.W, ly = 0.5 * cv.H;
                const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 34);
                g.addColorStop(0, accent);
                g.addColorStop(1, 'rgba(255,255,255,0)');
                withAlpha(ctx, led * 0.55, () => {
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(lx, ly, 34, 0, Math.PI * 2);
                    ctx.fill();
                });
                ctx.beginPath();
                ctx.arc(lx, ly, 8, 0, Math.PI * 2);
                ctx.fillStyle = C.bg2;
                ctx.fill();
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = led > 0.05 ? accent : C.sec;
                ctx.stroke();
                withAlpha(ctx, led, () => {
                    ctx.beginPath();
                    ctx.arc(lx, ly, 5, 0, Math.PI * 2);
                    ctx.fillStyle = accent;
                    ctx.fill();
                });

                // 신호 펄스
                pulses.forEach((p) => {
                    const pts = scaled(paths[p.path]);
                    for (let k = 0; k < 16; k++) {
                        const d = p.d - k * 5;
                        if (d < 0) continue;
                        const pt = pointAt(pts, d);
                        withAlpha(ctx, 1 - k / 16, () => {
                            ctx.beginPath();
                            ctx.arc(pt[0], pt[1], 3.4 - k * 0.13, 0, Math.PI * 2);
                            ctx.fillStyle = accent;
                            ctx.fill();
                        });
                    }
                });
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
                        ctx.fillStyle = walls.has(key(x, y)) ? '#4a4a52' : C.bg3;
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

    /* ---------- 메이커: 코일건 ---------- */

    function animCoilgun(stage, C, accent) {
        const cv = mkCanvas(stage);
        const COILS = [0.2, 0.34, 0.48, 0.62];
        let p, v, wait, time;
        function reset() {
            p = 0.03;
            v = 0.07;
            wait = 0.6;
            time = 0;
        }
        reset();

        function energized(i) {
            const dx = COILS[i] - p;
            return dx > 0.012 && dx < 0.15;
        }

        return {
            preview: 22,
            resize: cv.resize,
            update(dt) {
                time += dt;
                if (wait > 0) {
                    wait -= dt;
                    return;
                }
                let on = false;
                for (let i = 0; i < COILS.length; i++) if (energized(i)) on = true;
                if (on) v += 0.9 * dt;
                p += v * dt;
                if (p > 1.12) reset();
            },
            render() {
                if (!cv.W) return;
                const ctx = cv.ctx;
                cv.clear();
                const W = cv.W, H = cv.H, cy = H / 2;
                const tube = Math.min(16, H * 0.1);

                // 총열
                ctx.strokeStyle = C.sec;
                ctx.lineWidth = 2.5;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(0.05 * W, cy - tube);
                ctx.lineTo(0.78 * W, cy - tube);
                ctx.moveTo(0.05 * W, cy + tube);
                ctx.lineTo(0.78 * W, cy + tube);
                ctx.stroke();

                // 코일
                COILS.forEach((cx, i) => {
                    const on = energized(i) && wait <= 0;
                    const x = cx * W;
                    const hh = Math.min(34, H * 0.28);
                    if (on) {
                        const g = ctx.createRadialGradient(x, cy, 0, x, cy, hh * 2.2);
                        g.addColorStop(0, accent);
                        g.addColorStop(1, 'rgba(255,255,255,0)');
                        withAlpha(ctx, 0.35 + 0.1 * Math.sin(time * 30), () => {
                            ctx.fillStyle = g;
                            ctx.beginPath();
                            ctx.arc(x, cy, hh * 2.2, 0, Math.PI * 2);
                            ctx.fill();
                        });
                    }
                    ctx.strokeStyle = on ? accent : C.ter;
                    ctx.lineWidth = 3;
                    for (let k = -3; k <= 3; k++) {
                        ctx.beginPath();
                        ctx.moveTo(x + k * 5, cy - hh);
                        ctx.lineTo(x + k * 5, cy + hh);
                        ctx.stroke();
                    }
                });

                // 탄체
                const px = p * W;
                const pw = Math.min(30, W * 0.05), ph = Math.min(12, H * 0.08);
                ctx.fillStyle = C.text;
                ctx.beginPath();
                ctx.roundRect(px - pw / 2, cy - ph / 2, pw, ph, 3);
                ctx.fill();
                // 속도 잔상
                const trail = Math.min(6, Math.floor(v * 14));
                for (let k = 1; k <= trail; k++) {
                    withAlpha(ctx, 0.18 / k * 2, () => {
                        ctx.fillRect(px - pw / 2 - k * 7, cy - 1.5, 5, 3);
                    });
                }
            },
        };
    }

    /* ---------- 체스: 4수 메이트 ---------- */

    function animChess(stage, C, accent) {
        const cv = mkCanvas(stage);
        const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
        const MOVES = [
            ['e4', 'e2', 'e4'], ['e5', 'e7', 'e5'],
            ['Bc4', 'f1', 'c4'], ['Nc6', 'b8', 'c6'],
            ['Qh5', 'd1', 'h5'], ['Nf6', 'g8', 'f6'],
            ['Qxf7#', 'h5', 'f7'],
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
            preview: 180,
            resize: cv.resize,
            update(dt) {
                t -= dt;
                if (phase === 'pause' && t <= 0) {
                    if (mi >= MOVES.length) {
                        phase = 'end';
                        t = 2.6;
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

                ctx.font = Math.floor(cell * 0.86) + 'px "Noto Sans KR", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                function draw(p, x, y) {
                    const gx = ox + (x + 0.5) * cell, gy = oy + (y + 0.54) * cell;
                    const ch = GLYPH[p.t] + '︎';
                    ctx.lineWidth = Math.max(1.5, cell * 0.07);
                    if (p.c === 'w') {
                        ctx.strokeStyle = '#000000';
                        ctx.strokeText(ch, gx, gy);
                        ctx.fillStyle = '#ffffff';
                    } else {
                        ctx.strokeStyle = '#d4d4d8';
                        ctx.strokeText(ch, gx, gy);
                        ctx.fillStyle = '#0a0a0b';
                    }
                    ctx.fillText(ch, gx, gy);
                }
                pieces.forEach((p) => {
                    if (p !== moving) draw(p, p.x, p.y);
                });
                if (moving) draw(moving, fx, fy);

                // 메이트 표시
                if (phase === 'end' || (phase === 'pause' && mi === MOVES.length)) {
                    const kx = ox + 4.5 * cell, ky = oy + 0.5 * cell;
                    ctx.strokeStyle = accent;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(kx, ky, cell * 0.46, 0, Math.PI * 2);
                    ctx.stroke();
                }

                // 기보
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
                const fs = Math.max(12, Math.min(16, cv.W * 0.032));
                ctx.font = '700 ' + fs + 'px "Courier Prime", "Noto Sans KR", monospace';
                const tx = ox + size + Math.max(18, cv.W * 0.06);
                const rowH = fs * 1.9;
                const ty = oy + (size - rowH * 4) / 2 + fs;
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
        coilgun: animCoilgun,
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
