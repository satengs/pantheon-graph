#!/usr/bin/env node
/**
 * import:evidence — fold the SEO Evidence Brief spine + NDR-vs-FDR defects into
 * public/data/evidence.json and copy the screenshots those rows cite into
 * public/evidence/<hash>.png.
 *
 * Sources (EVIDENCE_ROOT, default /workspace):
 *   seo-vs-mkt/evidence-brief-YYYY-MM-DD/daily-brief.md        daily briefs (deltas)
 *   seo-vs-mkt weekly folders / weekly brief .md files          weekly Evidence Brief
 *   ndr-vs-fdr/scoreboard.md                                   D1–D6 FDR defects
 *   seo-vs-mkt pack .md files + images                               packs (screenshot mentions)
 *
 * Every brief is replayed oldest → newest (weekly after daily on the same date),
 * so a delta-only brief and a full-spine weekly brief both land on the same rows.
 * Idempotent: output is sorted and content-hashed; re-running with the same
 * sources writes byte-identical files and removes stale screenshots.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const ROOT = path.resolve(process.env.EVIDENCE_ROOT ?? "/workspace");
const SEO = path.join(ROOT, "seo-vs-mkt");
const NVF = path.join(ROOT, "ndr-vs-fdr");
const OUT_JSON = path.join(REPO, "public/data/evidence.json");
const OUT_DIR = path.join(REPO, "public/evidence");
const MANUAL_DIR = path.join(REPO, "data/evidence-manual");
const MAX_W = Number(process.env.EVIDENCE_MAX_W ?? 1280);
const DRY = process.argv.includes("--dry");

const HOSTS = {
  fdr: "freedomdebtrelief.com",
  achieve: "achieve.com",
  bills: "bills.com",
};
const BRAND_HOST = { fdr: "www.freedomdebtrelief.com", achieve: "www.achieve.com", bills: "www.bills.com" };

/* ───────────────────────── helpers ───────────────────────── */

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
/** Never let a box path reach the UI. */
const scrub = (s) => s.replace(/\/workspace\/[^\s`)|,]*/g, "(evidence pack)");
const sha = (buf, n = 12) => createHash("sha1").update(buf).digest("hex").slice(0, n);

export function urlKey(url) {
  return url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/[?#].*$/, "")
    .replace(/[.,;:)\]]+$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function brandOfHost(host) {
  const h = host.toLowerCase();
  for (const [b, base] of Object.entries(HOSTS)) if (h === base || h.endsWith(`.${base}`)) return b;
  return null;
}

function walk(dir, pred, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, pred, out);
    else if (pred(p)) out.push(p);
  }
  return out;
}

/** ISO week "2026-W43" → that week's Friday (the weekly brief lands Fri 18:22 Asia/Yerevan). */
function isoWeekFriday(y, w) {
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const mon = new Date(jan4);
  mon.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (w - 1) * 7);
  mon.setUTCDate(mon.getUTCDate() + 4);
  return mon.toISOString().slice(0, 10);
}

function dateOf(p) {
  const s = rel(p);
  const d = [...s.matchAll(/(20\d\d)-(\d\d)-(\d\d)/g)].pop();
  if (d) return `${d[1]}-${d[2]}-${d[3]}`;
  const w = /(20\d\d)-?W(\d\d)/i.exec(s);
  if (w) return isoWeekFriday(Number(w[1]), Number(w[2]));
  return fs.statSync(p).mtime.toISOString().slice(0, 10);
}

/* ───────────────────────── brief discovery ───────────────────────── */

/**
 * Daily: evidence-brief-YYYY-MM-DD/daily-brief.md. Weekly: any .md under a folder whose
 * name contains "weekly", or any weekly*brief*.md / *weekly*.md file, as long as
 * it carries a spine table (# | Status | … | Point). Newest date wins; on a tie
 * the weekly brief is applied last.
 */
export function discoverBriefs() {
  const all = walk(SEO, (p) => p.endsWith(".md"));
  const daily = all.filter((p) => /evidence-brief-[^/]+\/daily-brief\.md$/.test(rel(p)));
  const weekly = all.filter((p) => {
    const r = rel(p);
    if (!/weekly/i.test(r)) return false;
    if (/(^|\/)(room_messages|channel_draft|DELIVERED|tldr)\.md$/i.test(r)) return false;
    return hasSpine(fs.readFileSync(p, "utf8"));
  });
  const briefs = [
    ...daily.map((p) => ({ file: p, kind: "daily", date: dateOf(p) })),
    ...weekly.map((p) => ({ file: p, kind: "weekly", date: dateOf(p) })),
  ];
  briefs.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? a.file.localeCompare(b.file) : a.kind === "daily" ? -1 : 1));
  return briefs;
}

function splitRow(line) {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  // pipes inside backticks/links are rare; split naively but keep escaped pipes
  return t.split(/(?<!\\)\|/).map((c) => c.trim());
}

function hasSpine(md) {
  return md.split("\n").some((l) => isSpineHeader(l));
}
function isSpineHeader(l) {
  if (!l.trim().startsWith("|")) return false;
  const c = splitRow(l).map((x) => x.toLowerCase());
  return c[0] === "#" && c.some((x) => x.startsWith("status")) && c.some((x) => x.startsWith("point"));
}

/** Parse every spine table in a brief. Columns are looked up by name so a weekly
 *  format with extra columns (Severity / Priority / Owner) still parses. */
export function parseSpine(md) {
  const rows = [];
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!isSpineHeader(lines[i])) continue;
    const head = splitRow(lines[i]).map((x) => x.toLowerCase());
    const col = (re) => head.findIndex((h) => re.test(h));
    const ix = { id: 0, status: col(/^status/), tag: col(/^(tag|owner|team)/), point: col(/^point/), sev: col(/^(severity|priority|sev)\b/) };
    for (i += 2; i < lines.length && lines[i].trim().startsWith("|"); i++) {
      const c = splitRow(lines[i]);
      if (c.length < head.length - 1) continue;
      const point = c.slice(ix.point, ix.point + 1 + Math.max(0, c.length - head.length)).join(" | ");
      rows.push({
        id: c[ix.id],
        status: ix.status >= 0 ? c[ix.status] : "",
        tag: ix.tag >= 0 ? c[ix.tag] : "",
        point,
        sev: ix.sev >= 0 ? c[ix.sev] : "",
      });
    }
  }
  return rows;
}

/** "42–46" / "42-46" / "3, 4" → [42..46]; "D1–D6" → ["D1".."D6"]. */
function expandIds(id) {
  const s = id.replace(/\*/g, "").trim();
  const r = /^(D?)(\d+)\s*[–-]\s*D?(\d+)$/.exec(s);
  if (r) {
    const out = [];
    for (let n = Number(r[2]); n <= Number(r[3]); n++) out.push(`${r[1]}${n}`);
    return out;
  }
  return s.split(/\s*[,/]\s*/).filter((x) => /^D?\d+$/.test(x));
}

/* ───────────────────────── field extraction ───────────────────────── */

/**
 * Brief wording → severity. No new scoring:
 *  - a Severity/Priority column (weekly format) wins if present;
 *  - P0 → critical when the brief labels the row itself P0: a leading bold tag
 *    ("**P0-1** …"), a bold headline containing P0 ("**Same P0, new dest**"),
 *    or a status cell with P0 ("STILL OPEN · P0"). A passing mention of another
 *    row's P0 ("P0-4 reaches reviews") does not count;
 *  - High/Medium/Low only from explicit wording ("severity: high", "**High**");
 *  - otherwise "unrated".
 * Checked across every brief version of the row.
 */
export function severityFrom(points, statuses = [], sevCol = "") {
  const s = `${sevCol ?? ""}`.toLowerCase();
  if (s) {
    if (/\bp0\b|critical|blocker/.test(s)) return { severity: "critical", basis: `severity column "${sevCol}"` };
    if (/\bp1\b|\bhigh\b/.test(s)) return { severity: "high", basis: `severity column "${sevCol}"` };
    if (/\bp2\b|\bmed(ium)?\b/.test(s)) return { severity: "medium", basis: `severity column "${sevCol}"` };
    if (/\bp3\b|\blow\b/.test(s)) return { severity: "low", basis: `severity column "${sevCol}"` };
  }
  for (const t of points) {
    const m = /^\s*\*\*([^*]*\bP0(?:-\d+)?\b[^*]*)\*\*/.exec(t);
    if (m) return { severity: "critical", basis: `brief labels the row "${m[1].trim()}"` };
  }
  const st = statuses.find((x) => /(?<!near-)\bP0\b/i.test(x));
  if (st) return { severity: "critical", basis: `brief status "${st}"` };
  for (const t of points) {
    const w = /\b(?:severity|priority|impact)\s*[:=]?\s*\**\s*(critical|high|medium|low)\b|\*\*(critical|high|medium|low)(?:\s+(?:severity|priority))?\*\*/i.exec(t);
    if (w) {
      const v = (w[1] ?? w[2]).toLowerCase();
      return { severity: v, basis: `brief says "${w[0].replace(/\*/g, "")}"` };
    }
  }
  return { severity: "unrated", basis: "no P0 label or severity wording in any brief version of this row" };
}

export function statusFrom(s) {
  const u = s.toUpperCase();
  if (/\bPARTIAL|PARTLY|PARTIALLY\b/.test(u)) return "partly fixed";
  if (/\b(FIXED|RESOLVED|CLOSED(?! CHANNEL)|SHIPPED|DONE|RETIRED|WITHDRAWN)\b/.test(u) && !/\bNOT FIXED|UNFIXED|REOPEN/.test(u)) return "fixed";
  return "open";
}

const TAG_BOLD = /^\s*\*\*\s*(P0(?:-\d+)?|NEW|UPDATE[D]?|CONFIRMED|HOLD|HELD|STILL OPEN)\s*\*\*\s*[:·—–-]?\s*/i;
const cleanTxt = (x) =>
  x
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.;:—–→-]+|[\s.;:—–→-]+$/g, "")
    .trim();

/** "**headline** rest → Owner: fix" (also "**P0-1** www /apply 301 … — note"). */
export function splitPoint(point) {
  let p = scrub(point).replace(/\\\|/g, "|");
  while (TAG_BOLD.test(p)) p = p.replace(TAG_BOLD, "");
  let title;
  let rest;
  const b = /^\s*\*\*(.+?)\*\*\s*(.*)$/s.exec(p);
  if (b && b[1].length >= 12) {
    title = b[1];
    rest = b[2];
  } else {
    const cut = /\s(?:—|→)\s|;\s|\.\s/.exec(p);
    title = cut ? p.slice(0, cut.index) : p;
    rest = cut ? p.slice(cut.index) : "";
  }
  const arrow = rest.lastIndexOf("→ ");
  let why = rest;
  let fix = "";
  if (arrow >= 0 && arrow > rest.length * 0.35) {
    why = rest.slice(0, arrow);
    fix = rest.slice(arrow + 2);
  }
  title = cleanTxt(title);
  if (title.length > 140) title = `${title.slice(0, 139)}…`;
  return { title: title || "(untitled row)", why: cleanTxt(why), fix: cleanTxt(fix) };
}

/** Apply-funnel landing slugs the briefs cite without a host (`/fb`, `/fbcfos`, `/366o1`). */
const APPLY_SLUGS = /^\/(fb|fbcfos|366o1|fb\/estimated-debt)(\/|$)/i;
const OWN_HOST_RE = /\b((?:[a-z0-9-]+\.)*(?:freedomdebtrelief|achieve|bills)\.com)(\/[^\s`'")\]|,]*)?/gi;
const PATH_RE = /`([a-z]+…|[a-z0-9.-]+\.com)?(\/[A-Za-z0-9_\-./{}*]*)[^`]*`/g;

/** Own-brand URLs only (competitor / platform links stay as evidence links). */
export function urlsFrom(text, defaultBrand) {
  const out = new Map();
  const add = (host, p) => {
    const b = brandOfHost(host);
    if (!b) return;
    let pathPart = (p ?? "/").replace(/[…*{].*$/, "").replace(/[.,;:]+$/, "").replace(/\/{2,}/g, "/");
    if (!pathPart.startsWith("/")) pathPart = `/${pathPart}`;
    const h = host.toLowerCase().replace(/^www\./, "");
    const url = `https://${h === HOSTS[b] ? `www.${h}` : h}${pathPart}`;
    out.set(urlKey(url), url);
  };
  for (const m of text.matchAll(OWN_HOST_RE)) add(m[1], m[2]);
  for (const m of text.matchAll(PATH_RE)) {
    const pre = m[1];
    let p = m[2];
    if (p === "/" && !pre) continue;
    if (/^\/(workspace|raw|tmp|home)\b/.test(p)) continue;
    if (/\.(png|md|txt|json|tsv|html|xml)$/i.test(p)) continue;
    let host;
    if (pre && /\.com$/i.test(pre)) host = pre;
    else if (pre && /^apply/i.test(pre)) host = "apply.freedomdebtrelief.com";
    else if (pre && /^my/i.test(pre)) host = "my.freedomdebtrelief.com";
    else {
      const before = text.slice(Math.max(0, m.index - 60), m.index);
      const lastOf = (re) => {
        let idx = -1;
        for (const x of before.matchAll(re)) idx = x.index;
        return idx;
      };
      const cues = [
        ["apply.freedomdebtrelief.com", lastOf(/\bapply[.…]/g)],
        ["www.achieve.com", lastOf(/achieve|\bloans?\b|HELOC/gi)],
        ["www.bills.com", lastOf(/bills/gi)],
        ["www.freedomdebtrelief.com", lastOf(/\bFDR\b|freedom|\bwww\b/gi)],
        ["competitor", lastOf(/\bNDR\b|national ?debt|Americor|Accredited|ClearOne|debt\.com|Pacific|Beyond/gi)],
      ].filter((c) => c[1] >= 0);
      cues.sort((a, b) => b[1] - a[1]);
      if (cues.length && cues[0][0] === "competitor") continue;
      host = cues.length ? cues[0][0] : BRAND_HOST[defaultBrand];
      const explicitWww = /\bwww\s*$/i.test(before);
      // Meta/partner landings live on the Apply funnel, whatever brand is named nearby
      if (!explicitWww && APPLY_SLUGS.test(p)) host = "apply.freedomdebtrelief.com";
    }
    add(host, p);
  }
  return [...out.values()].sort();
}

