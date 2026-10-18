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
 *  - otherwise "unknown".
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
  return { severity: "unknown", basis: "no P0 label or severity wording in any brief version of this row" };
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
    .replace(/^[\s.;:—–-]+|[\s.;:—–-]+$/g, "")
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
    keys.set(urlKey(`${host}${p.path}`), `https://${host}${p.path}`);
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
      severityBasis: sev.severity === "unknown" ? "NDR-vs-FDR scoreboard gives no priority for this defect" : sev.basis,
      why,
      fix: "",
      links: linksFrom(`${d.row} ${d.proof}`),
      refs: [`NDR vs FDR scoreboard ${asOfD}`, ...(note ? [`Evidence Brief ${note.date}`] : []), d.proof ? `proof: ${d.proof.replace(/`/g, "")}` : ""].filter(Boolean),
      _text: `${d.row} ${d.fdr} ${d.proof}`,
    });
  }

  /* match to graph nodes */
  for (const it of items) {
    const hits = it.urls.filter((u) => crawlKeys.has(urlKey(u)));
    if (it.urls.length === 0) {
      it.match = { kind: "site-wide", nodes: [`brand:${it.brand}`] };
    } else if (hits.length) {
      it.match = { kind: "page", nodes: hits.map((u) => urlKey(u)).sort() };
      it.unmatchedUrls = it.urls.filter((u) => !crawlKeys.has(urlKey(u)));
    } else {
      const hostOnly = it.urls.every((u) => /^[^/]+$/.test(urlKey(u)));
      it.match = hostOnly
        ? { kind: "site-wide", nodes: [`brand:${it.brand}`] }
        : { kind: "unmapped", nodes: [], reason: "URL(s) not in the Pantheon crawl (off-sitemap, subdomain or 404)" };
    }
  }

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
    siteWide: count((i) => i.match.kind === "site-wide"),
    unmapped: count((i) => i.match.kind === "unmapped"),
    screenshots: used.size,
    severity: Object.fromEntries(["critical", "high", "medium", "low", "unknown"].map((s) => [s, count((i) => i.severity === s)])),
    status: Object.fromEntries(["open", "partly fixed", "fixed"].map((s) => [s, count((i) => i.status === s)])),
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
