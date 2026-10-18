#!/usr/bin/env node
/**
 * guard: no pink / no stripe cards (Satenik, 2026-10-19).
 *
 * Static scan of the UI source. Fails on:
 *  1. pink-*, fuchsia-*, rose-* Tailwind colour classes (any utility prefix);
 *  2. magenta-range hex colours (hue 290–345°, saturation ≥ 25 %, lightness 15–90 %);
 *  3. rounded cards with a coloured left accent stripe: an element whose className has both
 *     `rounded…` and `border-l-…` (width or colour), or a style with a coloured `borderLeft`.
 * Usage: node scripts/guard-ui-style.mjs [dir…]   (default: src)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ["src"];
const EXT = /\.(tsx?|jsx?|css|html)$/;
const SKIP = /(^|\/)(node_modules|\.output|\.vercel|dist)(\/|$)|routeTree\.gen\.ts$/;
// Data, not UI: crawl snapshots / brief text may quote any colour verbatim.
const DATA = /(^|\/)src\/data\//;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP.test(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXT.test(name) && !DATA.test(p)) out.push(p);
  }
  return out;
}

export function hexToHsl(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);
  if (h.length !== 6) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let hue;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  return { h: hue, s, l };
}

export function isMagenta(hex) {
  const c = hexToHsl(hex);
  return !!c && c.h >= 290 && c.h <= 345 && c.s >= 0.25 && c.l >= 0.15 && c.l <= 0.9;
}

const PINK_CLASS = /(?<![\w-])(?:[a-z]+:)*(?:bg|text|border(?:-[trblxy])?|ring|ring-offset|from|via|to|fill|stroke|outline|shadow|decoration|accent|caret|divide|placeholder)-(?:pink|fuchsia|rose)-\d{2,3}(?:\/\d+)?/g;
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const CLASS_ATTR = /class(?:Name)?=\{?\s*[`"']([^`"']*)[`"']/g;
const STRIPE = /(?<![\w-])border-l(?:-\d+|-\[[^\]]+\]|-(?!0\b)[a-z]+(?:-\d+)?)?(?![\w-])/;
const STYLE_STRIPE = /borderLeft\s*:\s*[`"'][^`"']*(#|rgb|var\(--color-(?!border))/;

export function scanText(text, file = "<text>") {
  const hits = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const at = `${file}:${i + 1}`;
    for (const m of line.matchAll(PINK_CLASS)) hits.push(`${at}  pink/fuchsia/rose class: ${m[0]}`);
    for (const m of line.matchAll(HEX)) if (isMagenta(m[0])) hits.push(`${at}  magenta-range colour: ${m[0]}`);
    for (const m of line.matchAll(CLASS_ATTR)) {
      const cls = m[1];
      if (/(?<![\w-])rounded/.test(cls) && STRIPE.test(cls) && !/(?<![\w-])border-l-0(?![\w-])/.test(cls))
        hits.push(`${at}  rounded card with left stripe: "${cls.slice(0, 90)}"`);
    }
    if (STYLE_STRIPE.test(line)) {
      const ctx = lines.slice(Math.max(0, i - 6), i + 6).join("\n");
      if (/rounded/.test(ctx)) hits.push(`${at}  coloured borderLeft stripe near a rounded element`);
    }
  });
  return hits;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = roots.flatMap((r) => walk(r));
  const hits = files.flatMap((f) => scanText(readFileSync(f, "utf8"), relative(process.cwd(), f)));
  if (hits.length) {
    console.error(`guard: no pink / no stripe cards — ${hits.length} violation(s):`);
    for (const h of hits) console.error(`  ${h}`);
    process.exit(1);
  }
  console.log(`guard: no pink / no stripe cards — ${files.length} files clean`);
}
