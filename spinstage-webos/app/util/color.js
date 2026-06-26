/** Color / accent helpers (pure) */

export function parseCssColor(value) {
    const v = (value || '').trim();
    if (!v) return null;
    if (v.startsWith('#')) {
        let hex = v.slice(1);
        if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
        const n = parseInt(hex, 16);
        if (Number.isNaN(n)) return null;
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    const rgb = v.match(/^rgba?\(\s*([\d.]+)(?:[,\s]+)([\d.]+)(?:[,\s]+)([\d.]+)/);
    if (rgb) return { r: rgb[1] | 0, g: rgb[2] | 0, b: rgb[3] | 0 };
    return null;
}

export function rgbToHex(r, g, b) {
    const clamp = (v) => Math.max(0, Math.min(255, v | 0));
    return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function relativeLum(r, g, b) {
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function rgbToHsl(r, g, b) {
    let rr = r / 255;
    let gg = g / 255;
    let bb = b / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
        else if (max === gg) h = ((bb - rr) / d + 2) / 6;
        else h = ((rr - gg) / d + 4) / 6;
    }
    return { h, s, l };
}

export function hslToRgb(h, s, l) {
    if (s <= 0.001) {
        const v = l * 255;
        return [v, v, v];
    }
    const hue2rgb = (p, q, t) => {
        let tt = t;
        if (tt < 0) tt += 1;
        if (tt > 1) tt -= 1;
        if (tt < 1 / 6) return p + (q - p) * 6 * tt;
        if (tt < 1 / 2) return q;
        if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
        return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
        hue2rgb(p, q, h + 1 / 3) * 255,
        hue2rgb(p, q, h) * 255,
        hue2rgb(p, q, h - 1 / 3) * 255,
    ];
}

export function themeContrastRatio(lumA, lumB) {
    const lighter = Math.max(lumA, lumB);
    const darker = Math.min(lumA, lumB);
    return (lighter + 0.05) / (darker + 0.05);
}

export function deriveEdgeAccent(accentHex) {
    const rgb = parseCssColor(accentHex);
    if (!rgb) return accentHex;
    let { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
    l = Math.max(0.10, l - 0.28);
    s = Math.min(1, s * 0.92);
    const edge = hslToRgb(h, s, l);
    return rgbToHex(edge[0], edge[1], edge[2]);
}

export function vizPaletteKey(low, high) {
    return `${low.r | 0},${low.g | 0},${low.b | 0}|${high.r | 0},${high.g | 0},${high.b | 0}`;
}

export function softUiSafe(r, g, b) {
    const hsl = rgbToHsl(r, g, b);
    let { h, s, l } = hsl;
    if (l > 0.88) l -= 0.16;
    else if (l < 0.12) l += 0.16;
    l = Math.min(0.80, Math.max(0.22, l));
    if (s < 0.08) s = 0.08;
    return hslToRgb(h, s, l);
}

/** Tan/brown/dark-orange — poor UI accents on dark backdrops. */
export function isBrownishAccent(r, g, b) {
    const { h, s, l } = rgbToHsl(r, g, b);
    if (s < 0.14) return false;
    const hDeg = h * 360;
    if (hDeg >= 68 && hDeg <= 118 && s >= 0.38 && l >= 0.30) return false;
    if (hDeg <= 14 || hDeg >= 346) {
        if (s >= 0.36 && l >= 0.24) return false;
    }
    if (hDeg >= 15 && hDeg <= 54) {
        if (l >= 0.14 && l <= 0.64 && (s < 0.48 || l < 0.48)) return true;
    }
    if (hDeg >= 24 && hDeg <= 58 && s >= 0.10 && s <= 0.40 && l >= 0.34 && l <= 0.80) {
        return true;
    }
    return false;
}

export function scoreAccentCandidate(r, g, b, avgLum) {
    if (isBrownishAccent(r, g, b)) return 0;
    const lum = relativeLum(r, g, b);
    const { h, s, l } = rgbToHsl(r, g, b);
    const contrast = themeContrastRatio(lum, avgLum);
    if (contrast < 1.35) return 0;

    const preferLight = avgLum < 0.42;
    const preferDark = avgLum > 0.58;
    let score = contrast * contrast;

    if (preferLight && lum >= 0.62) score *= 1.45 + (lum - 0.62) * 2.2;
    else if (preferLight && lum < 0.38) score *= 0.35;
    if (preferDark && lum <= 0.38) score *= 1.35 + (0.38 - lum) * 1.8;
    else if (preferDark && lum > 0.72) score *= 0.4;

    if (s >= 0.38 && l >= 0.28 && l <= 0.72) {
        score *= 1.7 + s * 0.85;
    } else if (s < 0.22) {
        score *= 0.2;
    }

    const hDeg = h * 360;
    if (s >= 0.42 && l >= 0.28) {
        if (hDeg <= 14 || hDeg >= 346) score *= 1.6;
        else if (hDeg >= 200 && hDeg <= 280) score *= 1.15;
    }

    return score;
}

export function buildAccentFromImage(baseR, baseG, baseB, backdropLum, isMonochrome) {
    let { h, s, l } = rgbToHsl(baseR, baseG, baseB);
    if (isBrownishAccent(baseR, baseG, baseB)) {
        h = h * 360 >= 15 && h * 360 <= 54 ? 0 : h;
        s = Math.min(1, Math.max(0.58, s * 1.5));
        l = Math.min(0.68, Math.max(l, 0.42));
    }
    let accentS = Math.min(1, Math.max(s, isMonochrome ? 0.20 : 0.38));
    let accentL = l;

    let accentRgb = hslToRgb(h, accentS, accentL);
    const minContrast = 2.2;
    const needsBoost = themeContrastRatio(
        relativeLum(accentRgb[0], accentRgb[1], accentRgb[2]),
        backdropLum,
    ) < minContrast;

    if (needsBoost) {
        if (backdropLum < 0.42) {
            accentL = Math.min(0.76, Math.max(l + 0.20, 0.55));
            accentS = Math.min(1, Math.max(accentS * 1.35, isMonochrome ? 0.22 : 0.40));
        } else {
            accentL = Math.max(0.24, Math.min(l - 0.16, 0.44));
            accentS = Math.min(1, Math.max(accentS * 1.25, 0.34));
        }
        accentRgb = hslToRgb(h, accentS, accentL);
    }

    const accentHex = rgbToHex(accentRgb[0], accentRgb[1], accentRgb[2]);
    const edgeRgb = hslToRgb(h, accentS * 0.92, Math.max(0.10, accentL - 0.28));
    const edgeHex = rgbToHex(edgeRgb[0], edgeRgb[1], edgeRgb[2]);
    if (isBrownishAccent(accentRgb[0], accentRgb[1], accentRgb[2])) {
        const boosted = hslToRgb(h * 360 >= 15 && h * 360 <= 54 ? 0 : h, Math.min(1, 0.72), Math.min(0.66, Math.max(0.44, accentL)));
        const uiAccent = rgbToHex(boosted[0], boosted[1], boosted[2]);
        return { uiAccent, edgeAccent: deriveEdgeAccent(uiAccent) };
    }
    return { uiAccent: accentHex, edgeAccent: edgeHex };
}
