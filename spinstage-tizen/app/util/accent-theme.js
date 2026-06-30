/** Album-art accent extraction via Material Color Utilities (quantize + HCT). */
import { QuantizerCelebi } from '../vendor/material-color-utilities/quantize/quantizer_celebi.js';
import { DislikeAnalyzer } from '../vendor/material-color-utilities/dislike/dislike_analyzer.js';
import { Hct } from '../vendor/material-color-utilities/hct/hct.js';
import {
    argbFromRgb,
    redFromArgb,
    greenFromArgb,
    blueFromArgb,
} from '../vendor/material-color-utilities/utils/color_utils.js';
import {
    isBrownishAccent,
    rgbToHex,
    rgbToHsl,
    relativeLum,
    buildAccentFromImage,
} from './color.js';

const SAMPLE_SIZE = 128;
const MAX_CLUSTERS = 128;
const MIN_CHROMA = 42;
const ACCENT_TONE_MIN = 45;
const ACCENT_TONE_MAX = 65;
const MIN_ACCENT_SAT = 0.52;
const EDGE_TONE = 28;
const COLOR_MATCH_DELTA = 28;
const ACCENT_CANDIDATE_LIMIT = 14;

function centerWeight(x, y, w, h) {
    const dx = (x / Math.max(1, w - 1)) * 2 - 1;
    const dy = (y / Math.max(1, h - 1)) * 2 - 1;
    return Math.exp(-(dx * dx + dy * dy) * 2.2);
}

function sampleWeightedArgbPixels(data, w, h) {
    const pixels = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const a = data[i + 3];
            if (a < 125) continue;
            const argb = argbFromRgb(data[i], data[i + 1], data[i + 2]);
            const reps = Math.max(1, Math.round(centerWeight(x, y, w, h) * 5));
            for (let k = 0; k < reps; k++) pixels.push(argb);
        }
    }
    return pixels;
}

function colorDistance(argbA, argbB) {
    const dr = redFromArgb(argbA) - redFromArgb(argbB);
    const dg = greenFromArgb(argbA) - greenFromArgb(argbB);
    const db = blueFromArgb(argbA) - blueFromArgb(argbB);
    return Math.hypot(dr, dg, db);
}

function centerPresenceForArgb(data, w, h, targetArgb) {
    let weight = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (data[i + 3] < 125) continue;
            const argb = argbFromRgb(data[i], data[i + 1], data[i + 2]);
            if (colorDistance(argb, targetArgb) > COLOR_MATCH_DELTA) continue;
            weight += centerWeight(x, y, w, h);
        }
    }
    return weight;
}

function argbToHex(argb) {
    return rgbToHex(redFromArgb(argb), greenFromArgb(argb), blueFromArgb(argb));
}

function hctToRgb(hct) {
    const argb = hct.toInt();
    return [redFromArgb(argb), greenFromArgb(argb), blueFromArgb(argb)];
}

function boostAccentHct(hct) {
    let hue = hct.hue;
    let chroma = Math.max(hct.chroma, MIN_CHROMA);
    if (chroma < 64) chroma = Math.min(88, chroma * 1.04 + 3);
    let tone = hct.tone;
    if (tone < ACCENT_TONE_MIN || tone > ACCENT_TONE_MAX) {
        tone = Math.min(ACCENT_TONE_MAX, Math.max(ACCENT_TONE_MIN, tone));
    }

    let boosted = DislikeAnalyzer.fixIfDisliked(Hct.from(hue, chroma, tone));
    let [r, g, b] = hctToRgb(boosted);
    let { s } = rgbToHsl(r, g, b);
    for (let i = 0; s < MIN_ACCENT_SAT && i < 2; i++) {
        chroma = Math.min(92, chroma + 5);
        boosted = DislikeAnalyzer.fixIfDisliked(Hct.from(hue, chroma, tone));
        [r, g, b] = hctToRgb(boosted);
        s = rgbToHsl(r, g, b).s;
    }
    return boosted;
}