function linksFrom(text) {
  const out = new Set();
  for (const m of text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) out.add(m[1]);
  for (const m of text.matchAll(/(?<!\()\bhttps?:\/\/[^\s)`'"|\]]+/g)) out.add(m[0].replace(/[.,;:]+$/, ""));
  return [...out].filter((u) => !u.includes("/workspace/")).sort();
}

function brandFrom(tag, text, urls) {
  const own = urls.map((u) => brandOfHost(new URL(u).host)).filter(Boolean);
  if (own.length) {
    const c = {};
    for (const b of own) c[b] = (c[b] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  }
  const t = `${tag} ${text}`;
  if (/\bLoans\b|achieve/i.test(tag) || /^\s*\*\*achieve/i.test(text)) return "achieve";
  if (/\bbills\b/i.test(tag) || /^\s*\*\*bills/i.test(text)) return "bills";
  if (/achieve/i.test(t) && !/\bFDR\b|freedom/i.test(t)) return "achieve";
  if (/bills\.com/i.test(t) && !/\bFDR\b|freedom/i.test(t)) return "bills";
  return "fdr";
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/* ───────────────────────── crawl match ───────────────────────── */

function loadCrawl() {
  const f = path.join(REPO, "src/data/crawl.json");
  const c = JSON.parse(fs.readFileSync(f, "utf8"));
  const keys = new Map();
  for (const p of c.pages ?? []) {
    const host = BRAND_HOST[p.b];
    if (!host) continue;
    keys.set(urlKey(`${host}${p.path}`), p.p ?? "other");
  }
  return keys;
}

/* ───────────────────────── screenshots ───────────────────────── */

function loadImages() {
  const imgs = walk(SEO, (p) => /\.(png|jpe?g|webp)$/i.test(p)).concat(walk(NVF, (p) => /\.(png|jpe?g|webp)$/i.test(p)));
  const byName = new Map();
  for (const p of imgs) {
    const name = path.basename(p);
    const list = byName.get(name) ?? [];
    list.push(p);
    byName.set(name, list);
  }
  return byName;
}

/** Lines in packs that mention an image file → { name, line, file }. */
function imageMentions(byName) {
  const mds = walk(SEO, (p) => p.endsWith(".md")).concat(walk(NVF, (p) => p.endsWith(".md")));
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  const out = [];
  for (const f of mds) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    for (const line of lines) {
      if (!/\.(png|jpe?g|webp)/i.test(line)) continue;
      for (const n of names) if (line.includes(n)) out.push({ name: n, line, file: f });
    }
  }
  return out;
}

function resizeTo(src, dest) {
  const py = `
import sys
from PIL import Image
src, dest, w = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src)
im = im.convert("RGBA") if im.mode in ("P", "LA") else im
if im.width > w:
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
if im.height > 2400:
    im = im.crop((0, 0, im.width, 2400))
im = im.convert("RGB") if im.mode == "RGBA" else im
im = im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) if im.mode == "RGB" else im
im.save(dest, "PNG", optimize=True)
`;
  try {
    execFileSync("python3", ["-c", py, src, dest, String(MAX_W)], { stdio: "pipe" });
    return true;
  } catch {
    fs.copyFileSync(src, dest);
    return false;
  }
}

/* ───────────────────────── NDR-vs-FDR defects ───────────────────────── */

const DEFECT_URLS = {
  D1: ["https://www.freedomdebtrelief.com/about-us/"],
  D2: ["https://www.freedomdebtrelief.com/"],
  D3: [],
  D4: ["https://www.freedomdebtrelief.com/learn/"],
  D5: ["https://www.freedomdebtrelief.com/fees/", "https://www.freedomdebtrelief.com/cost/", "https://www.freedomdebtrelief.com/vs/", "https://www.freedomdebtrelief.com/facts/"],
  D6: [],
};

function parseDefects() {
  const f = path.join(NVF, "scoreboard.md");
  if (!fs.existsSync(f)) return { items: [], source: null };
  const md = fs.readFileSync(f, "utf8");
  const items = [];
  let head = null;
  for (const line of md.split("\n")) {
    if (!line.trim().startsWith("|")) {
      head = null;
      continue;
    }
    const c = splitRow(line);
    if (!head) {
      head = c.map((x) => x.toLowerCase());
      continue;
    }
    if (/^-+$/.test(c[0].replace(/[:\s]/g, ""))) continue;
    const d = /FDR-defect \((D\d)\)/.exec(line);
    if (!d) continue;
    const get = (re) => c[head.findIndex((h) => re.test(h))] ?? "";
    const last = c[c.length - 1];
    const day = /day (\d+)/.exec(last);
    const asOf = get(/date|as of|checked/) || dateOf(f);
    items.push({
      id: d[1],
      row: c[0],
      ndr: c[1],
      fdr: c[2],
      owner: get(/owner|team|tag/) || "Public",
      proof: scrub(get(/proof|evidence|source/)),
      asOf: /\d{4}-\d\d-\d\d/.test(asOf) ? asOf : dateOf(f),
      last,
      days: day ? Number(day[1]) : null,
    });
  }
  return { items, source: f };
}


/* ───────────────────────── manual Scout rows + Funnel cross-check ───────────────────────── */

/** Normalise a title for dedupe (URL + title, or id). */
export function normTitle(t) {
  return `${t ?? ""}`.toLowerCase().replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
}

export function defaultSources(it) {
  if (it.source === "scout") return ["scout"];
  if (it.source === "ndr-vs-fdr") return ["evidence-brief"];
  return ["evidence-brief"];
}

function loadManualFiles() {
  if (!fs.existsSync(MANUAL_DIR)) return [];
  return fs
    .readdirSync(MANUAL_DIR)
    .filter((f) => f.endsWith(".json") && !/confirmations|overrides/i.test(f))
    .sort()
    .map((f) => ({ file: path.join(MANUAL_DIR, f), doc: JSON.parse(fs.readFileSync(path.join(MANUAL_DIR, f), "utf8")) }));
}

export function isDupe(items, raw) {
  const id = raw.id;
  if (id && items.some((i) => i.id === id)) return { reason: `id ${id}` };
  const title = normTitle(raw.title);
  const urls = new Set((raw.urls ?? []).map(urlKey));
  for (const it of items) {
    if (title && normTitle(it.title) === title) {
      const overlap = (it.urls ?? []).some((u) => urls.has(urlKey(u)));
      if (overlap || urls.size === 0 && (it.urls ?? []).length === 0) return { reason: `title+url ${it.id}` };
    }
  }
  return null;
}

export function manualToItem(raw, pack) {
  const source = raw.source ?? pack.source ?? "scout";
  const brands = raw.brands ?? (raw.brand ? [raw.brand] : ["fdr"]);
  const item = {
    id: raw.id,
    row: raw.row ?? null,
    source,
    title: raw.title,
    brand: raw.brand ?? brands[0],
    urls: raw.urls ?? [],
    owner: raw.owner ?? "",
    status: statusFrom(raw.status ?? "open"),
    statusText: raw.statusText ?? raw.status ?? "open",
    firstSeen: raw.firstSeen ?? pack.asOf,
    lastSeen: raw.lastSeen ?? pack.asOf,
    daysOpen: raw.daysOpen ?? daysBetween(raw.firstSeen ?? pack.asOf, raw.lastSeen ?? pack.asOf),
    severity: raw.severity ?? "unrated",
    severityBasis: raw.severityBasis ?? "manual row gives no P0 label or severity wording",
    why: raw.why ?? "",
    fix: raw.fix ?? "",
    firstReport: raw.firstReport ?? "",
    links: raw.links ?? [],
    refs: raw.refs ?? [pack.sourceLabel ?? pack.file],
    sources: raw.sources ?? defaultSources({ source }),
    confirmations: raw.confirmations ?? [],
    verification: raw.verification ?? "to_verify",
    flags: raw.flags ?? {},
    scope: raw.scope ?? "",
    _text: `${raw.title} ${raw.why ?? ""} ${raw.fix ?? ""}`,
  };
  if (raw.verificationNote) item.verificationNote = raw.verificationNote;
  if (raw.match) item.match = raw.match;
  return item;
}

/** Fold curated manual packs (e.g. Market Scout Nov 16) into the brief/defect list. Dedupe by id or URL+title. */
export function mergeManual(items) {
  const added = [];
  const skipped = [];
  for (const { file, doc } of loadManualFiles()) {
    const pack = { ...doc, file: rel(file) };
    for (const raw of doc.items ?? []) {
      const dupe = isDupe(items, raw);
      if (dupe) {
        skipped.push({ id: raw.id, reason: dupe.reason, file: pack.file });
        continue;
      }
      const item = manualToItem(raw, pack);
      items.push(item);
      added.push(item.id);
    }
  }
  return { added, skipped };
}

function loadConfirmationMap() {
  const f = path.join(MANUAL_DIR, "funnel-fix-confirmations-2026-11-12.json");
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

export const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

export function worseSev(a, b) {
  if (!a || !SEV_RANK[a]) return b;
  if (!b || !SEV_RANK[b]) return a;
  return SEV_RANK[a] >= SEV_RANK[b] ? a : b;
}

/**
 * Stamp Funnel Fix confirmations onto existing rows. Does not add Funnel rows as a source.
 * WR-FF-11 (Googlebot) is unverified, which is a separate status from "to verify".
 * Confirmed rows take their severity from the Funnel Fix impact (vendored from
 * funnel-fix-highlights-2026-11-17.json). To-verify and unverified rows stay Unrated.
 * When one row maps to more than one Funnel item, the worse impact is kept.
 */
export function applyConfirmations(items) {
  const map = loadConfirmationMap();
  const index = new Map(items.map((i) => [i.id, i]));
  const stamped = { confirmed: [], unverified: [], missing: [], severities: [] };
  if (!map) return stamped;
  const acc = new Map(); // id → { sev, codes, prior }
  for (const row of map.confirmed ?? []) {
    for (const id of row.evidenceIds ?? []) {
      const it = index.get(id);
      if (!it) {
        stamped.missing.push(id);
        continue;
      }
      if (!it.confirmations.includes("funnel-fix")) it.confirmations.push("funnel-fix");
      it.verification = "confirmed";
      it.verificationNote = `Confirmed by Funnel Fix 2026-11-12 (${row.funnel})`;
      stamped.confirmed.push(id);
      if (row.impact && SEV_RANK[row.impact] && it.verification !== "to_verify") {
        const cur = acc.get(id) ?? { sev: null, codes: [], prior: it.severity };
        if (!cur.codes.includes(row.funnel)) cur.codes.push(row.funnel);
        cur.sev = worseSev(cur.sev, row.impact);
        acc.set(id, cur);
      }
    }
  }
  for (const [id, cur] of acc) {
    const it = index.get(id);
    if (!it || !cur.sev) continue;
    it.severity = cur.sev;
    it.severityBasis =
      cur.codes.length > 1
        ? `Funnel Fix 2026-11-12 (${cur.codes.join(", ")}; worst impact: ${cur.sev})`
        : `Funnel Fix 2026-11-12 (${cur.codes[0]}) impact: ${cur.sev}`;
    stamped.severities.push({ id, from: cur.prior, to: cur.sev, codes: cur.codes });
  }
  for (const row of map.unverified ?? []) {
    for (const id of row.evidenceIds ?? []) {
      const it = index.get(id);
      if (!it) {
        stamped.missing.push(id);
        continue;
      }
      it.verification = "unverified";
      it.verificationNote = row.verificationNote ?? "unverified: needs Search Console or Cloudflare access";
      stamped.unverified.push(id);
      // Funnel may record an impact, but unverified rows stay Unrated.
    }
  }
  return stamped;
}

const UI_TEXT_FIELDS = [
  "title",
  "why",
  "fix",
  "firstReport",
  "statusText",
  "severityBasis",
  "verificationNote",
  "owner",
  "scope",
];

export function loadOverrides() {
  const f = path.join(MANUAL_DIR, "evidence-overrides.json");
  if (!fs.existsSync(f)) return { items: {}, replacements: [] };
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

/** Apply brand / URL / match / text overrides by id. Must run before matching. */
export function applyOverrides(items, ov = loadOverrides()) {
  const applied = [];
  for (const it of items) {
    const spec = ov.items?.[it.id];
    if (!spec) continue;
    if (spec.brand) it.brand = spec.brand;
    if (Array.isArray(spec.urls)) it.urls = spec.urls;
    if (spec.match) it.match = spec.match;
    if (typeof spec.why === "string") it.why = spec.why;
    if (spec.whySuffix && !(it.why ?? "").includes(spec.whySuffix)) {
      const base = (it.why ?? "").replace(/\s*$/, "");
      const sep = !base ? "" : /[.!?]$/.test(base) ? " " : ". ";
      it.why = `${base}${sep}${spec.whySuffix}`;
    }
    applied.push(it.id);
  }
  return applied;
}

export function applyReplacements(s, replacements = []) {
  let out = scrub(String(s));
  for (const { find, replace } of replacements) {
    if (!find) continue;
    out = out.split(find).join(replace ?? "");
  }
  return out;
}

/** Neutralise personal names and box paths in every UI string. */
export function sanitizeUiText(items, replacements) {
  const ov = replacements ?? loadOverrides().replacements ?? [];
  for (const it of items) {
    for (const f of UI_TEXT_FIELDS) {
      if (typeof it[f] === "string") it[f] = applyReplacements(it[f], ov);
    }
    if (Array.isArray(it.refs)) it.refs = it.refs.map((r) => applyReplacements(r, ov));
  }
}

const NAME_OR_PATH = /Satenik|Alea Hunt|(?:^|[^A-Za-z])\/workspace\//i;
export function assertCleanUiText(items) {
  for (const it of items) {
    for (const f of UI_TEXT_FIELDS) {
      if (typeof it[f] === "string" && NAME_OR_PATH.test(it[f])) {
        throw new Error(`UI text still contains a personal name or box path (${it.id}.${f})`);
      }
    }
    for (const r of it.refs ?? []) {
      if (NAME_OR_PATH.test(String(r))) {
        throw new Error(`UI text still contains a personal name or box path (${it.id}.refs)`);
      }
    }
  }
}

function hostOf(url) {
  try {
    return new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Off-graph acquisition / ad / app hosts that belong to a brand but have no crawl page. */
/** FDR's own Apply service (separate team), not an off-site ad host. */
export function isFdrApplyHost(host) {
  const h = (host ?? "").replace(/^www\./, "").toLowerCase();
  return h === "apply.freedomdebtrelief.com";
}

export function isOffsiteAdHost(host) {
  const h = (host ?? "").replace(/^www\./, "");
  if (isFdrApplyHost(h)) return false;
  if (/^apply\./i.test(h) && brandOfHost(h)) return true;
  if (/^start\.freedomfinancialnetwork\.com$/i.test(h)) return true;
  if (/^(app|go|ads|track)\./i.test(h) && brandOfHost(h)) return true;
  return false;
}

export function classifyUrl(url, crawlKeys) {
  const key = urlKey(url);
  if (crawlKeys.has(key)) return { kind: "crawl", key, product: crawlKeys.get(key), url };
  const host = hostOf(url);
  if (isFdrApplyHost(host)) {
    return {
      kind: "fdr-apply",
      host,
      brand: "fdr",
      reason: "FDR Apply service — rolled up to the Apply hub",
      url,
    };
  }
  if (isOffsiteAdHost(host)) {
    return { kind: "off-site-ad-host", host, brand: brandOfHost(host) ?? "fdr", reason: `off-site ad host (${host})`, url };
  }
  const brand = brandOfHost(host);
  if (brand) {
    return {
      kind: "own-off-crawl",
      host,
      brand,
      key,
      reason: "own URL not in crawl (404, off-sitemap or vanity)",
      url,
    };
  }
  if (/nationaldebtrelief\.com$/i.test(host.replace(/^www\./, ""))) {
    return { kind: "competitor", host, reason: "competitor-only (NDR)", url };
  }
  if (!host && !key) return { kind: "no-url", reason: "no URL in brief", url };
  return { kind: "other", host, reason: "URL not in the Pantheon crawl", url };
}

/**
 * Place a row on a brand or page node when we can; otherwise leave it unmapped
 * with a specific visible reason (never a blank reason).
 */
export function matchEvidenceItem(it, crawlKeys) {
  if (it.match && it.match.kind) return it.match;
  if (!it.urls.length) {
    const nodes = (it.brands ?? [it.brand]).filter(Boolean).map((b) => `brand:${b}`);
    it.match = { kind: "site-wide", nodes: nodes.length ? nodes : [`brand:${it.brand}`] };
    return it.match;
  }
  const classes = it.urls.map((u) => classifyUrl(u, crawlKeys));
  const crawl = classes.filter((c) => c.kind === "crawl");
  if (crawl.length) {
    const drawn = crawl.some((c) => c.product !== "other");
    it.match = { kind: "page", nodes: [...new Set(crawl.map((c) => c.key))].sort(), drawn };
    const leftover = classes.filter((c) => c.kind !== "crawl").map((c) => c.url);
    if (leftover.length) it.unmatchedUrls = leftover;
    return it.match;
  }
  const hostOnly = it.urls.every((u) => /^[^/]+$/.test(urlKey(u)));
  if (hostOnly) {
    it.match = { kind: "site-wide", nodes: [`brand:${it.brand}`] };
    return it.match;
  }
  const applyHits = classes.filter((c) => c.kind === "fdr-apply");
  if (applyHits.length && !classes.some((c) => c.kind === "own-off-crawl")) {
    it.brand = "fdr";
    it.owner = "Apply";
    it.match = {
      kind: "site-wide",
      nodes: ["hub:fdr:apply"],
      reason: "FDR Apply service (apply.freedomdebtrelief.com) — rolled up to the Apply hub",
    };
    return it.match;
  }
  const own = classes.filter((c) => c.kind === "own-off-crawl");
  if (own.length) {
    const brands = [...new Set(own.map((c) => c.brand))];
    it.match = {
      kind: "site-wide",
      nodes: brands.map((b) => `brand:${b}`),
      reason: "own URL not in crawl (404, off-sitemap or vanity) — rolled up to the brand",
    };
    const leftover = classes.filter((c) => c.kind !== "own-off-crawl").map((c) => c.url);
    if (leftover.length) it.unmatchedUrls = leftover;
    return it.match;
  }
  if (classes.every((c) => c.kind === "off-site-ad-host") || classes.some((c) => c.kind === "off-site-ad-host")) {
    const hosts = [...new Set(classes.filter((c) => c.kind === "off-site-ad-host").map((c) => c.host))];
    it.match = { kind: "unmapped", nodes: [], reason: `off-site ad host (${hosts.join(", ")})` };
    return it.match;
  }
  if (classes.every((c) => c.kind === "competitor")) {
    it.match = { kind: "unmapped", nodes: [], reason: "competitor-only (NDR)" };
    return it.match;
  }
  if (classes.every((c) => c.kind === "no-url")) {
    it.match = { kind: "unmapped", nodes: [], reason: "no URL in brief" };
    return it.match;
  }
  it.match = { kind: "unmapped", nodes: [], reason: classes[0]?.reason ?? "URL(s) not in the Pantheon crawl" };
  return it.match;
}

export function annotateSources(items) {
  for (const it of items) {
    it.sources = it.sources ?? defaultSources(it);
    it.confirmations = it.confirmations ?? [];
    if (!it.verification) it.verification = "reported";
  }
}

/* ───────────────────────── main ───────────────────────── */

function main() {
  const briefs = discoverBriefs();
  if (!briefs.length) {
    console.error(`No evidence briefs under ${SEO}`);
    process.exit(1);
  }
  const rows = new Map(); // id → state
  const defectNotes = new Map(); // "D2" → [{date, status, point}] from brief rows like "D2 / scale"
  for (const br of briefs) {
    const md = fs.readFileSync(br.file, "utf8");
    for (const r of parseSpine(md)) {
      const ids = expandIds(r.id);
      if (!ids.length) continue;
      const range = ids.length > 1;
      if (ids.every((x) => x.startsWith("D"))) {
        for (const id of ids) {
          const list = defectNotes.get(id) ?? [];
          list.push({ date: br.date, status: r.status, point: r.point });
          defectNotes.set(id, list);
        }
        continue;
      }
      for (const id of ids.filter((x) => !x.startsWith("D"))) {
        let s = rows.get(id);
        if (!s) {
          if (range) continue; // a range row only updates rows we already know
          s = { id, first: br.date, texts: [], statuses: [], tag: r.tag, point: r.point, sev: "" };
          rows.set(id, s);
        }
        s.last = br.date;
        s.lastBrief = br;
        s.statuses.push({ date: br.date, status: r.status });
        s.texts.push(r.point);
        if (r.sev) s.sev = r.sev;
        if (!range) {
          s.point = r.point;
          if (r.tag) s.tag = r.tag;
        }
      }
    }
  }
  const newest = briefs[briefs.length - 1];
  const asOf = newest.date;

  const crawlKeys = loadCrawl();
  const byName = loadImages();
  const mentions = imageMentions(byName);

  const items = [];
  for (const s of [...rows.values()]) {
    const allText = s.texts.join("\n");
    const latestSplit = splitPoint(s.point);
    const firstSplit = splitPoint(s.texts[0]);
    const terse = (t) => t.length < 24 || /\b(hold|held)\b\s*$/i.test(t);
    const title = terse(latestSplit.title) && !terse(firstSplit.title) ? firstSplit.title : latestSplit.title;
    const { why, fix } = latestSplit;
    const firstReport = s.texts.length > 1 ? cleanTxt(scrub(s.texts[0])) : "";
    const latest = s.statuses[s.statuses.length - 1].status;
    const status = statusFrom(latest);
    const fixedAt = status === "fixed" ? s.statuses.find((x) => statusFrom(x.status) === "fixed")?.date : null;
    const dayTxt = /\bday (\d+)\b/i.exec(s.point);
    const days = dayTxt ? Number(dayTxt[1]) : daysBetween(s.first, fixedAt ?? asOf);
    const brand0 = brandFrom(s.tag, s.point, []);
    const urls = urlsFrom(s.point, brand0);
    const brand = brandFrom(s.tag, s.point, urls);
    const sev = severityFrom(s.texts, s.statuses.map((x) => x.status), s.sev);
    items.push({
      id: `E${s.id}`,
      row: Number(s.id),
      source: "brief",
      title,
      brand,
      urls,
      owner: s.tag.replace(/\*\*/g, ""),
      status,
      statusText: scrub(latest.replace(/\*\*/g, "")),
      firstSeen: s.first,
      lastSeen: s.last,
      daysOpen: days,
      severity: sev.severity,
      severityBasis: sev.basis,
      why,
      fix,
      firstReport: firstReport && firstReport !== cleanTxt(scrub(s.point)) ? firstReport : "",
      links: linksFrom(s.point),
      refs: [...new Set(s.statuses.map((x) => `Evidence Brief ${x.date}`))].slice(-3),
      sources: ["evidence-brief"],
      confirmations: [],
      verification: "reported",
      flags: {},
      _text: allText,
    });
  }

  const { items: defects, source: defSrc } = parseDefects();
  for (const d of defects) {
    const notes = defectNotes.get(d.id) ?? [];
    const note = notes[notes.length - 1];
    const why = `${d.row}: FDR ${d.fdr}; NDR ${d.ndr}.${note ? ` Brief ${note.date} (${cleanTxt(note.status)}): ${cleanTxt(scrub(note.point))}` : ""}`;
    const sev = severityFrom([`${d.row} ${d.fdr}`], [d.last]);
    const asOfD = d.asOf;
    items.push({
      id: d.id,
      row: null,
      source: "ndr-vs-fdr",
      title: `${d.row} (${d.id})`,
      brand: "fdr",
      urls: DEFECT_URLS[d.id] ?? [],
      owner: d.owner,
      status: statusFrom(d.last),
      statusText: d.last,
      firstSeen: d.days != null ? new Date(Date.parse(asOfD) - d.days * 86400000).toISOString().slice(0, 10) : asOfD,
      lastSeen: asOfD,
      daysOpen: d.days,
      severity: sev.severity,
      severityBasis: sev.severity === "unrated" ? "NDR-vs-FDR scoreboard gives no priority for this defect" : sev.basis,
      why,
      fix: "",
      links: linksFrom(`${d.row} ${d.proof}`),
      refs: [`NDR vs FDR scoreboard ${asOfD}`, ...(note ? [`Evidence Brief ${note.date}`] : []), d.proof ? `proof: ${d.proof.replace(/`/g, "")}` : ""].filter(Boolean),
      sources: ["evidence-brief"],
      confirmations: [],
      verification: "reported",
      flags: {},
      _text: `${d.row} ${d.fdr} ${d.proof}`,
    });
  }

  const manual = mergeManual(items);
  annotateSources(items);
  const overridden = applyOverrides(items);
  const stamped = applyConfirmations(items);
  sanitizeUiText(items);
  assertCleanUiText(items);

  /* match to graph nodes (honor a pre-set match from a manual pack or override). */
  for (const it of items) matchEvidenceItem(it, crawlKeys);

  /* screenshots: A = filename quoted in the row, B = 10+ digit ad ID in filename & row,
     C = pack line naming the file also names an own URL / ad ID the row has. */
  const used = new Map(); // hash → {src, names:Set}
  for (const it of items) {
    const shots = new Set();
    const ids = new Set(it._text.match(/\b\d{10,}\b/g) ?? []);
    const keys = new Set(it.urls.map(urlKey).filter((k) => k.includes("/")));
    for (const name of byName.keys()) {
      if (it._text.includes(name)) shots.add(name);
      const fid = name.match(/\d{10,}/g) ?? [];
      if (fid.some((x) => ids.has(x))) shots.add(name);
    }
    for (const m of mentions) {
      const lineUrls = urlsFrom(m.line, it.brand).map(urlKey);
      const lineIds = m.line.match(/\b\d{10,}\b/g) ?? [];
      if (lineUrls.some((k) => keys.has(k)) || lineIds.some((x) => ids.has(x))) shots.add(m.name);
    }
    const out = [];
    for (const name of [...shots].sort()) {
      const srcs = byName.get(name) ?? [];
      // newest copy of that file name
      const src = srcs.slice().sort((a, b) => dateOf(b).localeCompare(dateOf(a)) || a.localeCompare(b))[0];
      if (!src) continue;
      const h = sha(fs.readFileSync(src));
      if (!used.has(h)) used.set(h, { src, names: new Set() });
      used.get(h).names.add(name);
      if (!out.some((x) => x.file === `/evidence/${h}.png`))
        out.push({ file: `/evidence/${h}.png`, name, pack: rel(path.dirname(src)), date: dateOf(src) });
    }
    it.screenshots = out;
    delete it._text;
  }

  items.sort((a, b) => (a.source === b.source ? (a.row ?? 0) - (b.row ?? 0) || a.id.localeCompare(b.id) : a.source === "brief" ? -1 : 1));

  /* assets */
  let resized = 0;
  if (!DRY) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const want = new Set([...used.keys()].map((h) => `${h}.png`));
    for (const f of fs.readdirSync(OUT_DIR)) if (f.endsWith(".png") && !want.has(f)) fs.unlinkSync(path.join(OUT_DIR, f));
    for (const [h, { src }] of used) {
      const dest = path.join(OUT_DIR, `${h}.png`);
      if (fs.existsSync(dest)) continue;
      if (resizeTo(src, dest)) resized++;
    }
  }

  const count = (pred) => items.filter(pred).length;
  const summary = {
    imported: items.length,
    briefRows: count((i) => i.source === "brief"),
    defects: count((i) => i.source === "ndr-vs-fdr"),
    matched: count((i) => i.match.kind === "page"),
    matchedDrawnPage: count((i) => i.match.kind === "page" && i.match.drawn),
    matchedBrandRollupOnly: count((i) => i.match.kind === "page" && !i.match.drawn),
    siteWide: count((i) => i.match.kind === "site-wide"),
    unmapped: count((i) => i.match.kind === "unmapped"),
    screenshots: used.size,
    severity: Object.fromEntries(["critical", "high", "medium", "low", "unrated"].map((s) => [s, count((i) => i.severity === s)])),
    status: Object.fromEntries(["open", "partly fixed", "fixed"].map((s) => [s, count((i) => i.status === s)])),
    scout: count((i) => (i.sources ?? []).includes("scout")),
    toVerify: count((i) => i.verification === "to_verify"),
    unverified: count((i) => i.verification === "unverified"),
    funnelConfirmed: count((i) => (i.confirmations ?? []).includes("funnel-fix")),
    manualAdded: manual.added,
    manualSkipped: manual.skipped,
    confirmationMissing: stamped.missing,
    overridesApplied: overridden,
    funnelSeverities: stamped.severities,
  };
  const doc = {
    version: 1,
    asOf,
    newestBrief: { kind: newest.kind, date: newest.date, file: rel(newest.file) },
    briefsReplayed: briefs.length,
    weeklyBriefs: briefs.filter((b) => b.kind === "weekly").map((b) => rel(b.file)),
    defectsSource: defSrc ? rel(defSrc) : null,
    summary,
    items,
  };
  const json = `${JSON.stringify(doc, null, 2)}\n`;
  if (json.includes("/workspace")) throw new Error("box path leaked into evidence.json");
  if (!DRY) {
    const prev = fs.existsSync(OUT_JSON) ? fs.readFileSync(OUT_JSON, "utf8") : "";
    if (prev !== json) fs.writeFileSync(OUT_JSON, json);
    console.log(prev === json ? "evidence.json unchanged" : "evidence.json written");
  }
  console.log(JSON.stringify({ newestBrief: doc.newestBrief, briefsReplayed: doc.briefsReplayed, weekly: doc.weeklyBriefs.length, ...summary, newlyResized: resized }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
