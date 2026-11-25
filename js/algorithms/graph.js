/**
 * 图寻路算法可视化模块
 * 采用「轨迹预计算 + 单步回放」架构：
 *   动画播放 / 暂停 / 单步 / 重置 都基于同一份搜索轨迹，保证三种模式表现一致。
 */

class PathfindingVisualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // 网格设置
        this.cols = 30;
        this.rows = 20;
        this.grid = [];
        this.cellSize = 0;
        this.offsetX = 0;
        this.offsetY = 0;

        // 起点与终点
        this.start = { x: 2, y: 2 };
        this.end = { x: 27, y: 17 };

        // 回放状态
        this.trace = [];          // 预计算事件轨迹
        this.stepIndex = 0;
        this.visited = [];        // 已访问格子
        this.frontier = [];       // 待扩展格子
        this.path = [];           // 最终路径
        this.isPlaying = false;
        this.speed = 50;
        this.playTimer = null;

        // 绘制模式
        this.drawMode = 'obstacle';

        // 统计
        this.stats = { visited: 0, pathLength: 0, time: 0 };
        this.onStatsUpdate = null;
        this.onFinish = null;

        this.initGrid();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.setupMouseInteraction();
    }

    /* ============================================================
       基础 setup
       ============================================================ */

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);

        const padding = 8;
        const maxW = rect.width - padding * 2;
        const maxH = rect.height - padding * 2;
        this.cellSize = Math.floor(Math.min(maxW / this.cols, maxH / this.rows));

        this.offsetX = (rect.width - this.cols * this.cellSize) / 2;
        this.offsetY = (rect.height - this.rows * this.cellSize) / 2;

        this.draw();
    }

    initGrid() {
        this.grid = [];
        for (let y = 0; y < this.rows; y++) {
            const row = [];
            for (let x = 0; x < this.cols; x++) {
                row.push({ x, y, type: 'empty' });
            }
            this.grid.push(row);
        }
        this.grid[this.start.y][this.start.x].type = 'start';
        this.grid[this.end.y][this.end.x].type = 'end';
        this.resetPlayback();
    }

    resetPlayback() {
        this.pause();
        this.trace = [];
        this.stepIndex = 0;
        this.visited = [];
        this.frontier = [];
        this.path = [];
        this.stats = { visited: 0, pathLength: 0, time: 0 };
        this.draw();
        this.emitStats(0, 0);
    }

    emitStats(visited, pathLen) {
        if (this.onStatsUpdate) {
            this.onStatsUpdate({ visited, pathLength: pathLen, time: this.stats.time });
        }
    }

    generateObstacles(percentage = 0.28) {
        // 保留起点终点标记
        const s = this.start;
        const e = this.end;

        const place = () => {
            this.initGrid();
            const total = this.rows * this.cols;
            const count = Math.floor(total * percentage);

            for (let i = 0; i < count; i++) {
                const x = Math.floor(Math.random() * this.cols);
                const y = Math.floor(Math.random() * this.rows);
                if (this.grid[y][x].type === 'empty') {
                    this.grid[y][x].type = 'obstacle';
                }
            }

            const clearAround = (cx, cy) => {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows) {
                            if (this.grid[ny][nx].type === 'obstacle') {
                                this.grid[ny][nx].type = 'empty';
                            }
                        }
                    }
                }
            };
            clearAround(s.x, s.y);
            clearAround(e.x, e.y);
        };

        // 保证起点到终点可达，避免生成无解地图
        for (let attempt = 0; attempt < 25; attempt++) {
            place();
            if (this.hasRoute()) break;
        }
        if (!this.hasRoute()) {
            this.grid[e.y][e.x].type = 'end';
            this.corridor();
        }

        this.resetPlayback();
    }

    hasRoute() {
        const seen = new Set([`${this.start.x},${this.start.y}`]);
        const q = [this.start];
        while (q.length) {
            const cur = q.shift();
            if (cur.x === this.end.x && cur.y === this.end.y) return true;
            for (const nb of this.getNeighbors(cur.x, cur.y)) {
                const k = `${nb.x},${nb.y}`;
                if (!seen.has(k)) {
                    seen.add(k);
                    q.push({ x: nb.x, y: nb.y });
                }
            }
        }
        return false;
    }

    corridor() {
        // 从起点向右、向下开一条走廊直达终点
        let x = this.start.x, y = this.start.y;
        while (x !== this.end.x) {
            x += x < this.end.x ? 1 : -1;
            if (this.grid[y][x].type === 'obstacle') this.grid[y][x].type = 'empty';
        }
        while (y !== this.end.y) {
            y += y < this.end.y ? 1 : -1;
            if (this.grid[y][x].type === 'obstacle') this.grid[y][x].type = 'empty';
        }
    }

    setupMouseInteraction() {
        let dragging = false;

        const pos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left - this.offsetX) / this.cellSize);
            const y = Math.floor((e.clientY - rect.top - this.offsetY) / this.cellSize);
            if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) return { x, y };
            return null;
        };

        this.canvas.addEventListener('mousedown', (e) => {
            dragging = true;
            const p = pos(e);
            if (p) this.handlePaint(p.x, p.y);
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (!dragging || e.buttons !== 1) return;
            const p = pos(e);
            if (p && this.drawMode === 'obstacle') this.handlePaint(p.x, p.y);
        });

        window.addEventListener('mouseup', () => { dragging = false; });
    }

    handlePaint(x, y) {
        const cell = this.grid[y][x];
        switch (this.drawMode) {
            case 'obstacle':
                if (cell.type === 'empty') cell.type = 'obstacle';
                else if (cell.type === 'obstacle') cell.type = 'empty';
                break;
            case 'start':
                if (cell.type === 'end') return;
                this.grid[this.start.y][this.start.x].type = 'empty';
                this.start = { x, y };
                cell.type = 'start';
                break;
            case 'end':
                if (cell.type === 'start') return;
                this.grid[this.end.y][this.end.x].type = 'empty';
                this.end = { x, y };
                cell.type = 'end';
                break;
            default:
                return;
        }
        this.resetPlayback();
    }

    /* ============================================================
       绘制
       ============================================================ */

    draw() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.ctx.clearRect(0, 0, rect.width, rect.height);

        if (this.cellSize <= 0) return;

        const visitedSet = new Set(this.visited.map(c => `${c.x},${c.y}`));
        const frontierSet = new Set(this.frontier.map(c => `${c.x},${c.y}`));
        const pathSet = new Set(this.path.map(c => `${c.x},${c.y}`));

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const cell = this.grid[y][x];
                const px = this.offsetX + x * this.cellSize;
                const py = this.offsetY + y * this.cellSize;
                const key = `${x},${y}`;

                let fill = '#1E2A3C';
                let border = '#2E3B50';

                if (cell.type === 'obstacle') {
                    fill = '#4A586F';
                    border = '#5A6A84';
                }

                if (visitedSet.has(key)) {
                    fill = '#3480BE';
                    border = '#4D9BD3';
                }
                if (frontierSet.has(key)) {
                    fill = '#A8812E';
                    border = '#C39B4A';
                }
                if (pathSet.has(key)) {
                    fill = '#F6C05C';
                    border = '#FBD98C';
                }
                if (cell.type === 'start') {
                    fill = '#46D096';
                    border = '#6FE0AE';
                }
                if (cell.type === 'end') {
                    fill = '#F2705F';
                    border = '#F89384';
                }

                this.ctx.fillStyle = fill;
                this.ctx.fillRect(px + 1, py + 1, this.cellSize - 2, this.cellSize - 2);

                this.ctx.strokeStyle = border;
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(px + 0.5, py + 0.5, this.cellSize - 1, this.cellSize - 1);

                if (cell.type === 'start') this.drawLabel(px, py, 'S');
                if (cell.type === 'end') this.drawLabel(px, py, 'E');
            }
        }

        // 路径连线
        if (this.path.length > 1) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = 'rgba(246,192,92,0.95)';
            this.ctx.lineWidth = Math.max(2, this.cellSize / 4);
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';

            this.path.forEach((p, i) => {
                const cx = this.offsetX + p.x * this.cellSize + this.cellSize / 2;
                const cy = this.offsetY + p.y * this.cellSize + this.cellSize / 2;
                if (i === 0) this.ctx.moveTo(cx, cy);
                else this.ctx.lineTo(cx, cy);
            });
            this.ctx.stroke();
        }
    }

    drawLabel(px, py, text) {
        const size = Math.min(this.cellSize * 0.62, 18);
        this.ctx.fillStyle = '#0E1219';
        this.ctx.font = `700 ${size}px Inter, "Segoe UI", sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, px + this.cellSize / 2, py + this.cellSize / 2);
    }

    /* ============================================================
       邻居 / 轨迹生成
       ============================================================ */

    getNeighbors(x, y) {
        const out = [];
        const dirs = [
            [0, -1], [0, 1], [-1, 0], [1, 0],
            [-1, -1], [1, -1], [-1, 1], [1, 1]
        ];
        for (const [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows) continue;
            if (this.grid[ny][nx].type === 'obstacle') continue;
            out.push({ x: nx, y: ny, dx, dy, cost: dx !== 0 && dy !== 0 ? Math.sqrt(2) : 1 });
        }
        return out;
    }

    heuristic(x, y) {
        return Math.sqrt((x - this.end.x) ** 2 + (y - this.end.y) ** 2);
    }

    buildPath(node) {
        const path = [];
        let cur = node;
        while (cur) {
            path.unshift({ x: cur.x, y: cur.y });
            cur = cur.parent;
        }
        return path;
    }

    /**
     * 搜索核心
     * @param {string} algo 算法名
     * @param {boolean} record true → 产出可视化轨迹；false → 只跑算法本身（用于计时）
     */
    search(algo, record) {
        const t0 = performance.now();
        const events = [];
        const startKey = `${this.start.x},${this.start.y}`;
        let visitedCount = 0;
        let foundPath = null;
        let reached = false;
        const times = [];   // 每个访问节点的累计耗时（供回放时逐节点显示）

        const pushVisit = (x, y, frontier) => {
            visitedCount++;
            times.push(performance.now() - t0);
            if (!record) return;
            events.push({ type: 'visit', x, y, frontier: frontier.map(f => ({ x: f.x, y: f.y })) });
        };

        if (algo === 'bfs') {
            const queue = [{ x: this.start.x, y: this.start.y, parent: null }];
            const seen = new Set([startKey]);
            let frontier = [{ x: this.start.x, y: this.start.y }];

            while (queue.length) {
                const cur = queue.shift();
                if (record) frontier = frontier.filter(f => !(f.x === cur.x && f.y === cur.y));
                pushVisit(cur.x, cur.y, frontier);

                if (cur.x === this.end.x && cur.y === this.end.y) {
                    reached = true;
                    if (record) foundPath = this.buildPath(cur);
                    break;
                }

                for (const nb of this.getNeighbors(cur.x, cur.y)) {
                    const key = `${nb.x},${nb.y}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    queue.push({ x: nb.x, y: nb.y, parent: cur });
                    if (record) frontier.push({ x: nb.x, y: nb.y });
                }
            }
        } else if (algo === 'dfs') {
            const stack = [{ x: this.start.x, y: this.start.y, parent: null }];
            const seen = new Set([startKey]);   // 入栈即标记：与递归式 DFS 一致，每格只入栈一次
            let frontier = [{ x: this.start.x, y: this.start.y }];

            while (stack.length) {
                const cur = stack.pop();

                if (record) frontier = frontier.filter(f => !(f.x === cur.x && f.y === cur.y));
                pushVisit(cur.x, cur.y, frontier);

                if (cur.x === this.end.x && cur.y === this.end.y) {
                    reached = true;
                    if (record) foundPath = this.buildPath(cur);
                    break;
                }

                const nbs = this.getNeighbors(cur.x, cur.y);
                // 顺序入栈：最后入栈的邻居（右下）先出栈，优先朝终点方向深入
                for (let i = 0; i < nbs.length; i++) {
                    const nb = nbs[i];
                    const nk = `${nb.x},${nb.y}`;
                    if (!seen.has(nk)) {
                        seen.add(nk);
                        stack.push({ x: nb.x, y: nb.y, parent: cur });
                        if (record) frontier.push({ x: nb.x, y: nb.y });
                    }
                }
            }
        } else if (algo === 'dijkstra') {
            const dist = new Map([[startKey, 0]]);
            const pq = [{ x: this.start.x, y: this.start.y, d: 0, parent: null }];
            let frontier = [{ x: this.start.x, y: this.start.y }];

            while (pq.length) {
                pq.sort((a, b) => a.d - b.d);
                const cur = pq.shift();
                const key = `${cur.x},${cur.y}`;
                if (cur.d > (dist.get(key) ?? Infinity)) continue;

                if (record) frontier = frontier.filter(f => !(f.x === cur.x && f.y === cur.y));
                pushVisit(cur.x, cur.y, frontier);

                if (cur.x === this.end.x && cur.y === this.end.y) {
                    reached = true;
                    if (record) foundPath = this.buildPath(cur);
                    break;
                }

                for (const nb of this.getNeighbors(cur.x, cur.y)) {
                    const nk = `${nb.x},${nb.y}`;
                    const nd = cur.d + nb.cost;
                    if (nd < (dist.get(nk) ?? Infinity)) {
                        dist.set(nk, nd);
                        pq.push({ x: nb.x, y: nb.y, d: nd, parent: cur });
                        if (record && !frontier.some(f => f.x === nb.x && f.y === nb.y)) {
                            frontier.push({ x: nb.x, y: nb.y });
                        }
                    }
                }
            }
        } else if (algo === 'astar') {
            const g = new Map([[startKey, 0]]);
            const pq = [{ x: this.start.x, y: this.start.y, g: 0, f: this.heuristic(this.start.x, this.start.y), parent: null }];
            let frontier = [{ x: this.start.x, y: this.start.y }];

            while (pq.length) {
                pq.sort((a, b) => a.f - b.f);
                const cur = pq.shift();
                const key = `${cur.x},${cur.y}`;
                if (cur.g > (g.get(key) ?? Infinity)) continue;

                if (record) frontier = frontier.filter(f => !(f.x === cur.x && f.y === cur.y));
                pushVisit(cur.x, cur.y, frontier);

                if (cur.x === this.end.x && cur.y === this.end.y) {
                    reached = true;
                    if (record) foundPath = this.buildPath(cur);
                    break;
                }

                for (const nb of this.getNeighbors(cur.x, cur.y)) {
                    const nk = `${nb.x},${nb.y}`;
                    const ng = cur.g + nb.cost;
                    if (ng < (g.get(nk) ?? Infinity)) {
                        g.set(nk, ng);
                        pq.push({
                            x: nb.x, y: nb.y, g: ng,
                            f: ng + this.heuristic(nb.x, nb.y),
                            parent: cur
                        });
                        if (record && !frontier.some(f => f.x === nb.x && f.y === nb.y)) {
                            frontier.push({ x: nb.x, y: nb.y });
                        }
                    }
                }
            }
        }

        if (record && foundPath) {
            events.push({ type: 'path', path: foundPath.map(p => ({ x: p.x, y: p.y })) });
        }

        return {
            events,
            found: reached,
            pathLength: foundPath ? foundPath.length - 1 : -1,
            visitedCount,
            times,
            elapsed: performance.now() - t0
        };
    }

    /* ============================================================
       回放控制
       ============================================================ */

    prepare(algo) {
        this.pause();
        // 纯搜索一遍：取它每个节点的真实累计耗时（不含轨迹记录开销）
        const pure = this.search(algo, false);
        // 再跑一遍带轨迹的，用于动画回放；两者步骤一一对应
        const traced = this.search(algo, true);
        traced.events.forEach((ev, i) => {
            ev.elapsed = i < pure.times.length ? pure.times[i] : pure.elapsed;
        });

        this.trace = traced.events;
        this.stepIndex = 0;
        this.visited = [];
        this.frontier = [];
        this.path = [];
        this.stats = {
            visited: traced.visitedCount,
            pathLength: traced.pathLength,
            time: 0          // 随回放逐节点刷新
        };
        this.draw();
        return this.trace.length;
    }

    stepForward() {
        if (this.stepIndex >= this.trace.length) return false;

        const ev = this.trace[this.stepIndex++];

        if (ev.type === 'visit') {
            this.visited.push({ x: ev.x, y: ev.y });
            this.frontier = ev.frontier || [];
        } else if (ev.type === 'path') {
            this.path = ev.path;
        }
        if (ev.elapsed !== undefined) this.stats.time = ev.elapsed;   // 实时累计耗时

        this.draw();
        this.emitStats(this.visited.length, this.path.length ? this.path.length - 1 : -1);

        const done = this.stepIndex >= this.trace.length;
        if (done && this.onFinish) this.onFinish(!!this.path.length);
        return !done;
    }

    play() {
        if (this.isPlaying) return;
        if (this.stepIndex >= this.trace.length) return;
        this.isPlaying = true;
        const tick = () => {
            if (!this.isPlaying) return;
            const more = this.stepForward();
            if (!more) {
                this.isPlaying = false;
                return;
            }
            this.playTimer = setTimeout(tick, this.speed);
        };
        tick();
    }

    pause() {
        this.isPlaying = false;
        if (this.playTimer) {
            clearTimeout(this.playTimer);
            this.playTimer = null;
        }
    }

    setSpeed(speed) {
        this.speed = Math.max(10, speed);
    }
}

