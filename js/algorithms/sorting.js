/**
 * 排序算法可视化模块
 * 支持动画播放、单步执行、速度控制
 */

class SortingAlgorithm {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.data = [];
        this.initialData = [];
        this.steps = []; // 操作步骤队列
        this.settled = new Set(); // 已归位的下标（持久保留，避免绿色区域一闪而过）
        this.currentStepIndex = 0;
        this.isPlaying = false;
        this.speed = 50; // ms
        this.comparisons = 0;
        this.swaps = 0;
        this.onStepChange = null;
        this.onStatsUpdate = null;
        
        // 调整画布大小
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }
    
    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        this.draw();
    }
    
    // 生成数据
    generateData(size, preset = 'random') {
        this.data = [];
        this.steps = [];
        this.settled = new Set();
        this.lastHighlight = {};
        this.currentStepIndex = 0;
        this.comparisons = 0;
        this.swaps = 0;
        
        const maxVal = 100;
        
        switch (preset) {
            case 'sorted':
                for (let i = 1; i <= size; i++) {
                    this.data.push(Math.round((i / size) * maxVal));
                }
                break;
            case 'reverse':
                for (let i = size; i >= 1; i--) {
                    this.data.push(Math.round((i / size) * maxVal));
                }
                break;
            case 'nearly':
                for (let i = 1; i <= size; i++) {
                    this.data.push(Math.round((i / size) * maxVal));
                }
                // 交换几对
                for (let i = 0; i < Math.floor(size * 0.1); i++) {
                    const a = Math.floor(Math.random() * size);
                    const b = Math.floor(Math.random() * size);
                    [this.data[a], this.data[b]] = [this.data[b], this.data[a]];
                }
                break;
            default: // random
                for (let i = 0; i < size; i++) {
                    this.data.push(Math.round(Math.random() * maxVal));
                }
        }
        
        this.initialData = [...this.data];
        this.draw();
        this.updateStats();
    }

    // 更新统计
    updateStats() {
        if (this.onStatsUpdate) {
            this.onStatsUpdate({
                comparisons: this.comparisons,
                swaps: this.swaps,
                step: this.currentStepIndex,
                totalSteps: this.steps.length
            });
        }
    }
    
    // 绘制柱状图（不传 highlight 时沿用上一次的高亮状态，避免重绘把高亮抹掉）
    draw(highlight) {
        if (highlight) {
            this.lastHighlight = highlight;
        } else {
            highlight = this.lastHighlight || {};
        }

        const rect = this.canvas.parentElement.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;

        this.ctx.clearRect(0, 0, w, h);

        const n = this.data.length;
        if (n === 0) return;

        const showIndex = n <= 32;
        const baseY = h - (showIndex ? 42 : 30);   // 柱底基线，下方留出索引标签空间
        const topPad = 34;
        const gap = n > 40 ? 1 : 2;
        const barWidth = Math.min(44, (w - 48) / n - gap);
        const totalWidth = n * (barWidth + gap);
        const startX = (w - totalWidth) / 2;
        const maxVal = Math.max(...this.data, 1);
        const usableH = Math.max(20, baseY - topPad);

        const root = document.documentElement;
        const css = (name, fallback) =>
            getComputedStyle(root).getPropertyValue(name).trim() || fallback;

        // 基线
        this.ctx.beginPath();
        this.ctx.moveTo(startX - 6, baseY + 0.5);
        this.ctx.lineTo(startX + totalWidth + 6, baseY + 0.5);
        this.ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();

        const colors = {
            def: css('--bar-default', '#5C6B82'),
            compare: css('--bar-compare', '#F7B64E'),
            swap: css('--bar-swap', '#F2705F'),
            sorted: css('--bar-sorted', '#46D096'),
            current: css('--bar-current', '#6DB8F2')
        };

        for (let i = 0; i < n; i++) {
            const barHeight = Math.max(3, (this.data[i] / maxVal) * usableH);
            const x = startX + i * (barWidth + gap);
            const y = baseY - barHeight;

            let color = colors.def;
            let active = true;

            if (highlight.compared && highlight.compared.includes(i)) {
                color = colors.compare;
            } else if (highlight.swapped && highlight.swapped.includes(i)) {
                color = colors.swap;
            } else if (highlight.sorted && highlight.sorted.includes(i)) {
                color = colors.sorted;
            } else if (highlight.current !== undefined && highlight.current === i) {
                color = colors.current;
            } else {
                active = false;
            }

            // 柱体：纯色填充，避免渐变混色导致高亮语义失真
            if (active) {
                // 高亮柱加外发光，在深色背景上拉开层次
                this.ctx.save();
                this.ctx.shadowColor = color;
                this.ctx.shadowBlur = 16;
                this.ctx.fillStyle = color;
                this.roundRect(this.ctx, x, y, barWidth, barHeight, 3);
                this.ctx.fill();
                this.ctx.restore();
            } else {
                this.ctx.fillStyle = color;
                this.roundRect(this.ctx, x, y, barWidth, barHeight, 3);
                this.ctx.fill();
            }

            // 数值（柱内）
            if (barWidth >= 22 && barHeight >= 26) {
                this.ctx.fillStyle = this.textOnColor(color);
                this.ctx.font = `600 ${Math.min(12, barWidth - 8)}px "JetBrains Mono", Consolas, monospace`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(this.data[i], x + barWidth / 2, y + barHeight / 2 + 1);
            }

            // 下标（柱下），让「比较 a[i] 与 a[j]」的提示能对上号
            if (showIndex) {
                this.ctx.fillStyle = active ? color : '#8A8F99';
                this.ctx.font = '500 10px "JetBrains Mono", Consolas, monospace';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'top';
                this.ctx.fillText(i, x + barWidth / 2, baseY + 8);
            }
        }
    }

    /* 依据底色亮度选择深/浅文字，保证柱内数字可读 */
    textOnColor(color) {
        const num = parseInt(color.replace('#', ''), 16);
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return lum > 0.45 ? '#0F1218' : '#FFFFFF';
    }
    
    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
        const B = Math.min(255, (num & 0x0000FF) + amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }
    
    roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
    
    // 执行一步
    stepForward() {
        const settled = [...this.settled];

        if (this.currentStepIndex >= this.steps.length) {
            this.draw({ sorted: Array.from({ length: this.data.length }, (_, i) => i) });
            this.emitInfo('排序完成 — 所有元素均已归位', 'sorted');
            return false;
        }

        const step = this.steps[this.currentStepIndex];

        if (step.type === 'compare') {
            this.comparisons++;
            const [i, j] = step.indices;
            this.draw({ compared: step.indices, sorted: settled });
            this.emitInfo(`比较 a[${i}]=${this.data[i]} 与 a[${j}]=${this.data[j]}`, 'compare');
        } else if (step.type === 'swap') {
            this.swaps++;
            const [i, j] = step.indices;
            this.emitInfo(`交换 a[${i}]=${this.data[i]} ↔ a[${j}]=${this.data[j]}`, 'swap');
            [this.data[i], this.data[j]] = [this.data[j], this.data[i]];
            this.draw({ swapped: step.indices, sorted: settled });
        } else if (step.type === 'set') {
            const oldVal = this.data[step.index];
            this.data[step.index] = step.value;
            this.draw({ current: step.index, sorted: settled });
            this.emitInfo(`写入 a[${step.index}]：${oldVal} → ${step.value}`, 'write');
        } else if (step.type === 'sorted') {
            step.indices.forEach(k => this.settled.add(k));
            const count = this.settled.size;
            this.draw({ sorted: [...this.settled] });
            this.emitInfo(count >= this.data.length
                ? '全部元素已归位'
                : `已归位 ${count} / ${this.data.length} 个元素`, 'sorted');
        } else if (step.type === 'highlight') {
            const i = step.indices[0];
            this.draw({ compared: step.indices, sorted: settled });
            this.emitInfo(`选取元素 a[${i}]=${this.data[i]} 作为基准 / 待插入项`, 'compare');
        }

        this.currentStepIndex++;
        this.updateStats();

        if (this.onStepChange) {
            this.onStepChange(this.currentStepIndex < this.steps.length);
        }

        return this.currentStepIndex < this.steps.length;
    }

    emitInfo(text, tone) {
        if (this.onStepInfo) this.onStepInfo({ text, tone });
    }
    
    // 播放
    play() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.playNext();
    }
    
    playNext() {
        if (!this.isPlaying) return;
        if (!this.stepForward()) {
            this.isPlaying = false;
            if (this.onStepChange) this.onStepChange(false);
            return;
        }
        setTimeout(() => this.playNext(), this.speed);
    }
    
    pause() {
        this.isPlaying = false;
    }
    
    reset() {
        this.pause();
        this.generateData(this.data.length || 20);
    }
    
    setSpeed(speed) {
        this.speed = Math.max(5, speed);
    }
    
    // 冒泡排序
    bubbleSort() {
        this.steps = [];
        const arr = [...this.data];
        const n = arr.length;
        const sorted = [];
        
        for (let i = 0; i < n - 1; i++) {
            for (let j = 0; j < n - 1 - i; j++) {
                this.steps.push({ type: 'compare', indices: [j, j + 1] });
                if (arr[j] > arr[j + 1]) {
                    [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
                    this.steps.push({ type: 'swap', indices: [j, j + 1] });
                }
            }
            sorted.unshift(n - 1 - i);
            this.steps.push({ type: 'sorted', indices: [...sorted] });
        }
        sorted.unshift(0);
        this.steps.push({ type: 'sorted', indices: [...sorted] });
        
        return arr;
    }
    
    // 选择排序
    selectionSort() {
        this.steps = [];
        const arr = [...this.data];
        const n = arr.length;
        const sorted = [];
        
        for (let i = 0; i < n - 1; i++) {
            let minIdx = i;
            for (let j = i + 1; j < n; j++) {
                this.steps.push({ type: 'compare', indices: [minIdx, j] });
                if (arr[j] < arr[minIdx]) {
                    minIdx = j;
                }
            }
            if (minIdx !== i) {
                [arr[i], arr[minIdx]] = [arr[minIdx], arr[i]];
                this.steps.push({ type: 'swap', indices: [i, minIdx] });
            }
            sorted.push(i);
            this.steps.push({ type: 'sorted', indices: [...sorted] });
        }
        sorted.push(n - 1);
        this.steps.push({ type: 'sorted', indices: [...sorted] });
        
        return arr;
    }
    
    // 插入排序
    insertionSort() {
        this.steps = [];
        const arr = [...this.data];
        const n = arr.length;
        const sorted = [0];
        
        for (let i = 1; i < n; i++) {
            let key = arr[i];
            let j = i - 1;
            this.steps.push({ type: 'highlight', indices: [i] });
            
            while (j >= 0 && arr[j] > key) {
                this.steps.push({ type: 'compare', indices: [j, j + 1] });
                arr[j + 1] = arr[j];
                this.steps.push({ type: 'set', index: j + 1, value: arr[j] });
                j--;
            }
            arr[j + 1] = key;
            this.steps.push({ type: 'set', index: j + 1, value: key });
            sorted.push(i);
            this.steps.push({ type: 'sorted', indices: [...sorted] });
        }
        
        return arr;
    }
    
    // 快速排序
    quickSort() {
        this.steps = [];
        const arr = [...this.data];
        const sorted = [];
        
        const partition = (low, high) => {
            const pivot = arr[high];
            this.steps.push({ type: 'highlight', indices: [high] });
            let i = low - 1;
            
            for (let j = low; j < high; j++) {
                this.steps.push({ type: 'compare', indices: [j, high] });
                if (arr[j] <= pivot) {
                    i++;
                    if (i !== j) {
                        [arr[i], arr[j]] = [arr[j], arr[i]];
                        this.steps.push({ type: 'swap', indices: [i, j] });
                    }
                }
            }
            
            [arr[i + 1], arr[high]] = [arr[high], arr[i + 1]];
            this.steps.push({ type: 'swap', indices: [i + 1, high] });
            return i + 1;
        };
        
        const quickSortHelper = (low, high) => {
            if (low < high) {
                const pi = partition(low, high);
                sorted.push(pi);
                this.steps.push({ type: 'sorted', indices: [...sorted] });
                quickSortHelper(low, pi - 1);
                quickSortHelper(pi + 1, high);
            } else if (low === high) {
                sorted.push(low);
                this.steps.push({ type: 'sorted', indices: [...sorted] });
            }
        };
        
        quickSortHelper(0, arr.length - 1);
        this.steps.push({ type: 'sorted', indices: Array.from({ length: arr.length }, (_, i) => i) });
        
        return arr;
    }
    
    // 归并排序
    mergeSort() {
        this.steps = [];
        const arr = [...this.data];
        const mergedIndices = [];
        
        const merge = (left, mid, right) => {
            const leftArr = arr.slice(left, mid + 1);
            const rightArr = arr.slice(mid + 1, right + 1);
            let i = 0, j = 0, k = left;
            
            while (i < leftArr.length && j < rightArr.length) {
                this.steps.push({ type: 'compare', indices: [left + i, mid + 1 + j] });
                if (leftArr[i] <= rightArr[j]) {
                    arr[k] = leftArr[i];
                    this.steps.push({ type: 'set', index: k, value: leftArr[i] });
                    i++;
                } else {
                    arr[k] = rightArr[j];
                    this.steps.push({ type: 'set', index: k, value: rightArr[j] });
                    j++;
                }
                k++;
            }
            
            while (i < leftArr.length) {
                arr[k] = leftArr[i];
                this.steps.push({ type: 'set', index: k, value: leftArr[i] });
                i++;
                k++;
            }
            
            while (j < rightArr.length) {
                arr[k] = rightArr[j];
                this.steps.push({ type: 'set', index: k, value: rightArr[j] });
                j++;
                k++;
            }
            
            for (let idx = left; idx <= right; idx++) {
                if (!mergedIndices.includes(idx)) mergedIndices.push(idx);
            }
            this.steps.push({ type: 'sorted', indices: [...mergedIndices] });
        };
        
        const mergeSortHelper = (left, right) => {
            if (left < right) {
                const mid = Math.floor((left + right) / 2);
                mergeSortHelper(left, mid);
                mergeSortHelper(mid + 1, right);
                merge(left, mid, right);
            }
        };
        
        mergeSortHelper(0, arr.length - 1);
        this.steps.push({ type: 'sorted', indices: Array.from({ length: arr.length }, (_, i) => i) });
        
        return arr;
    }
    
    // 堆排序
    heapSort() {
        this.steps = [];
        const arr = [...this.data];
        const n = arr.length;
        const sorted = [];
        
        const heapify = (size, root) => {
            let largest = root;
            const left = 2 * root + 1;
            const right = 2 * root + 2;
            
            if (left < size) {
                this.steps.push({ type: 'compare', indices: [largest, left] });
                if (arr[left] > arr[largest]) largest = left;
            }
            
            if (right < size) {
                this.steps.push({ type: 'compare', indices: [largest, right] });
                if (arr[right] > arr[largest]) largest = right;
            }
            
            if (largest !== root) {
                [arr[root], arr[largest]] = [arr[largest], arr[root]];
                this.steps.push({ type: 'swap', indices: [root, largest] });
                heapify(size, largest);
            }
        };
        
        // 构建最大堆
        for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
            heapify(n, i);
        }
        
        // 逐个提取元素
        for (let i = n - 1; i > 0; i--) {
            [arr[0], arr[i]] = [arr[i], arr[0]];
            this.steps.push({ type: 'swap', indices: [0, i] });
            sorted.unshift(i);
            this.steps.push({ type: 'sorted', indices: [...sorted] });
            heapify(i, 0);
        }
        sorted.unshift(0);
        this.steps.push({ type: 'sorted', indices: [...sorted] });
        
        return arr;
    }
    
    // 执行指定算法
    runAlgorithm(algorithmName) {
        this.isPlaying = false;
        this.currentStepIndex = 0;
        this.comparisons = 0;
        this.swaps = 0;
        this.steps = [];
        this.settled = new Set();
        this.lastHighlight = {};
        
        switch (algorithmName) {
            case 'bubble': return this.bubbleSort();
            case 'selection': return this.selectionSort();
            case 'insertion': return this.insertionSort();
            case 'quick': return this.quickSort();
            case 'merge': return this.mergeSort();
            case 'heap': return this.heapSort();
            default: return this.bubbleSort();
        }
    }
    
    // 性能测试
    static benchmark(algorithmName, data) {
        const arr = [...data];
        const n = arr.length;
        const start = performance.now();
        
        switch (algorithmName) {
            case 'bubble':
                for (let i = 0; i < n - 1; i++)
                    for (let j = 0; j < n - 1 - i; j++)
                        if (arr[j] > arr[j + 1]) [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
                break;
            case 'selection':
                for (let i = 0; i < n - 1; i++) {
                    let m = i;
                    for (let j = i + 1; j < n; j++) if (arr[j] < arr[m]) m = j;
                    [arr[i], arr[m]] = [arr[m], arr[i]];
                }
                break;
            case 'insertion':
                for (let i = 1; i < n; i++) {
                    let k = arr[i], j = i - 1;
                    while (j >= 0 && arr[j] > k) { arr[j + 1] = arr[j]; j--; }
                    arr[j + 1] = k;
                }
                break;
            case 'quick':
                const qs = (l, h) => {
                    if (l < h) {
                        const p = arr[h];
                        let i = l - 1;
                        for (let j = l; j < h; j++) if (arr[j] <= p) { i++; [arr[i], arr[j]] = [arr[j], arr[i]]; }
                        [arr[i + 1], arr[h]] = [arr[h], arr[i + 1]];
                        qs(l, i); qs(i + 2, h);
                    }
                };
                qs(0, n - 1);
                break;
            case 'merge':
                const merge = (l, m, r) => {
                    const L = arr.slice(l, m + 1), R = arr.slice(m + 1, r + 1);
                    let i = 0, j = 0, k = l;
                    while (i < L.length && j < R.length) arr[k++] = L[i] <= R[j] ? L[i++] : R[j++];
                    while (i < L.length) arr[k++] = L[i++];
                    while (j < R.length) arr[k++] = R[j++];
                };
                const ms = (l, r) => {
                    if (l < r) { const m = Math.floor((l + r) / 2); ms(l, m); ms(m + 1, r); merge(l, m, r); }
                };
                ms(0, n - 1);
                break;
            case 'heap':
                const heap = (s, r) => {
                    let l = 2 * r + 1, rr = 2 * r + 2, largest = r;
                    if (l < s && arr[l] > arr[largest]) largest = l;
                    if (rr < s && arr[rr] > arr[largest]) largest = rr;
                    if (largest !== r) { [arr[r], arr[largest]] = [arr[largest], arr[r]]; heap(s, largest); }
                };
                for (let i = Math.floor(n / 2) - 1; i >= 0; i--) heap(n, i);
                for (let i = n - 1; i > 0; i--) { [arr[0], arr[i]] = [arr[i], arr[0]]; heap(i, 0); }
                break;
        }
        
        return performance.now() - start;
    }
}

