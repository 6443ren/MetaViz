/**
 * 算法可视化教学平台 — 主应用逻辑
 *
 * 统一控制模型：
 *   sorting  → 步骤队列（比较/交换/赋值）
 *   tree     → 遍历轨迹回放（前/中/后/层序），插入删除查找为渐进动画
 *   graph    → 搜索轨迹回放（BFS/DFS/Dijkstra/A*）
 * 三个模块共用同一组「播放 / 暂停 / 单步 / 重置」按钮与速度滑块。
 */

(function () {
    'use strict';

    /* ============================================================
       状态
       ============================================================ */
    const state = {
        module: 'sorting',
        sortAlgo: 'bubble',
        graphAlgo: 'bfs',
        size: 20,
        preset: 'random',
        delay: 51          // 毫秒
    };

    /* ============================================================
       DOM 快捷方式
       ============================================================ */
    const $ = (id) => document.getElementById(id);

    const el = {
        algoSelector: $('algorithmSelector'),
        btnPlay: $('btnPlay'),
        btnPause: $('btnPause'),
        btnStep: $('btnStep'),
        btnReset: $('btnReset'),
        speedSlider: $('speedSlider'),
        speedValue: $('speedValue'),
        dataSize: $('dataSize'),
        dataSizeValue: $('dataSizeValue'),
        btnGenerate: $('btnGenerate'),
        presets: document.querySelectorAll('.preset-btn'),
        compareList: $('complexityCompare'),
        btnCompare: $('btnCompare'),
        codeBlock: $('codeBlock'),
        modal: $('compareModal')
    };

    /* ============================================================
       实例化
       ============================================================ */
    const ICON_SHUFFLE = '<span class="btn-icon"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true">'
        + '<path d="M3.5 8.5h13M13.5 5.5l3 3-3 3M20.5 15.5h-13M10.5 12.5l-3 3 3 3"/></svg></span>';

    const ICON_TREE = '<span class="btn-icon"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true">'
        + '<circle cx="12" cy="5.2" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="18" r="2.2"/>'
        + '<path d="M12 7.4v4.1M12 11.5H6v4.3M12 11.5h6v4.3"/></svg></span>';

    const sorting = new SortingAlgorithm($('sortingCanvas'));
    const tree = new BinaryTreeVisualizer($('treeCanvas'));
    const graph = new PathfindingVisualizer($('graphCanvas'));

    let codeTab = 'pseudo';
    let codePseudo = '';
    let codeJs = '';

    /* ============================================================
       排序模块
       ============================================================ */
    sorting.onStatsUpdate = (s) => {
        $('sortComparisons').textContent = s.comparisons;
        $('sortSwaps').textContent = s.swaps;
        $('sortStep').textContent = `${s.step} / ${s.totalSteps}`;
    };

    sorting.onStepInfo = ({ text, tone }) => setStepInfo(text, tone);

    function setStepInfo(text, tone = 'idle') {
        const box = $('sortStepInfo');
        if (!box) return;
        box.dataset.tone = tone;
        box.querySelector('.step-text').textContent = text;
    }

    sorting.onStepChange = (hasMore) => {
        el.btnPlay.disabled = !hasMore;
        el.btnStep.disabled = !hasMore;
        el.btnPause.disabled = !hasMore;
    };

    function prepareSorting(keepValues) {
        sorting.pause();
        if (!keepValues || !sorting.initialData.length) {
            sorting.generateData(state.size, state.preset);
        } else {
            sorting.data = [...sorting.initialData];
        }
        sorting.runAlgorithm(state.sortAlgo);
        sorting.draw();
        sorting.updateStats();
        setStepInfo('准备就绪 — 点击「播放」开始演示', 'idle');
        el.btnPlay.disabled = false;
        el.btnStep.disabled = false;
        el.btnPause.disabled = true;
    }

    function updateSortingPanel() {
        const meta = SORTING_ALGORITHMS[state.sortAlgo];

        $('sortingTitle').textContent = meta.name;
        $('sortingDesc').textContent = meta.description;

        const levelFor = (v) => {
            if (/n²|n\^2/.test(v)) return 'bad';
            if (/log n/.test(v)) return 'good';
            return 'medium';
        };

        $('sortingComplexity').innerHTML = [
            `<div class="complexity-item ${levelFor(meta.timeBest)}"><div class="label">最好</div><div class="value">${meta.timeBest}</div></div>`,
            `<div class="complexity-item ${levelFor(meta.timeAvg)}"><div class="label">平均</div><div class="value">${meta.timeAvg}</div></div>`,
            `<div class="complexity-item ${levelFor(meta.timeWorst)}"><div class="label">最坏</div><div class="value">${meta.timeWorst}</div></div>`,
            `<div class="complexity-item medium"><div class="label">空间</div><div class="value">${meta.space}</div></div>`,
            `<div class="complexity-item ${meta.stable ? 'good' : 'medium'}"><div class="label">稳定性</div><div class="value">${meta.stable ? '稳定' : '不稳定'}</div></div>`
        ].join('');

        setCode(meta.pseudoCode, meta.jsCode);
        renderSortingSelector();
    }

    function renderSortingSelector() {
        el.algoSelector.innerHTML = '';
        Object.entries(SORTING_ALGORITHMS).forEach(([key, meta]) => {
            const btn = document.createElement('button');
            btn.className = 'algo-btn' + (key === state.sortAlgo ? ' active' : '');
            btn.innerHTML = `<span>${meta.name}</span><span class="algo-complexity">${meta.timeAvg}</span>`;
            btn.onclick = () => {
                state.sortAlgo = key;
                prepareSorting(true);
                updateSortingPanel();
                renderCompareList();
            };
            el.algoSelector.appendChild(btn);
        });
    }

    /* ============================================================
       二叉树模块
       ============================================================ */
    window.treeStatsCallback = (s) => {
        $('treeNodeCount').textContent = s.count;
        $('treeHeight').textContent = s.height;
        $('treeBalanced').textContent = s.balanced ? '平衡' : '不平衡';
        $('treeBalanced').style.color = s.balanced ? 'var(--secondary)' : 'var(--danger)';
    };

    function renderTreeSelector() {
        el.algoSelector.innerHTML = '';
        const btn = document.createElement('div');
        btn.className = 'algo-btn active';
        btn.style.cursor = 'default';
        btn.innerHTML = `<span>二叉搜索树 BST</span><span class="algo-complexity">O(log n)</span>`;
        el.algoSelector.appendChild(btn);
    }

    function updateTreePanel() {
        const meta = TREE_ALGORITHMS.bst;
        setCode(meta.pseudoCode, meta.jsCode);
        renderTreeSelector();

        $('treeStats').innerHTML = `
            <span>节点数 <strong id="treeNodeCount">${tree.getNodeCount()}</strong></span>
            <span>树高度 <strong id="treeHeight">${tree.getHeight()}</strong></span>
            <span>是否平衡 <strong id="treeBalanced">${tree.isBalanced() ? '平衡' : '不平衡'}</strong></span>
        `;
    }

    $('btnTreeInsert').onclick = async () => {
        const input = $('treeInputValue');
        const v = parseInt(input.value, 10);
        if (Number.isNaN(v) || v < 0 || v > 999) {
            flashResult('请输入 0–999 之间的整数');
            return;
        }
        input.value = '';
        const ok = await tree.insert(v);
        flashResult(ok ? `已插入 ${v}` : `${v} 已存在，未重复插入`);
        syncTreeButtons();
    };

    $('btnTreeDelete').onclick = async () => {
        const input = $('treeInputValue');
        const v = parseInt(input.value, 10);
        if (Number.isNaN(v)) {
            flashResult('请输入要删除的数值');
            return;
        }
        input.value = '';
        const ok = await tree.delete(v);
        flashResult(ok ? `已删除 ${v}` : `未找到 ${v}`);
        syncTreeButtons();
    };

    $('btnTreeSearch').onclick = async () => {
        const input = $('treeInputValue');
        const v = parseInt(input.value, 10);
        if (Number.isNaN(v)) {
            flashResult('请输入要查找的数值');
            return;
        }
        input.value = '';
        const node = await tree.search(v);
        flashResult(node
            ? `命中 ${v}，访问路径: ${tree.searchPath.join(' → ')}`
            : `未命中，访问路径: ${tree.searchPath.join(' → ')}`);
    };

    function flashResult(text) {
        $('treeTraversalResult').textContent = text;
    }

    document.querySelectorAll('.traversal-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.traversal-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const type = btn.dataset.traversal;
            const names = { preorder: '前序', inorder: '中序', postorder: '后序', levelorder: '层序' };

            if (!tree.root) {
                flashResult('树为空，请先插入节点');
                return;
            }

            state.traversalType = type;
            tree.prepareTraversal(type);
            tree.onFinish = (values) => {
                flashResult(`${names[type]}遍历: [ ${values.join(', ')} ]`);
                el.btnPlay.disabled = false;
                el.btnStep.disabled = true;
                el.btnPause.disabled = true;
            };

            flashResult(`${names[type]}遍历已就绪 — 点击「播放」或「单步」`);
            el.btnPlay.disabled = false;
            el.btnStep.disabled = false;
            el.btnPause.disabled = true;
        };
    });

    function syncTreeButtons() {
        el.btnPlay.disabled = true;
        el.btnStep.disabled = true;
        el.btnPause.disabled = true;
    }

    /* ============================================================
       图寻路模块
       ============================================================ */
    graph.onStatsUpdate = (s) => {
        $('graphVisited').textContent = s.visited;
        if (s.pathLength > 0) {
            $('graphPath').textContent = s.pathLength;
        } else {
            $('graphPath').textContent = state.graphFinished ? '无路径' : '-';
        }
        const t = s.time;
        $('graphTime').textContent = t < 1 ? (t * 1000).toFixed(1) + 'µs' : t.toFixed(2) + 'ms';
    };

    graph.onFinish = (found) => {
        state.graphFinished = true;
        $('graphPath').textContent = found ? graph.stats.pathLength : '无路径';
        setButtons(false);
        el.btnPause.disabled = true;
    };

    function renderGraphSelector() {
        el.algoSelector.innerHTML = '';
        Object.entries(GRAPH_ALGORITHMS).forEach(([key, meta]) => {
            const btn = document.createElement('button');
            btn.className = 'algo-btn' + (key === state.graphAlgo ? ' active' : '');
            btn.innerHTML = `<span>${meta.name}</span><span class="algo-complexity">${meta.time}</span>`;
            btn.onclick = () => {
                state.graphAlgo = key;
                updateGraphPanel();
                prepareGraph();
            };
            el.algoSelector.appendChild(btn);
        });
    }

    function updateGraphPanel() {
        const meta = GRAPH_ALGORITHMS[state.graphAlgo];
        $('graphTitle').textContent = meta.name;
        $('graphDesc').textContent = meta.description;
        setCode(meta.pseudoCode, meta.jsCode);
        renderGraphSelector();
        updateGraphEndpoints();
    }

    function updateGraphEndpoints() {
        $('graphStart').textContent = `(${graph.start.x}, ${graph.start.y})`;
        $('graphEnd').textContent = `(${graph.end.x}, ${graph.end.y})`;
    }

    function prepareGraph() {
        graph.prepare(state.graphAlgo);
        state.graphPrepared = true;
        state.graphFinished = false;
        el.btnPlay.disabled = graph.trace.length === 0;
        el.btnStep.disabled = graph.trace.length === 0;
        el.btnPause.disabled = true;
        graph.emitStats(0, -1);   // 直接显示本次搜索的真实耗时，而非固定值
    }

    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            graph.drawMode = btn.dataset.mode;
        };
    });

    /* 点击/拖拽画布后重置回放状态 */
    const originalPaint = graph.handlePaint.bind(graph);
    graph.handlePaint = (x, y) => {
        originalPaint(x, y);
        state.graphPrepared = false;
        state.graphFinished = false;
        el.btnPlay.disabled = false;
        el.btnStep.disabled = false;
        updateGraphEndpoints();
        $('graphPath').textContent = '-';
        $('graphVisited').textContent = '0';
        $('graphTime').textContent = '0ms';
    };

    /* 原地重写 drawMode 的 setter，保证外部操作同步 */
    graph.setMode = (mode) => { graph.drawMode = mode; };

    /* ============================================================
       统一播放控制
       ============================================================ */
    function setButtons(playing) {
        el.btnPlay.disabled = playing;
        el.btnPause.disabled = !playing;
        el.btnStep.disabled = playing;
    }

    el.btnPlay.onclick = () => {
        if (state.module === 'sorting') {
            if (sorting.currentStepIndex >= sorting.steps.length) {
                prepareSorting(true);
            }
            sorting.play();
            setButtons(true);
        } else if (state.module === 'binarytree') {
            if (tree.stepIndex >= tree.trace.length && tree.trace.length > 0) {
                // 已播放完毕，从头开始
                tree.prepareTraversal(state.traversalType || 'inorder');
            }
            if (tree.trace.length === 0) {
                flashResult('请先点击上方某个遍历方式');
                return;
            }
            tree.play();
            setButtons(true);
        } else if (state.module === 'graph') {
            if (!state.graphPrepared || graph.stepIndex >= graph.trace.length) {
                prepareGraph();
            }
            graph.play();
            setButtons(true);
        }
    };

    el.btnPause.onclick = () => {
        sorting.pause();
        tree.pause();
        graph.pause();
        setButtons(false);
        el.btnPlay.disabled = false;
        el.btnStep.disabled = false;
    };

    el.btnStep.onclick = () => {
        if (state.module === 'sorting') {
            if (sorting.currentStepIndex >= sorting.steps.length) prepareSorting(true);
            sorting.pause();
            const more = sorting.stepForward();
            el.btnPlay.disabled = !more;
            el.btnStep.disabled = !more;
            el.btnPause.disabled = true;
        } else if (state.module === 'binarytree') {
            if (tree.trace.length === 0) {
                flashResult('请先点击上方某个遍历方式');
                return;
            }
            tree.pause();
            const more = tree.stepForward();
            el.btnPlay.disabled = !more;
            el.btnStep.disabled = !more;
        } else if (state.module === 'graph') {
            if (!state.graphPrepared || graph.stepIndex >= graph.trace.length) prepareGraph();
            graph.pause();
            const more = graph.stepForward();
            el.btnPlay.disabled = !more;
            el.btnStep.disabled = !more;
        }
    };

    el.btnReset.onclick = () => {
        sorting.pause();
        tree.pause();
        graph.pause();

        if (state.module === 'sorting') {
            prepareSorting(true);
        } else if (state.module === 'binarytree') {
            tree.resetTraversal();
            flashResult('已清除遍历高亮（树结构保留）');
            el.btnPlay.disabled = true;
            el.btnStep.disabled = true;
        } else if (state.module === 'graph') {
            graph.resetPlayback();
            state.graphPrepared = false;
            $('graphPath').textContent = '-';
            $('graphVisited').textContent = '0';
            $('graphTime').textContent = '0ms';
            el.btnPlay.disabled = false;
            el.btnStep.disabled = false;
        }
        el.btnPause.disabled = true;
        setButtons(false);
    };

    /* 速度滑块：1 → 600ms（最慢），100 → 15ms（最快），指数分布便于慢速端微调 */
    function sliderToDelay(v) {
        return Math.round(600 * Math.pow(15 / 600, (v - 1) / 99));
    }

    function applySpeed(value) {
        state.delay = sliderToDelay(value);
        el.speedValue.textContent = state.delay + 'ms';

        sorting.setSpeed(state.delay);
        // 网格节点多，单步节奏相应加快；树动画放慢便于观察
        graph.setSpeed(Math.max(8, Math.min(120, Math.round(state.delay * 0.4))));
        tree.setSpeed(Math.max(140, Math.round(state.delay * 1.3)));
    }

    el.speedSlider.oninput = (e) => applySpeed(parseInt(e.target.value, 10));

    /* 数据规模 */
    el.dataSize.oninput = (e) => {
        state.size = parseInt(e.target.value, 10);
        updateSizeLabel();
    };

    function updateSizeLabel() {
        if (state.module === 'graph') {
            $('dataLabel').textContent = '障碍密度';
            el.dataSizeValue.textContent = state.size + '%';
        } else if (state.module === 'binarytree') {
            $('dataLabel').textContent = '节点数量';
            el.dataSizeValue.textContent = state.size;
        } else {
            $('dataLabel').textContent = '数据规模';
            el.dataSizeValue.textContent = state.size;
        }
    }

    el.btnGenerate.onclick = () => {
        if (state.module === 'sorting') {
            prepareSorting(false);
        } else if (state.module === 'binarytree') {
            tree.generateRandomTree(state.size);
            flashResult('已生成随机二叉搜索树');
            el.btnPlay.disabled = true;
            el.btnStep.disabled = true;
        } else if (state.module === 'graph') {
            graph.generateObstacles(state.size / 100);
            state.graphPrepared = false;
            $('graphPath').textContent = '-';
            $('graphVisited').textContent = '0';
            $('graphTime').textContent = '0ms';
            el.btnPlay.disabled = false;
            el.btnStep.disabled = false;
        }
    };

    el.presets.forEach(btn => {
        btn.onclick = () => {
            if (state.module !== 'sorting') return;
            state.preset = btn.dataset.preset;
            prepareSorting(false);
        };
    });

    /* ============================================================
       模块切换
       ============================================================ */
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.onclick = () => switchModule(tab.dataset.module);
    });

    const MODULE_VIEW = {
        sorting: 'sortingModule',
        binarytree: 'binarytreeModule',
        graph: 'graphModule'
    };

    function switchModule(mod) {
        if (state.module === mod) return;

        sorting.pause();
        tree.pause();
        graph.pause();
        state.module = mod;

        document.querySelectorAll('.nav-tab').forEach(t =>
            t.classList.toggle('active', t.dataset.module === mod)
        );

        Object.entries(MODULE_VIEW).forEach(([k, id]) =>
            $(id).classList.toggle('active', k === mod)
        );

        // 侧栏适配
        const presetWrap = document.querySelector('.data-presets');
        if (mod === 'sorting') {
            el.dataSize.min = 5; el.dataSize.max = 50;
            if (presetWrap) presetWrap.style.display = '';
            $('btnGenerate').innerHTML = ICON_SHUFFLE + ' 生成新数据';
            updateSortingPanel();
            renderCompareList();
            el.btnPlay.disabled = false;
            el.btnStep.disabled = false;
        } else if (mod === 'binarytree') {
            el.dataSize.min = 3; el.dataSize.max = 30;
            if (presetWrap) presetWrap.style.display = 'none';
            $('btnGenerate').innerHTML = ICON_TREE + ' 生成随机树';
            updateTreePanel();
            renderCompareList();
            syncTreeButtons();
            if (tree.root === null && tree.getNodeCount() === 0) {
                // 首次进入给出一棵示例树
                tree.generateRandomTree(state.size);
            }
        } else {
            el.dataSize.min = 10; el.dataSize.max = 45;
            if (presetWrap) presetWrap.style.display = 'none';
            $('btnGenerate').innerHTML = ICON_SHUFFLE + ' 随机障碍';
            // 首次进入时生成一张有障碍的地图
            if (!graph.grid.some(row => row.some(c => c.type === 'obstacle'))) {
                graph.generateObstacles(state.size / 100);
            }
            updateGraphPanel();
            renderCompareList();
            state.graphPrepared = false;
            el.btnPlay.disabled = false;
            el.btnStep.disabled = false;
        }

        el.btnPause.disabled = true;
        setButtons(false);
        updateSizeLabel();
        if (mod === 'binarytree' && tree.trace.length === 0) {
            syncTreeButtons();
        }

        // 画布尺寸在模块显示后才正确，重新计算
        setTimeout(() => {
            sorting.resize();
            tree.resize();
            graph.resize();
        }, 40);
    }

    /* ============================================================
       代码面板
       ============================================================ */
    function setCode(pseudo, js) {
        codePseudo = pseudo;
        codeJs = js;
        refreshCode();
    }

    function refreshCode() {
        el.codeBlock.textContent = codeTab === 'pseudo' ? codePseudo : codeJs;
    }

    document.querySelectorAll('.code-tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.code-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            codeTab = tab.dataset.lang;
            refreshCode();
        };
    });

    /* ============================================================
       复杂度对比列表
       ============================================================ */
    function renderCompareList() {
        const items = [];

        if (state.module === 'sorting') {
            Object.entries(SORTING_ALGORITHMS).forEach(([k, m]) => {
                items.push({ key: k, name: m.name, value: m.timeAvg, active: k === state.sortAlgo, clickable: true });
            });
        } else if (state.module === 'graph') {
            Object.entries(GRAPH_ALGORITHMS).forEach(([k, m]) => {
                items.push({ key: k, name: m.name.replace('搜索', '').replace('最短路径', '').trim(), value: m.time, active: k === state.graphAlgo, clickable: true });
            });
        } else {
            Object.values(TREE_ALGORITHMS.bst.complexities).forEach(c => {
                items.push({ name: c.name, value: c.time, active: false, clickable: false });
            });
        }

        el.compareList.innerHTML = '';
        items.forEach(it => {
            const chip = document.createElement('div');
            chip.className = 'compare-chip'
                + (it.active ? ' active' : '')
                + (it.clickable ? ' clickable' : '');
            chip.innerHTML = `<span>${it.name}</span><span class="mono">${it.value}</span>`;
            if (it.clickable) {
                chip.title = '点击切换到该算法';
                chip.onclick = () => selectAlgorithm(it.key);
            }
            el.compareList.appendChild(chip);
        });
    }

    /* 点击对比卡片切换当前算法（排序 / 图寻路） */
    function selectAlgorithm(key) {
        if (state.module === 'sorting') {
            if (state.sortAlgo === key) return;
            state.sortAlgo = key;
            updateSortingPanel();
            prepareSorting(true);
        } else if (state.module === 'graph') {
            if (state.graphAlgo === key) return;
            state.graphAlgo = key;
            updateGraphPanel();
            prepareGraph();
        } else {
            return;
        }
        renderCompareList();
    }

    /* ============================================================
       基准测试 + 图表
       ============================================================ */
    el.btnCompare.onclick = () => {
        el.modal.classList.add('active');
        requestAnimationFrame(() => runComparison());
    };

    $('closeCompareModal').onclick = () => el.modal.classList.remove('active');
    el.modal.onclick = (e) => { if (e.target === el.modal) el.modal.classList.remove('active'); };

    function runComparison() {
        if (state.module === 'sorting') {
            compareSorting();
        } else if (state.module === 'graph') {
            compareGraph();
        } else {
            compareTree();
        }
    }

    function median(arr) {
        const s = [...arr].sort((a, b) => a - b);
        return s[Math.floor(s.length / 2)];
    }

    function compareSorting() {
        const N = 2000;   // 六个算法统一规模、同一份数组，柱高才可直接横向比较
        const data = Array.from({ length: N }, () => Math.random() * 1000);
        const warm = Array.from({ length: 200 }, () => Math.random() * 1000);

        const rows = [];
        ['bubble', 'selection', 'insertion', 'quick', 'merge', 'heap'].forEach(key => {
            for (let i = 0; i < 15; i++) SortingAlgorithm.benchmark(key, warm);  // 小规模预热，触发 JIT
            batchSortBench(key, data);                                          // 再按实际规模预热一次
            const times = [];
            for (let i = 0; i < 7; i++) {   // 7 轮取中位数，压低 GC / 调度抖动
                times.push(batchSortBench(key, data));
            }
            rows.push({
                name: SORTING_ALGORITHMS[key].name,
                time: Math.max(0.01, median(times)),
                extra: `n=${N}`,
                complexity: SORTING_ALGORITHMS[key].timeAvg
            });
        });

        renderCompareView({
            title: '排序算法实测耗时对比',
            sub: `六个算法统一规模 n=${N} · 同一份随机数组 · 预热后跑 7 轮取中位数`,
            rows,
            metricLabel: '耗时',
            unit: 'ms',
            valueKey: 'time'
        });
    }

    /* 排序批量计时：单次不足 10ms 时按次数累计后取平均，避免计时器精度带来的误差 */
    function batchSortBench(key, data) {
        const probe = SortingAlgorithm.benchmark(key, data);
        const repeat = Math.max(1, Math.min(40, Math.ceil(10 / Math.max(probe, 0.001))));
        const t0 = performance.now();
        for (let i = 0; i < repeat; i++) SortingAlgorithm.benchmark(key, data);
        return (performance.now() - t0) / repeat;
    }

    function compareGraph() {
        const COLS = 60, ROWS = 40, RATIO = 0.25;
        const grid = createBenchmarkGrid(COLS, ROWS, RATIO);   // 四个算法共用同一张地图
        const rows = [];
        ['bfs', 'dfs', 'dijkstra', 'astar'].forEach(key => {
            benchmarkPathfinding(key, COLS, ROWS, RATIO, grid);   // 预热，排除首次 JIT 编译
            const times = [];
            let last = null;
            for (let i = 0; i < 7; i++) {   // 7 次取中位数，压低 GC / 调度抖动
                last = batchBench(key, COLS, ROWS, RATIO, grid);
                times.push(last.time);
            }
            rows.push({
                name: GRAPH_ALGORITHMS[key].name,
                time: Math.max(0.01, median(times)),
                extra: `${last.visits} / ${Math.max(0, last.pathLen)}`,
                complexity: GRAPH_ALGORITHMS[key].time,
                n: COLS * ROWS
            });
        });

        renderCompareView({
            title: '图寻路算法实测对比',
            sub: '60×40 网格 · 25% 障碍 · 四个算法共用同一张地图 · 每种跑 7 轮取中位数',
            rows,
            metricLabel: '耗时',
            unit: 'ms',
            valueKey: 'time',
            extraLabel: '访问节点 / 路径长'
        });
    }

    /* 批量计时：子毫秒级算法（如 DFS）单次测不准，按次数累计后取平均 */
    function batchBench(key, cols, rows, ratio, grid) {
        const probe = benchmarkPathfinding(key, cols, rows, ratio, grid);
        const repeat = Math.max(1, Math.min(40, Math.ceil(2 / Math.max(probe.time, 0.001))));
        let last = probe;
        const t0 = performance.now();
        for (let i = 0; i < repeat; i++) {
            last = benchmarkPathfinding(key, cols, rows, ratio, grid);
        }
        return { time: (performance.now() - t0) / repeat, visits: last.visits, pathLen: last.pathLen };
    }

    function compareTree() {
        // 构造一棵 200 节点随机 BST 与一条退化链表，比较查找耗时
        const buildBST = (values) => {
            let root = null;
            const ins = (node, v) => {
                if (!node) return { v, l: null, r: null };
                if (v < node.v) node.l = ins(node.l, v);
                else if (v > node.v) node.r = ins(node.r, v);
                return node;
            };
            values.forEach(v => { root = ins(root, v); });
            return root;
        };

        const probe = (root, key) => {
            let steps = 0;
            let cur = root;
            while (cur) {
                steps++;
                if (cur.v === key) return steps;
                cur = key < cur.v ? cur.l : cur.r;
            }
            return steps;
        };

        const N = 2000;
        const values = [];
        while (values.length < N) {
            const v = Math.floor(Math.random() * 100000);
            if (!values.includes(v)) values.push(v);
        }

        // 随机顺序 → 期望平衡
        const randRoot = buildBST([...values].sort(() => Math.random() - 0.5));
        // 升序插入 → 退化为链表
        const chainRoot = buildBST([...values].sort((a, b) => a - b));

        const randSteps = [];
        const chainSteps = [];
        for (let i = 0; i < 200; i++) {
            const key = values[Math.floor(Math.random() * values.length)];
            randSteps.push(probe(randRoot, key));
            chainSteps.push(probe(chainRoot, key));
        }

        const rows = [
            { name: '随机插入（近似平衡）', time: median(randSteps), extra: '~log₂n', complexity: 'O(log n)', theoretical: 'O(log n)' },
            { name: '升序插入（退化为链表）', time: median(chainSteps), extra: '~n', complexity: 'O(n)', theoretical: 'O(n)' }
        ];

        renderCompareView({
            title: '二叉搜索树查找比较次数对比',
            sub: `${N} 个节点，随机取 200 次命中查找取中位数`,
            rows,
            metricLabel: '平均比较次数',
            unit: '次',
            valueKey: 'time',
            extraLabel: '规模特征'
        });
    }

    function renderCompareView(cfg) {
        const body = document.querySelector('.modal-body');
        body.innerHTML = `
            <div class="compare-head">
                <h3>${cfg.title}</h3>
                <p>${cfg.sub}</p>
            </div>
            <div class="compare-chart-wrap"><canvas id="compareChart"></canvas></div>
            <div class="compare-caption">${cfg.metricLabel}（柱越低越好）</div>
            <div class="compare-table" id="compareTable"></div>
        `;

        drawCompareChart(cfg);

        const table = body.querySelector('#compareTable');
        const minVal = Math.min(...cfg.rows.map(r => r.time));

        const header = document.createElement('div');
        header.className = 'compare-row header';
        header.innerHTML = `
            <span class="algo-name">算法 / 场景</span>
            <span>${cfg.metricLabel}</span>
            <span>${cfg.extraLabel || '输入规模'}</span>
            <span>时间复杂度</span>
        `;
        table.appendChild(header);

        cfg.rows.forEach(r => {
            const row = document.createElement('div');
            row.className = 'compare-row';
            const isBest = r.time === minVal;
            const val = cfg.unit === '次' ? Math.round(r.time) : r.time.toFixed(2);
            row.innerHTML = `
                <span class="algo-name">${r.name}</span>
                <span class="${isBest ? 'best' : ''}">${val} ${cfg.unit === '次' ? '次' : 'ms'}</span>
                <span>${r.extra}</span>
                <span class="mono-muted">${r.complexity}</span>
            `;
            table.appendChild(row);
        });
    }

    function drawCompareChart(cfg) {
        const canvas = document.getElementById('compareChart');
        if (!canvas) return;

        const wrap = canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        const W = wrap.clientWidth;
        const H = wrap.clientHeight || 280;

        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';

        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        const padL = 64, padR = 20, padT = 34, padB = 58;
        const chartW = W - padL - padR;
        const chartH = H - padT - padB;

        const maxVal = Math.max(...cfg.rows.map(r => r.time), 0.001);

        // 网格与 Y 轴刻度
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.fillStyle = '#9E9C95';
        ctx.font = '10px "JetBrains Mono", Consolas, monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 1;

        const ticks = 4;
        for (let i = 0; i <= ticks; i++) {
            const y = padT + chartH - (chartH / ticks) * i;
            ctx.beginPath();
            ctx.moveTo(padL, y);
            ctx.lineTo(W - padR, y);
            ctx.stroke();
            const label = (maxVal / ticks) * i;
            // 量级很小时自动提高精度，避免刻度全部显示为 0.0
            const digits = maxVal < 0.1 ? 3 : (maxVal < 1 ? 2 : 1);
            const txt = cfg.unit === '次' ? Math.round(label) : label.toFixed(digits);
            ctx.fillText(txt, padL - 10, y);
        }

        // 柱
        const slot = chartW / cfg.rows.length;
        const barW = Math.min(74, slot * 0.52);

        const palette = ['#F7B64E', '#46D096', '#6DB8F2', '#F2705F', '#C99C60', '#8A9AB0'];

        cfg.rows.forEach((r, i) => {
            const x = padL + slot * i + (slot - barW) / 2;
            const h = Math.max(2, (r.time / maxVal) * chartH);
            const y = padT + chartH - h;
            const color = palette[i % palette.length];

            const grad = ctx.createLinearGradient(0, y, 0, y + h);
            grad.addColorStop(0, color);
            grad.addColorStop(1, color + '33');

            ctx.fillStyle = grad;
            ctx.beginPath();
            roundRect(ctx, x, y, barW, h, 5);
            ctx.fill();

            ctx.strokeStyle = color + '99';
            ctx.lineWidth = 1;
            ctx.stroke();

            // 数值
            ctx.fillStyle = '#F2F0EB';
            ctx.font = '500 11.5px "JetBrains Mono", Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const val = cfg.unit === '次' ? Math.round(r.time) : r.time.toFixed(2);
            ctx.fillText(val, x + barW / 2, y - 6);

            // 名称（换行处理）
            ctx.fillStyle = '#B8B6AE';
            ctx.font = '11px Inter, "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const label = r.name.replace(/\s*\(.*\)$/, '');
            const maxChars = Math.floor(slot / 12);
            if (label.length > maxChars && maxChars > 2) {
                ctx.fillText(label.slice(0, maxChars), x + barW / 2, padT + chartH + 10);
                ctx.fillText(label.slice(maxChars), x + barW / 2, padT + chartH + 26);
            } else {
                ctx.fillText(label, x + barW / 2, padT + chartH + 12);
            }
        });
    }

    function roundRect(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
        ctx.closePath();
    }

    /* ============================================================
       启动
       ============================================================ */
    function init() {
        applySpeed(parseInt(el.speedSlider.value, 10));
        sorting.generateData(state.size, state.preset);

        prepareSorting(true);
        updateSortingPanel();
        renderCompareList();
        updateSizeLabel();

        el.modal.classList.remove('active');

        setTimeout(() => {
            sorting.resize();
            tree.resize();
            graph.resize();
        }, 120);
    }

    // 页面尺寸变化时重绘所有画布
    window.addEventListener('resize', () => {
        sorting.draw();
        tree.draw();
        graph.draw();
    });

    init();
})();