/* ============================================================
   同步基准测试（用于复杂度对比，不依赖动画）
   ============================================================ */
/* 生成一张基准地图；四个算法共用同一张地图，横向对比才公平 */
function createBenchmarkGrid(cols, rows, obstacleRatio) {
    const grid = [];
    for (let y = 0; y < rows; y++) {
        const row = [];
        for (let x = 0; x < cols; x++) row.push(Math.random() < obstacleRatio);
        grid.push(row);
    }
    grid[1][1] = false;
    grid[rows - 2][cols - 2] = false;
    return grid;
}

/* 最小二叉堆：Dijkstra / A* 必须用真正的优先队列，
   否则每次 sort() 的开销会被算进「算法耗时」 */
function makeMinHeap() {
    const heap = [];
    const swap = (i, j) => { const t = heap[i]; heap[i] = heap[j]; heap[j] = t; };
    return {
        size: () => heap.length,
        push(node) {
            heap.push(node);
            let i = heap.length - 1;
            while (i > 0) {
                const p = (i - 1) >> 1;
                if (heap[p].pri <= heap[i].pri) break;
                swap(p, i);
                i = p;
            }
        },
        pop() {
            const top = heap[0];
            const last = heap.pop();
            if (heap.length) {
                heap[0] = last;
                let i = 0;
                for (;;) {
                    const l = 2 * i + 1, r = l + 1;
                    let m = i;
                    if (l < heap.length && heap[l].pri < heap[m].pri) m = l;
                    if (r < heap.length && heap[r].pri < heap[m].pri) m = r;
                    if (m === i) break;
                    swap(m, i);
                    i = m;
                }
            }
            return top;
        }
    };
}