// 排序算法元数据
const SORTING_ALGORITHMS = {
    bubble: {
        name: '冒泡排序',
        timeBest: 'O(n)',
        timeAvg: 'O(n²)',
        timeWorst: 'O(n²)',
        space: 'O(1)',
        stable: true,
        description: '冒泡排序是一种简单的排序算法，它重复地遍历要排序的数列，一次比较两个元素，如果它们的顺序错误就把它们交换过来。就像水中的气泡一样，较大的元素会逐渐"冒"到数组的末端。',
        pseudoCode: `function bubbleSort(arr):
    n = length(arr)
    for i from 0 to n-2:
        swapped = false
        for j from 0 to n-2-i:
            if arr[j] > arr[j+1]:
                swap(arr[j], arr[j+1])
                swapped = true
        if not swapped:
            break
    return arr`,
        jsCode: `function bubbleSort(arr) {
    const n = arr.length;
    for (let i = 0; i < n - 1; i++) {
        let swapped = false;
        for (let j = 0; j < n - 1 - i; j++) {
            if (arr[j] > arr[j + 1]) {
                [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
                swapped = true;
            }
        }
        if (!swapped) break;
    }
    return arr;
}`
    },
    selection: {
        name: '选择排序',
        timeBest: 'O(n²)',
        timeAvg: 'O(n²)',
        timeWorst: 'O(n²)',
        space: 'O(1)',
        stable: false,
        description: '选择排序每次从未排序部分选出最小的元素，放到已排序部分的末尾。它的特点是交换次数最少，但比较次数固定。',
        pseudoCode: `function selectionSort(arr):
    n = length(arr)
    for i from 0 to n-2:
        minIdx = i
        for j from i+1 to n-1:
            if arr[j] < arr[minIdx]:
                minIdx = j
        if minIdx != i:
            swap(arr[i], arr[minIdx])
    return arr`,
        jsCode: `function selectionSort(arr) {
    const n = arr.length;
    for (let i = 0; i < n - 1; i++) {
        let minIdx = i;
        for (let j = i + 1; j < n; j++) {
            if (arr[j] < arr[minIdx]) {
                minIdx = j;
            }
        }
        if (minIdx !== i) {
            [arr[i], arr[minIdx]] = [arr[minIdx], arr[i]];
        }
    }
    return arr;
}`
    },
    insertion: {
        name: '插入排序',
        timeBest: 'O(n)',
        timeAvg: 'O(n²)',
        timeWorst: 'O(n²)',
        space: 'O(1)',
        stable: true,
        description: '插入排序的工作方式就像我们整理手中的扑克牌：对于未排序数据，在已排序序列中从后向前扫描，找到相应位置并插入。',
        pseudoCode: `function insertionSort(arr):
    n = length(arr)
    for i from 1 to n-1:
        key = arr[i]
        j = i - 1
        while j >= 0 and arr[j] > key:
            arr[j+1] = arr[j]
            j = j - 1
        arr[j+1] = key
    return arr`,
        jsCode: `function insertionSort(arr) {
    const n = arr.length;
    for (let i = 1; i < n; i++) {
        let key = arr[i];
        let j = i - 1;
        while (j >= 0 && arr[j] > key) {
            arr[j + 1] = arr[j];
            j--;
        }
        arr[j + 1] = key;
    }
    return arr;
}`
    },
    quick: {
        name: '快速排序',
        timeBest: 'O(n log n)',
        timeAvg: 'O(n log n)',
        timeWorst: 'O(n²)',
        space: 'O(log n)',
        stable: false,
        description: '快速排序使用分治法策略。它选择一个"基准"元素，将数组分为两部分：小于基准的和大于基准的，然后对这两部分递归地执行快速排序。',
        pseudoCode: `function quickSort(arr, low, high):
    if low < high:
        pivot = arr[high]
        i = low - 1
        for j from low to high-1:
            if arr[j] <= pivot:
                i = i + 1
                swap(arr[i], arr[j])
        swap(arr[i+1], arr[high])
        pi = i + 1
        quickSort(arr, low, pi-1)
        quickSort(arr, pi+1, high)`,
        jsCode: `function quickSort(arr, low = 0, high = arr.length - 1) {
    if (low < high) {
        const pivot = arr[high];
        let i = low - 1;
        for (let j = low; j < high; j++) {
            if (arr[j] <= pivot) {
                i++;
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
        }
        [arr[i + 1], arr[high]] = [arr[high], arr[i + 1]];
        const pi = i + 1;
        quickSort(arr, low, pi - 1);
        quickSort(arr, pi + 1, high);
    }
    return arr;
}`
    },
    merge: {
        name: '归并排序',
        timeBest: 'O(n log n)',
        timeAvg: 'O(n log n)',
        timeWorst: 'O(n log n)',
        space: 'O(n)',
        stable: true,
        description: '归并排序同样使用分治法。它将数组分成两半，分别排序后再合并。这是一种稳定的排序算法，且时间复杂度始终是 O(n log n)。',
        pseudoCode: `function mergeSort(arr):
    if length(arr) <= 1:
        return arr
    mid = length(arr) / 2
    left = mergeSort(arr[0..mid-1])
    right = mergeSort(arr[mid..])
    return merge(left, right)

function merge(left, right):
    result = []
    i = j = 0
    while i < length(left) and j < length(right):
        if left[i] <= right[j]:
            result.append(left[i++])
        else:
            result.append(right[j++])
    result.extend(left[i:])
    result.extend(right[j:])
    return result`,
        jsCode: `function mergeSort(arr) {
    if (arr.length <= 1) return arr;
    
    const mid = Math.floor(arr.length / 2);
    const left = mergeSort(arr.slice(0, mid));
    const right = mergeSort(arr.slice(mid));
    
    return merge(left, right);
}

function merge(left, right) {
    const result = [];
    let i = 0, j = 0;
    while (i < left.length && j < right.length) {
        result.push(left[i] <= right[j] ? left[i++] : right[j++]);
    }
    return result.concat(left.slice(i)).concat(right.slice(j));
}`
    },
    heap: {
        name: '堆排序',
        timeBest: 'O(n log n)',
        timeAvg: 'O(n log n)',
        timeWorst: 'O(n log n)',
        space: 'O(1)',
        stable: false,
        description: '堆排序利用了完全二叉树的性质。首先将数组构建成最大堆，然后反复将堆顶元素（最大值）移到末尾，缩小堆的范围并重新调整。',
        pseudoCode: `function heapSort(arr):
    n = length(arr)
    for i from n/2-1 down to 0:
        heapify(arr, n, i)
    for i from n-1 down to 1:
        swap(arr[0], arr[i])
        heapify(arr, i, 0)

function heapify(arr, n, i):
    largest = i
    left = 2*i + 1
    right = 2*i + 2
    if left < n and arr[left] > arr[largest]:
        largest = left
    if right < n and arr[right] > arr[largest]:
        largest = right
    if largest != i:
        swap(arr[i], arr[largest])
        heapify(arr, n, largest)`,
        jsCode: `function heapSort(arr) {
    const n = arr.length;
    
    function heapify(size, root) {
        let largest = root;
        const left = 2 * root + 1;
        const right = 2 * root + 2;
        
        if (left < size && arr[left] > arr[largest]) largest = left;
        if (right < size && arr[right] > arr[largest]) largest = right;
        
        if (largest !== root) {
            [arr[root], arr[largest]] = [arr[largest], arr[root]];
            heapify(size, largest);
        }
    }
    
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
        heapify(n, i);
    }
    
    for (let i = n - 1; i > 0; i--) {
        [arr[0], arr[i]] = [arr[i], arr[0]];
        heapify(i, 0);
    }
    
    return arr;
}`
    }
};

window.SortingAlgorithm = SortingAlgorithm;
window.SORTING_ALGORITHMS = SORTING_ALGORITHMS;
