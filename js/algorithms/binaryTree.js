/**
 * 二叉搜索树可视化模块
 * - 插入 / 查找 / 删除：渐进动画（逐节点高亮）
 * - 四种遍历：预计算轨迹 + 单步回放（支持 播放/暂停/单步）
 */

class TreeNode {
    constructor(value) {
        this.value = value;
        this.left = null;
        this.right = null;
        this.x = 0;
        this.y = 0;
        this.level = 0;
    }
}

class BinaryTreeVisualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.root = null;

        this.isBusy = false;      // 插入/删除/查找进行中
        this.speed = 500;

        // 高亮状态
        this.highlightNodes = [];  // 当前节点
        this.visitedNodes = [];    // 已访问节点（遍历序）
        this.searchPath = [];      // 查找路径

        // 遍历回放
        this.trace = [];           // 遍历节点序列
        this.stepIndex = 0;
        this.isPlaying = false;
        this.traceType = null;
        this.playTimer = null;

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

    /* ============================================================
       树结构辅助
       ============================================================ */

    getHeight(node = this.root) {
        if (!node) return 0;
        return 1 + Math.max(this.getHeight(node.left), this.getHeight(node.right));
    }

    getNodeCount(node = this.root) {
        if (!node) return 0;
        return 1 + this.getNodeCount(node.left) + this.getNodeCount(node.right);
    }

    isBalanced() {
        const check = (node) => {
            if (!node) return { h: 0, ok: true };
            const l = check(node.left);
            const r = check(node.right);
            return {
                h: 1 + Math.max(l.h, r.h),
                ok: l.ok && r.ok && Math.abs(l.h - r.h) <= 1
            };
        };
        return check(this.root).ok;
    }

    calculatePositions() {
        if (!this.root) return;

        const rect = this.canvas.parentElement.getBoundingClientRect();
        const w = rect.width;
        const padX = 34;
        const padTop = 44;
        const height = this.getHeight();
        const usableH = Math.max(120, rect.height - padTop - 34);
        const spacingY = Math.min(84, usableH / Math.max(height - 1, 1));

        // 1) 标定层级
        const setLevel = (n, lv) => {
            if (!n) return;
            n.level = lv;
            setLevel(n.left, lv + 1);
            setLevel(n.right, lv + 1);
        };
        setLevel(this.root, 0);

        // 2) 中序序列 → 每个节点独占一个横向槽位，避免深层兄弟节点重叠
        const ordered = [];
        const inorder = (n) => {
            if (!n) return;
            inorder(n.left);
            ordered.push(n);
            inorder(n.right);
        };
        inorder(this.root);

        const count = ordered.length;
        const usableW = Math.max(0, w - padX * 2);
        const stepX = count > 1 ? usableW / (count - 1) : 0;

        ordered.forEach((node, i) => {
            node.x = count > 1 ? padX + i * stepX : w / 2;
            node.y = padTop + node.level * spacingY;
        });

        // 3) 半径自适应，保证横向不叠压
        this.nodeRadius = Math.max(8, Math.min(
            spacingY * 0.46,
            stepX > 0 ? stepX * 0.44 : 21,
            21
        ));
    }

    /* ============================================================
       绘制
       ============================================================ */

    draw() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.ctx.clearRect(0, 0, rect.width, rect.height);

        if (!this.root) {
            this.ctx.fillStyle = '#8F8D86';
            this.ctx.font = '13px Inter, "Segoe UI", sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('树为空 — 在右上角输入数值后点击「插入」', rect.width / 2, rect.height / 2);
            return;
        }

        this.calculatePositions();
        this.drawEdges(this.root);
        this.drawNodes(this.root);
    }

    drawEdges(node) {
        if (!node) return;

        const r = this.nodeRadius || 21;

        const line = (from, to) => {
            if (!to) return;
            const isActive = this.highlightNodes.includes(from) || this.highlightNodes.includes(to);
            this.ctx.beginPath();
            this.ctx.moveTo(from.x, from.y + r);
            this.ctx.lineTo(to.x, to.y - r);
            this.ctx.strokeStyle = isActive ? 'rgba(247,182,78,0.78)' : 'rgba(255,255,255,0.18)';
            this.ctx.lineWidth = isActive ? 1.8 : 1.2;
            this.ctx.stroke();
        };

        line(node, node.left);
        line(node, node.right);
        this.drawEdges(node.left);
        this.drawEdges(node.right);
    }

    drawNodes(node) {
        if (!node) return;

        const r = this.nodeRadius || 21;
        let fill = '#586780';
        let stroke = '#6E80A1';
        let text = '#E9E7E2';

        if (this.highlightNodes.includes(node)) {
            fill = '#F7B64E';
            stroke = '#FFCE85';
            text = '#14100A';
        } else if (this.visitedNodes.includes(node)) {
            fill = '#46D096';
            stroke = '#6FE0AE';
            text = '#08130E';
        }

        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        this.ctx.fillStyle = fill;
        this.ctx.fill();

        this.ctx.strokeStyle = stroke;
        this.ctx.lineWidth = 1.4;
        this.ctx.stroke();

        this.ctx.fillStyle = text;
        const digits = node.value.toString().length;
        const fontSize = Math.max(9, Math.min(13, r * 0.68) - (digits > 2 ? 1.5 : 0));
        this.ctx.font = `600 ${fontSize}px 'JetBrains Mono', monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(node.value, node.x, node.y);

        this.drawNodes(node.left);
        this.drawNodes(node.right);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /* ============================================================
       基本操作（渐进动画）
       ============================================================ */

    async insert(value) {
        if (this.isBusy) return false;
        this.isBusy = true;
        this.clearTrace();

        if (!this.root) {
            this.root = new TreeNode(value);
            this.highlightNodes = [this.root];
            this.draw();
            await this.sleep(this.speed);
            this.highlightNodes = [];
            this.draw();
            this.isBusy = false;
            this.updateStats();
            return true;
        }

        let cur = this.root;

        while (true) {
            this.highlightNodes = [cur];
            this.draw();
            await this.sleep(this.speed);

            if (value === cur.value) {
                this.highlightNodes = [];
                this.draw();
                this.isBusy = false;
                return false;
            }

            if (value < cur.value) {
                if (!cur.left) {
                    cur.left = new TreeNode(value);
                    this.highlightNodes = [cur.left];
                    this.draw();
                    await this.sleep(this.speed);
                    this.highlightNodes = [];
                    this.draw();
                    this.isBusy = false;
                    this.updateStats();
                    return true;
                }
                cur = cur.left;
            } else {
                if (!cur.right) {
                    cur.right = new TreeNode(value);
                    this.highlightNodes = [cur.right];
                    this.draw();
                    await this.sleep(this.speed);
                    this.highlightNodes = [];
                    this.draw();
                    this.isBusy = false;
                    this.updateStats();
                    return true;
                }
                cur = cur.right;
            }
        }
    }

    async search(value) {
        if (this.isBusy) return null;
        this.isBusy = true;
        this.clearTrace();
        this.searchPath = [];

        let cur = this.root;
        while (cur) {
            this.highlightNodes = [cur];
            this.draw();
            await this.sleep(this.speed);

            this.searchPath.push(cur.value);

            if (value === cur.value) {
                this.highlightNodes = [];
                this.isBusy = false;
                return cur;
            }
            cur = value < cur.value ? cur.left : cur.right;
        }

        this.highlightNodes = [];
        this.draw();
        this.isBusy = false;
        return null;
    }

    async delete(value) {
        if (this.isBusy) return false;
        this.isBusy = true;
        this.clearTrace();

        let parent = null;
        let cur = this.root;

        while (cur && cur.value !== value) {
            this.highlightNodes = [cur];
            this.draw();
            await this.sleep(this.speed);
            parent = cur;
            cur = value < cur.value ? cur.left : cur.right;
        }

        if (!cur) {
            this.highlightNodes = [];
            this.draw();
            this.isBusy = false;
            return false;
        }

        this.highlightNodes = [cur];
        this.draw();
        await this.sleep(this.speed);

        if (!cur.left) {
            this.replace(parent, cur, cur.right);
        } else if (!cur.right) {
            this.replace(parent, cur, cur.left);
        } else {
            let succParent = cur;
            let succ = cur.right;
            while (succ.left) {
                this.highlightNodes = [succ];
                this.draw();
                await this.sleep(this.speed);
                succParent = succ;
                succ = succ.left;
            }
            cur.value = succ.value;
            this.replace(succParent, succ, succ.right);
        }

        this.highlightNodes = [];
        this.draw();
        this.isBusy = false;
        this.updateStats();
        return true;
    }

    replace(parent, oldNode, newNode) {
        if (!parent) this.root = newNode;
        else if (parent.left === oldNode) parent.left = newNode;
        else parent.right = newNode;
    }

    /* ============================================================
       遍历（轨迹预计算 + 回放）
       ============================================================ */

    computeOrder(type) {
        const order = [];
        const walk = (node) => {
            if (!node) return;
            if (type === 'preorder') {
                order.push(node);
                walk(node.left);
                walk(node.right);
            } else if (type === 'inorder') {
                walk(node.left);
                order.push(node);
                walk(node.right);
            } else if (type === 'postorder') {
                walk(node.left);
                walk(node.right);
                order.push(node);
            }
        };

        if (type === 'levelorder') {
            const q = [];
            if (this.root) q.push(this.root);
            while (q.length) {
                const n = q.shift();
                order.push(n);
                if (n.left) q.push(n.left);
                if (n.right) q.push(n.right);
            }
        } else {
            walk(this.root);
        }

        return order;
    }

    prepareTraversal(type) {
        this.pause();
        this.clearTrace();
        this.trace = this.computeOrder(type);
        this.traceType = type;
        this.stepIndex = 0;
        this.visitedNodes = [];
        this.highlightNodes = [];
        this.draw();
        return this.trace.length;
    }

    stepForward() {
        if (this.stepIndex >= this.trace.length) return false;

        const node = this.trace[this.stepIndex++];
        this.highlightNodes = [node];
        if (!this.visitedNodes.includes(node)) this.visitedNodes.push(node);
        this.draw();

        if (this.stepIndex >= this.trace.length && this.onFinish) {
            this.onFinish(this.visitedNodes.map(n => n.value));
        }
        return this.stepIndex < this.trace.length;
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

    clearTrace() {
        this.pause();
        this.trace = [];
        this.traceType = null;
        this.stepIndex = 0;
        this.visitedNodes = [];
        this.highlightNodes = [];
    }

    resetTraversal() {
        this.clearTrace();
        this.draw();
    }

    /* ============================================================
       批量生成 / 清空
       ============================================================ */

    generateRandomTree(count = 10) {
        this.clearTrace();
        this.root = null;

        const values = new Set();
        while (values.size < Math.min(count, 90)) {
            values.add(Math.floor(Math.random() * 98) + 1);
        }

        const arr = [...values].sort(() => Math.random() - 0.5);
        arr.forEach(v => this.insertQuiet(v));

        this.isBusy = false;
        this.draw();
        this.updateStats();
    }

    insertQuiet(value) {
        if (!this.root) {
            this.root = new TreeNode(value);
            return;
        }
        let cur = this.root;
        while (true) {
            if (value === cur.value) return;
            if (value < cur.value) {
                if (!cur.left) { cur.left = new TreeNode(value); return; }
                cur = cur.left;
            } else {
                if (!cur.right) { cur.right = new TreeNode(value); return; }
                cur = cur.right;
            }
        }
    }

    clear() {
        this.clearTrace();
        this.root = null;
        this.isBusy = false;
        this.draw();
        this.updateStats();
    }

    setSpeed(speed) {
        this.speed = Math.max(120, speed);
    }

    updateStats() {
        if (window.treeStatsCallback) {
            window.treeStatsCallback({
                count: this.getNodeCount(),
                height: this.getHeight(),
                balanced: this.isBalanced()
            });
        }
    }
}

/* ============================================================
   算法元数据
   ============================================================ */
const TREE_ALGORITHMS = {
    bst: {
        name: '二叉搜索树',
        description: '二叉搜索树（BST）满足：任意节点左子树上的值均小于它，右子树上的值均大于它。因此查找、插入、删除的平均时间复杂度为 O(log n)；若按有序顺序插入则会退化为链表，复杂度劣化为 O(n)。中序遍历 BST 可以得到全局有序序列。',
        complexities: {
            search: { name: '查找', time: 'O(log n)', worst: 'O(n)', space: 'O(1)' },
            insert: { name: '插入', time: 'O(log n)', worst: 'O(n)', space: 'O(1)' },
            delete: { name: '删除', time: 'O(log n)', worst: 'O(n)', space: 'O(1)' },
            traverse: { name: '遍历', time: 'O(n)', worst: 'O(n)', space: 'O(h)' }
        },
        pseudoCode: `// ---- 查找 ----
function search(root, key):
    while root != null:
        if key == root.val: return root
        root = key < root.val ? root.left : root.right
    return null

// ---- 插入 ----
function insert(root, val):
    if root == null: return new Node(val)
    if val < root.val:  root.left  = insert(root.left,  val)
    elif val > root.val: root.right = insert(root.right, val)
    return root

// ---- 删除 ----
function deleteNode(root, key):
    if root == null: return null
    if key < root.val:   root.left  = deleteNode(root.left,  key)
    elif key > root.val: root.right = deleteNode(root.right, key)
    else:
        if root.left == null:  return root.right
        if root.right == null: return root.left
        succ = minNodeOf(root.right)      // 中序后继
        root.val = succ.val
        root.right = deleteNode(root.right, succ.val)
    return root

// ---- 中序遍历（结果有序）----
function inorder(root, out):
    if root == null: return
    inorder(root.left,  out)
    out.push(root.val)
    inorder(root.right, out)`,
        jsCode: `class TreeNode {
    constructor(val) {
        this.val = val;
        this.left = null;
        this.right = null;
    }
}

function search(root, key) {
    while (root) {
        if (key === root.val) return root;
        root = key < root.val ? root.left : root.right;
    }
    return null;
}

function insert(root, val) {
    if (!root) return new TreeNode(val);
    if (val < root.val) root.left = insert(root.left, val);
    else if (val > root.val) root.right = insert(root.right, val);
    return root;
}

function deleteNode(root, key) {
    if (!root) return null;
    if (key < root.val) root.left = deleteNode(root.left, key);
    else if (key > root.val) root.right = deleteNode(root.right, key);
    else {
        if (!root.left) return root.right;
        if (!root.right) return root.left;
        let succ = root.right;
        while (succ.left) succ = succ.left;
        root.val = succ.val;
        root.right = deleteNode(root.right, succ.val);
    }
    return root;
}

function inorder(root, out = []) {
    if (root) {
        inorder(root.left, out);
        out.push(root.val);
        inorder(root.right, out);
    }
    return out;
}`
    }
};

window.BinaryTreeVisualizer = BinaryTreeVisualizer;
window.TREE_ALGORITHMS = TREE_ALGORITHMS;
window.TreeNode = TreeNode;