function benchmarkPathfinding(algo, cols = 60, rows = 40, obstacleRatio = 0.25, sharedGrid = null) {
    const grid = sharedGrid || createBenchmarkGrid(cols, rows, obstacleRatio);
    rows = grid.length;
    cols = grid[0].length;
    const start = { x: 1, y: 1 };
    const end = { x: cols - 2, y: rows - 2 };

    const neighbors = (x, y) => {
        const out = [];
        const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (const [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
            if (grid[ny][nx]) continue;
            out.push({ x: nx, y: ny, cost: dx !== 0 && dy !== 0 ? Math.sqrt(2) : 1 });
        }
        return out;
    };
    const h = (x, y) => Math.sqrt((x - end.x) ** 2 + (y - end.y) ** 2);

    let visitedCount = 0;
    const parent = new Map();
    let endReached = false;
    const t0 = performance.now();

    if (algo === 'bfs') {
        const q = [{ x: start.x, y: start.y }];
        const seen = new Set([`${start.x},${start.y}`]);
        let head = 0;                 // 用下标推进代替 shift()，避免 O(n) 搬移污染耗时
        while (head < q.length) {
            const cur = q[head++];
            visitedCount++;
            if (cur.x === end.x && cur.y === end.y) { endReached = true; break; }
            for (const nb of neighbors(cur.x, cur.y)) {
                const k = `${nb.x},${nb.y}`;
                if (!seen.has(k)) { seen.add(k); parent.set(k, `${cur.x},${cur.y}`); q.push(nb); }
            }
        }
    } else if (algo === 'dfs') {
        const st = [{ x: start.x, y: start.y }];
        const seen = new Set([`${start.x},${start.y}`]);   // 入栈即标记：每格只入栈一次，parent 一定合法
        while (st.length) {
            const cur = st.pop();
            const k = `${cur.x},${cur.y}`;
            visitedCount++;
            if (cur.x === end.x && cur.y === end.y) { endReached = true; break; }
            for (const nb of neighbors(cur.x, cur.y)) {
                const nk = `${nb.x},${nb.y}`;
                if (seen.has(nk)) continue;
                seen.add(nk);
                parent.set(nk, k);
                st.push(nb);
            }
        }
    } else if (algo === 'dijkstra') {
        const dist = new Map([[`${start.x},${start.y}`, 0]]);
        const pq = makeMinHeap();
        pq.push({ x: start.x, y: start.y, d: 0, pri: 0 });
        while (pq.size()) {
            const cur = pq.pop();
            const k = `${cur.x},${cur.y}`;
            if (cur.d > (dist.get(k) ?? Infinity)) continue;
            visitedCount++;
            if (cur.x === end.x && cur.y === end.y) { endReached = true; break; }
            for (const nb of neighbors(cur.x, cur.y)) {
                const nk = `${nb.x},${nb.y}`;
                const nd = cur.d + nb.cost;
                if (nd < (dist.get(nk) ?? Infinity)) {
                    dist.set(nk, nd);
                    parent.set(nk, k);
                    pq.push({ x: nb.x, y: nb.y, d: nd, pri: nd });
                }
            }
        }
    } else if (algo === 'astar') {
        const g = new Map([[`${start.x},${start.y}`, 0]]);
        const pq = makeMinHeap();
        pq.push({ x: start.x, y: start.y, g: 0, pri: h(start.x, start.y) });
        while (pq.size()) {
            const cur = pq.pop();
            const k = `${cur.x},${cur.y}`;
            if (cur.g > (g.get(k) ?? Infinity)) continue;
            visitedCount++;
            if (cur.x === end.x && cur.y === end.y) { endReached = true; break; }
            for (const nb of neighbors(cur.x, cur.y)) {
                const nk = `${nb.x},${nb.y}`;
                const ng = cur.g + nb.cost;
                if (ng < (g.get(nk) ?? Infinity)) {
                    g.set(nk, ng);
                    parent.set(nk, k);
                    pq.push({ x: nb.x, y: nb.y, g: ng, pri: ng + h(nb.x, nb.y) });
                }
            }
        }
    }

    const elapsed = performance.now() - t0;   // 只计搜索本身，路径回溯不计入

    // 回溯路径长度
    let pathLen = -1;
    if (endReached) {
        pathLen = 0;
        let cur = `${end.x},${end.y}`;
        while (parent.has(cur)) {
            cur = parent.get(cur);
            pathLen++;
        }
    }

    return { time: elapsed, visits: visitedCount, pathLen };
}

/* ============================================================
   算法元数据
   ============================================================ */
const GRAPH_ALGORITHMS = {
    bfs: {
        name: '广度优先搜索 BFS',
        time: 'O(V + E)',
        timeBest: 'O(V + E)',
        space: 'O(V)',
        description: '广度优先搜索逐层向外扩展，使用队列保存待访问节点。它会先访问离起点最近的节点，再访问下一层。在无权图中，BFS 首次到达终点时的路径一定是最短路径。',
        pseudoCode: `function BFS(start, end):
    queue = [start]
    seen  = {start}
    parent = {start: null}

    while queue not empty:
        node = queue.dequeue()
        if node == end:
            return reconstructPath(parent, node)

        for nb in neighbors(node):
            if nb not in seen:
                seen.add(nb)
                parent[nb] = node
                queue.enqueue(nb)

    return null   // 无可行路径`,
        jsCode: `function bfs(grid, start, end) {
    const queue  = [start];
    const seen   = new Set([key(start)]);
    const parent = new Map([[key(start), null]]);

    while (queue.length) {
        const node = queue.shift();
        if (node.x === end.x && node.y === end.y) {
            return reconstruct(parent, node);
        }
        for (const nb of neighbors(grid, node)) {
            const k = key(nb);
            if (seen.has(k)) continue;
            seen.add(k);
            parent.set(k, node);
            queue.push(nb);
        }
    }
    return null;
}`
    },
    dfs: {
        name: '深度优先搜索 DFS',
        time: 'O(V + E)',
        timeBest: 'O(V + E)',
        space: 'O(V)',
        description: '深度优先搜索沿一条路径尽量深入，走不通时回溯。它使用栈（或递归）保存访问历史，节点在入栈时即标记为已发现，行为与递归式 DFS 完全一致。DFS 实现简单、内存占用小，但不保证找到最短路径，在开阔地图上容易绕远。',
        pseudoCode: `function DFS(start, end):
    stack  = [start]
    seen   = {start}          // 入栈即标记，每格最多入栈一次
    parent = {start: null}

    while stack not empty:
        node = stack.pop()

        if node == end:
            return reconstructPath(parent, node)

        for nb in neighbors(node):
            if nb not in seen:
                seen.add(nb)   // 等价于递归版的 visited 标记
                parent[nb] = node
                stack.push(nb)

    return null`,
        jsCode: `function dfs(grid, start, end) {
    const stack  = [start];
    const seen   = new Set([key(start)]);   // 起点先标记
    const parent = new Map([[key(start), null]]);

    while (stack.length) {
        const node = stack.pop();

        if (node.x === end.x && node.y === end.y) {
            return reconstruct(parent, node);
        }
        for (const nb of neighbors(grid, node)) {
            const k = key(nb);
            if (seen.has(k)) continue;
            seen.add(k);              // 入栈时标记，避免同一格被重复压栈
            parent.set(k, node);
            stack.push(nb);
        }
    }
    return null;
}`
    },
    dijkstra: {
        name: 'Dijkstra 最短路径',
        time: 'O((V+E)log V)',
        timeBest: 'O((V+E)log V)',
        space: 'O(V)',
        description: 'Dijkstra 算法用于带权图的最短路径。它维护每个节点的当前最短距离，每次从优先队列取出距离最小的未确定节点，并用它松弛邻居。适用于所有边权非负的图，对角移动被赋予更高的代价。',
        pseudoCode: `function Dijkstra(start, end):
    dist   = {n: INF for n in graph}
    dist[start] = 0
    pq     = PriorityQueue([(0, start)])
    parent = {}

    while pq not empty:
        (d, u) = pq.extractMin()
        if u == end: break
        if d > dist[u]: continue

        for (v, w) in neighbors(u):
            nd = d + w
            if nd < dist[v]:
                dist[v]   = nd
                parent[v] = u
                pq.insert((nd, v))

    return reconstructPath(parent, end)`,
        jsCode: `function dijkstra(grid, start, end) {
    const dist   = new Map([[key(start), 0]]);
    const parent = new Map();
    const pq     = [{ node: start, d: 0 }];

    while (pq.length) {
        pq.sort((a, b) => a.d - b.d);
        const { node: u, d } = pq.shift();
        if (u.x === end.x && u.y === end.y) break;
        if (d > (dist.get(key(u)) ?? Infinity)) continue;

        for (const v of neighbors(grid, u)) {
            const nd = d + v.cost;
            if (nd < (dist.get(key(v)) ?? Infinity)) {
                dist.set(key(v), nd);
                parent.set(key(v), u);
                pq.push({ node: v, d: nd });
            }
        }
    }
    return reconstruct(parent, end);
}`
    },
    astar: {
        name: 'A* 启发式搜索',
        time: 'O((V+E)log V)',
        timeBest: 'O(E)',
        space: 'O(V)',
        description: 'A* 在 Dijkstra 基础上加入启发函数 h(n)（这里用欧几里得距离），用 f = g + h 排序优先队列，优先探索更接近终点的方向。在启发函数可采纳时可保证最优，同时访问节点数通常远少于 Dijkstra。',
        pseudoCode: `function AStar(start, end):
    g      = {start: 0}
    f      = {start: h(start)}
    pq     = PriorityQueue([start])
    parent = {}

    while pq not empty:
        u = pq.extractMinBy(f)
        if u == end:
            return reconstructPath(parent, u)

        for (v, w) in neighbors(u):
            ng = g[u] + w
            if ng < g.get(v, INF):
                parent[v] = u
                g[v] = ng
                f[v] = ng + h(v)
                pq.insert(v)

    return null`,
        jsCode: `function astar(grid, start, end) {
    const g      = new Map([[key(start), 0]]);
    const parent = new Map();
    const h      = (n) => Math.hypot(n.x - end.x, n.y - end.y);
    const pq     = [{ node: start, f: h(start) }];

    while (pq.length) {
        pq.sort((a, b) => a.f - b.f);
        const { node: u } = pq.shift();
        if (u.x === end.x && u.y === end.y) break;

        for (const v of neighbors(grid, u)) {
            const ng = g.get(key(u)) + v.cost;
            if (ng < (g.get(key(v)) ?? Infinity)) {
                g.set(key(v), ng);
                parent.set(key(v), u);
                pq.push({ node: v, f: ng + h(v) });
            }
        }
    }
    return reconstruct(parent, end);
}`
    }
};

window.PathfindingVisualizer = PathfindingVisualizer;
window.GRAPH_ALGORITHMS = GRAPH_ALGORITHMS;
window.benchmarkPathfinding = benchmarkPathfinding;
window.createBenchmarkGrid = createBenchmarkGrid;