function edgeFromAccentHct(accentHct) {
    const chroma = Math.max(accentHct.chroma * 0.92, MIN_CHROMA * 0.85);
    const tone = Math.min(EDGE_TONE, Math.max(18, accentHct.tone - 22));
    return DislikeAnalyzer.fixIfDisliked(Hct.from(accentHct.hue, chroma, tone));
}

function clusterScore(argb, population, imageData, width, height) {
    const hct = DislikeAnalyzer.fixIfDisliked(Hct.fromInt(argb));
    if (DislikeAnalyzer.isDisliked(hct)) return 0;
    const [r, g, b] = hctToRgb(hct);
    if (isBrownishAccent(r, g, b)) return 0;
    if (hct.chroma < 18) return 0;

    const presence = centerPresenceForArgb(imageData.data, width, height, argb);
    if (presence < 0.015) return 0;

    const popBoost = Math.sqrt(Math.max(1, population));
    const chromaBoost = 0.7 + Math.min(1, hct.chroma / 72);
    const toneBoost = (hct.tone >= 22 && hct.tone <= 82) ? 1.1 : 0.75;
    return presence * popBoost * chromaBoost * toneBoost;
}

function hueDeltaDegrees(a, b) {
    return Math.abs(((a - b + 180) % 360) - 180);
}

function findAnchorHue(quantized, imageData, width, height) {
    let anchorHue = null;
    let anchorScore = 0;
    for (const [argb, population] of quantized.entries()) {
        const hct = DislikeAnalyzer.fixIfDisliked(Hct.fromInt(argb));
        if (DislikeAnalyzer.isDisliked(hct) || hct.chroma < 24) continue;
        const presence = centerPresenceForArgb(imageData.data, width, height, argb);
        const score = (presence + 0.04) * Math.sqrt(Math.max(1, population)) * (hct.chroma / 48);
        if (score > anchorScore) {
            anchorScore = score;
            anchorHue = hct.hue;
        }
    }
    if (anchorHue != null) return anchorHue;

    for (const [argb, population] of quantized.entries()) {
        const hct = DislikeAnalyzer.fixIfDisliked(Hct.fromInt(argb));
        if (hct.chroma < 20) continue;
        const score = Math.sqrt(Math.max(1, population)) * hct.chroma;
        if (score > anchorScore) {
            anchorScore = score;
            anchorHue = hct.hue;
        }
    }
    return anchorHue;
}

function scoreAccentCandidate(argb, population, anchorHue, imageData, width, height) {
    const rawHct = Hct.fromInt(argb);
    const fixedHct = DislikeAnalyzer.fixIfDisliked(rawHct);
    let score = clusterScore(argb, population, imageData, width, height);
    if (score <= 0 && fixedHct.chroma >= 28) {
        const [r, g, b] = hctToRgb(fixedHct);
        if (!isBrownishAccent(r, g, b) || fixedHct.chroma >= 40) {
            score = Math.sqrt(Math.max(1, population)) * (fixedHct.chroma / 58) * 0.55;
        }
    }
    if (score <= 0) return 0;
    if (anchorHue != null) {
        const delta = hueDeltaDegrees(fixedHct.hue, anchorHue);
        if (delta > 120) score *= 0.04;
        else if (delta > 100) score *= 0.08;
        else if (delta > 75) score *= 0.22;
        else if (delta > 45) score *= 0.55;
    }
    if (DislikeAnalyzer.isDisliked(rawHct)) score *= 0.35;
    return score;
}

