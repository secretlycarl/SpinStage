/** Focus navigation across wrapped chip rows */

export function chipVerticalTarget(chips, currentIndex, delta) {
    const list = Array.from(chips || []);
    const cur = list[currentIndex];
    if (!cur) return -1;
    const curR = cur.getBoundingClientRect();
    const curMidX = curR.left + curR.width / 2;
    const rowTol = (r) => Math.max(r.height, curR.height) * 0.5;
    const cands = [];
    list.forEach((el, i) => {
        if (i === currentIndex || !el) return;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return;
        if (Math.abs(r.top - curR.top) < rowTol(r)) return;
        if (delta > 0 && r.top <= curR.top) return;
        if (delta < 0 && r.top >= curR.top) return;
        cands.push({ i, r });
    });
    if (!cands.length) return -1;
    const targetTop = delta > 0
        ? Math.min(...cands.map((c) => c.r.top))
        : Math.max(...cands.map((c) => c.r.top));
    let best = -1;
    let bestDx = Infinity;
    for (const c of cands) {
        if (Math.abs(c.r.top - targetTop) > rowTol(c.r)) continue;
        const midX = c.r.left + c.r.width / 2;
        const dx = Math.abs(midX - curMidX);
        if (dx < bestDx) { bestDx = dx; best = c.i; }
    }
    return best;
}