function rankAccentCandidates(quantized, imageData, width, height) {
    const anchorHue = findAnchorHue(quantized, imageData, width, height);
    const candidates = [];
    for (const [argb, population] of quantized.entries()) {
        const score = scoreAccentCandidate(argb, population, anchorHue, imageData, width, height);
        if (score <= 0) continue;
        const hct = DislikeAnalyzer.fixIfDisliked(Hct.fromInt(argb));
        const [r, g, b] = hctToRgb(hct);
        if (isBrownishAccent(r, g, b) && hct.chroma < 36) continue;
        candidates.push({ hct, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
}

function pickAccentHct(quantized, imageData, width, height) {
    const ranked = rankAccentCandidates(quantized, imageData, width, height);
    for (const candidate of ranked.slice(0, ACCENT_CANDIDATE_LIMIT)) {
        if (DislikeAnalyzer.isDisliked(candidate.hct)) continue;
        return candidate.hct;
    }
    return pickHighestChromaFallback(quantized);
}

function pickHighestChromaFallback(quantized) {
    let bestHct = null;
    let bestScore = 0;
    for (const [argb, population] of quantized.entries()) {
        const hct = DislikeAnalyzer.fixIfDisliked(Hct.fromInt(argb));
        if (DislikeAnalyzer.isDisliked(hct) || hct.chroma < 24) continue;
        const [r, g, b] = hctToRgb(hct);
        if (isBrownishAccent(r, g, b) && hct.chroma < 40) continue;
        const score = hct.chroma * Math.sqrt(Math.max(1, population));
        if (score <= bestScore) continue;
        bestScore = score;
        bestHct = hct;
    }
    return bestHct;
}

function pickBoostedAccentHct(quantized, imageData, width, height) {
    const ranked = rankAccentCandidates(quantized, imageData, width, height);
    const tryList = ranked.length
        ? ranked.slice(0, ACCENT_CANDIDATE_LIMIT)
        : [];
    if (!tryList.length) {
        const fallback = pickHighestChromaFallback(quantized);
        return fallback ? boostAccentHct(fallback) : null;
    }
    for (const candidate of tryList) {
        const boosted = boostAccentHct(candidate.hct);
        if (!DislikeAnalyzer.isDisliked(boosted)) return boosted;
    }
    for (const candidate of tryList) {
        const fixed = DislikeAnalyzer.fixIfDisliked(candidate.hct);
        const boosted = boostAccentHct(fixed);
        if (!DislikeAnalyzer.isDisliked(boosted)) return boosted;
    }
    const fallback = pickHighestChromaFallback(quantized);
    if (!fallback) return null;
    const boosted = boostAccentHct(fallback);
    return DislikeAnalyzer.isDisliked(boosted) ? DislikeAnalyzer.fixIfDisliked(boosted) : boosted;
}

function buildMonochromeTheme(imageData, width, height) {
    const pixels = sampleWeightedArgbPixels(imageData.data, width, height);
    if (!pixels.length) return null;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    for (const argb of pixels) {
        rSum += redFromArgb(argb);
        gSum += greenFromArgb(argb);
        bSum += blueFromArgb(argb);
    }
    const n = pixels.length;
    const r = Math.round(rSum / n);
    const g = Math.round(gSum / n);
    const b = Math.round(bSum / n);
    const lum = relativeLum(r, g, b);
    return buildAccentFromImage(r, g, b, lum, true);
}

export function extractThemeFromImageData(imageData, width, height) {
    const pixels = sampleWeightedArgbPixels(imageData.data, width, height);
    if (!pixels.length) return null;

    const quantized = QuantizerCelebi.quantize(pixels, MAX_CLUSTERS);
    const accentHct = pickBoostedAccentHct(quantized, imageData, width, height);
    if (!accentHct) return buildMonochromeTheme(imageData, width, height);

    const [pr, pg, pb] = hctToRgb(accentHct);
    if (rgbToHsl(pr, pg, pb).s < 0.12) {
        const mono = buildMonochromeTheme(imageData, width, height);
        if (mono) return mono;
    }

    const edgeHct = edgeFromAccentHct(accentHct);
    return {
        uiAccent: argbToHex(accentHct.toInt()),
        edgeAccent: argbToHex(edgeHct.toInt()),
    };
}

function drawCoverSample(ctx, img, size) {
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.max(size / iw, size / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (size - dw) / 2;
    const dy = (size - dh) / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, dx, dy, dw, dh);
}

export function extractThemeFromImage(img, canvas, ctx) {
    if (!img?.naturalWidth || !img?.naturalHeight) return null;
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    try {
        drawCoverSample(ctx, img, SAMPLE_SIZE);
        const imageData = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        return extractThemeFromImageData(imageData, SAMPLE_SIZE, SAMPLE_SIZE);
    } catch {
        return null;
    }
}
