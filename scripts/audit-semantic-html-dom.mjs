#!/usr/bin/env node
/**
 * Live semantic HTML audit in headless Chromium, run twice per URL:
 *   - server: the exact initial HTML response, parsed by Chromium with JavaScript disabled
 *   - client: the live hydrated DOM after scripts run (domcontentloaded + networkidle, 18 s cap, 500 ms settle)
 * The same checks run on both, so every finding records Server HTML vs Client DOM counts.
 *
 * Usage: node scripts/audit-semantic-html-dom.mjs [--urls audit.json] [--out page-results.json] [--only substr]
 * The URL list is the `pages` array of a previous audit (brand, k, p, path, requested_url).
 */
import fs from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const URLS_FILE = arg("--urls", "/workspace/semantic-html-audit-2026-11-24.json");
const OUT = arg("--out", "/workspace/semantic-html-audit-work/dom-page-results.json");
const ONLY = arg("--only", null);
const CONCURRENCY = Number(arg("--concurrency", "5"));
const NAV_TIMEOUT = 30000;
const IDLE_TIMEOUT = 18000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BLOCK_TYPES = new Set(["image", "media", "font"]);
const BLOCK_HOSTS =
  /(google-analytics|googletagmanager|doubleclick|googlesyndication|facebook\.net|connect\.facebook|hotjar|segment\.(io|com)|fullstory|clarity\.ms|bing\.com\/bat|tiktok|snapchat|pinterest|linkedin\.com\/px|quantserve|adsrvr|criteo|taboola|outbrain|newrelic|nr-data|datadoghq|sentry\.io|optimizely|heap(analytics)?|mouseflow|crazyegg|quora|reddit|twitter|ads-twitter|t\.co\/|yahoo|amplitude|mixpanel|onetrust|cookielaw|trustarc|qualtrics|liveperson|intercom|drift|zendesk|tealium|tiqcdn|ensighten|everesttech|demdex|omtrdc|adobedtm|rlcdn|bluekai|krxd|agkn)/i;

/** Runs inside the page. Returns findings + raw element counts for the current DOM. */
function auditDom(mode) {
  if (mode === "server") document.querySelectorAll("noscript").forEach((n) => n.remove());
  const findings = [];
  const add = (rule, severity, category, o = {}) =>
    findings.push({
      rule,
      severity,
      category,
      variant: o.variant ?? "",
      selector: o.selector ?? "",
      snippet: o.snippet ?? "",
      count_on_page: o.count ?? 1,
      extra: o.extra ?? {},
    });
  const IGN = "script,style,template,noscript";
  const inIgnored = (el) => !!el.parentElement?.closest(IGN);
  const hidden = (el) => {
    if (el.closest('[hidden],[aria-hidden="true"]')) return true;
    if (typeof el.checkVisibility === "function")
      return !el.checkVisibility({ checkVisibilityCSS: true });
    const cs = getComputedStyle(el);
    return cs.display === "none" || cs.visibility === "hidden";
  };
  const all = (sel) => [...document.querySelectorAll(sel)].filter((e) => !inIgnored(e));
  const vis = (sel) => all(sel).filter((e) => !hidden(e));
  const cssPath = (el) => {
    const parts = [];
    let cur = el;
    let depth = 0;
    while (cur && cur.nodeType === 1 && cur.tagName !== "HTML" && depth < 6) {
      let part = cur.tagName.toLowerCase();
      if (cur.id && /^[A-Za-z][\w:-]*$/.test(cur.id)) {
        parts.unshift(`${part}#${cur.id}`);
        break;
      }
      const cls = [...cur.classList].filter((c) => /^[A-Za-z_-][\w-]*$/.test(c)).slice(0, 2);
      if (cls.length) part += "." + cls.join(".");
      const p = cur.parentElement;
      if (p) {
        const same = [...p.children].filter((c) => c.tagName === cur.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
      }
      parts.unshift(part);
      cur = p;
      depth++;
    }
    return parts.join(" > ");
  };
  const txt = (el) => (el.innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
  const snip = (el, limit = 100) => {
    const tag = el.tagName.toLowerCase();
    const attrs = [...el.attributes]
      .filter((a) => !a.name.startsWith("data-") || a.name === "data-testid")
      .slice(0, 5)
      .map((a) => `${a.name}="${a.value.slice(0, 50)}"`)
      .join(" ");
    let open = `<${tag}${attrs ? " " + attrs : ""}>`;
    if (open.length > limit) open = open.slice(0, limit) + "…";
    const t = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 50);
    return t ? `${open} … ${t}` : open;
  };
  const byIdText = (ids) =>
    (ids || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .map((e) => (e.textContent ?? "").trim())
      .join(" ")
      .trim();
  const accName = (el) =>
    (el.getAttribute("aria-label") || "").trim() ||
    byIdText(el.getAttribute("aria-labelledby")) ||
    txt(el) ||
    (el.textContent ?? "").trim() ||
    (el.getAttribute("title") || "").trim() ||
    [...el.querySelectorAll("img[alt]")]
      .map((i) => i.alt.trim())
      .join(" ")
      .trim() ||
    [...el.querySelectorAll("svg[aria-label], svg title")]
      .map((s) => (s.getAttribute("aria-label") || s.textContent || "").trim())
      .join(" ")
      .trim() ||
    (el.getAttribute("value") || "").trim();

  const counts = {};
  for (const t of ["h1", "h2", "h3", "h4", "h5", "h6", "main", "header", "nav", "footer"])
    counts[t] = vis(t).length;
  const roleMain = vis('[role="main"]').length;
  const roleBanner = vis('[role="banner"]').length;
  const roleNav = vis('[role="navigation"]').length;
  const roleCi = vis('[role="contentinfo"]').length;

  // document
  const lang = (document.documentElement.getAttribute("lang") || "").trim();
  if (!lang)
    add("missing-html-lang", "high", "document", {
      selector: "html",
      snippet: "<html> has no lang attribute",
    });
  if (!document.title.trim())
    add("missing-or-empty-title", "high", "document", {
      selector: "head > title",
      snippet: "no <title> text",
    });
  const vp = document.querySelector('meta[name="viewport"]');
  if (!vp || !(vp.getAttribute("content") || "").trim())
    add("missing-viewport", "medium", "document", {
      selector: "head",
      snippet: 'no <meta name="viewport">',
    });
  const canon = document.querySelectorAll('link[rel="canonical"]');
  if (canon.length === 0)
    add("missing-canonical", "medium", "document", {
      selector: "head",
      snippet: 'no <link rel="canonical">',
    });
  else if (canon.length > 1)
    add("duplicate-canonical", "medium", "document", {
      selector: "head",
      snippet: [...canon].map((c) => c.getAttribute("href")).join(" | "),
      count: canon.length,
    });

  // landmarks
  const mains = vis("main");
  if (mains.length === 0 && roleMain === 0)
    add("missing-main", "high", "landmarks", {
      selector: "body",
      snippet: 'no visible <main> or role="main"',
      count: 1,
    });
  if (mains.length > 1)
    add("multiple-main", "high", "landmarks", {
      selector: cssPath(mains[0]),
      snippet: mains
        .slice(0, 3)
        .map((m) => snip(m))
        .join(" | "),
      count: mains.length,
      variant: `${mains.length}-main`,
    });
  if (counts.header === 0 && roleBanner === 0)
    add("missing-header", "high", "landmarks", {
      selector: "body",
      snippet: 'no visible <header> or role="banner"',
    });
  if (counts.nav === 0 && roleNav === 0)
    add("missing-nav", "high", "landmarks", {
      selector: "body",
      snippet: 'no visible <nav> or role="navigation"',
    });
  if (counts.footer === 0 && roleCi === 0)
    add("missing-footer", "high", "landmarks", {
      selector: "body",
      snippet: 'no visible <footer> or role="contentinfo"',
    });
  const navs = vis('nav,[role="navigation"]');
  if (navs.length > 1) {
    const labels = navs.map((n) =>
      (
        (n.getAttribute("aria-label") || "").trim() || byIdText(n.getAttribute("aria-labelledby"))
      ).toLowerCase(),
    );
    const seen = new Map();
    labels.forEach((l) => seen.set(l, (seen.get(l) ?? 0) + 1));
    const bad = navs.filter((_, i) => !labels[i] || seen.get(labels[i]) > 1);
    if (bad.length)
      add("multiple-nav-unlabelled", "medium", "landmarks", {
        variant: `${navs.length}-navs_${labels.filter((l) => !l).length}-unlabelled`,
        selector: cssPath(bad[0]),
        snippet: bad
          .slice(0, 4)
          .map(
            (n) =>
              `<nav> ${labels[navs.indexOf(n)] ? "(duplicate aria-label)" : "(no aria-label)"} ${snip(n, 70)}`,
          )
          .join(" | "),
        count: bad.length,
      });
  }

  // headings
  const h1s = vis("h1");
  const h1Texts = h1s.map((h) => txt(h) || (h.textContent ?? "").trim());
  if (h1s.length === 0)
    add("missing-h1", "high", "headings", {
      selector: "body",
      snippet: "no visible <h1> in the document",
      count: 1,
    });
  if (h1s.length > 1)
    add("multiple-h1", "medium", "headings", {
      variant: `${h1s.length} visible h1`,
      selector: cssPath(h1s[0]),
      snippet: h1s
        .slice(0, 5)
        .map(
          (h, i) =>
            `h1: ${h1Texts[i].slice(0, 60)}${h.dataset.testid ? ` [data-testid="${h.dataset.testid}"]` : ""}`,
        )
        .join(" | "),
      count: h1s.length,
      extra: { h1_texts: h1Texts.slice(0, 10) },
    });
  const heads = vis("h1,h2,h3,h4,h5,h6");
  const skips = [];
  let prev = null;
  for (const h of heads) {
    const lvl = Number(h.tagName[1]);
    if (prev !== null && lvl > prev + 1) skips.push({ v: `h${prev}->h${lvl}`, el: h });
    prev = lvl;
  }
  if (skips.length) {
    const vs = [...new Set(skips.map((s) => s.v))];
    add("skipped-heading-level", "high", "headings", {
      variant: vs.slice(0, 4).join(","),
      selector: cssPath(skips[0].el),
      snippet: skips
        .slice(0, 4)
        .map((s) => `${s.v} ${snip(s.el, 80)}`)
        .join(" | "),
      count: skips.length,
    });
  }
  const empties = heads.filter((h) => !accName(h));
  if (empties.length) {
    const by = {};
    empties.forEach((h) => (by[h.tagName.toLowerCase()] = (by[h.tagName.toLowerCase()] ?? 0) + 1));
    add("empty-heading", "medium", "headings", {
      variant: Object.entries(by)
        .sort()
        .map(([k, v]) => `${k}:${v}`)
        .join(","),
      selector: cssPath(empties[0]),
      snippet: empties
        .slice(0, 4)
        .map((h) => snip(h, 90))
        .join(" | "),
      count: empties.length,
    });
  }

  // interactive
  const nested = [];
  for (const outer of all("a[href], button")) {
    const ot = outer.tagName.toLowerCase();
    for (const inner of outer.querySelectorAll("a[href], button"))
      nested.push({ v: `${ot}>${inner.tagName.toLowerCase()}`, el: outer, inner });
  }
  if (nested.length) {
    const by = {};
    nested.forEach((n) => (by[n.v] = (by[n.v] ?? 0) + 1));
    add("nested-interactive", "critical", "interactive", {
      variant: Object.entries(by)
        .map(([k, v]) => `${k}:${v}`)
        .join(","),
      selector: cssPath(nested[0].el),
      snippet: nested
        .slice(0, 4)
        .map((n) => `${n.v} ${snip(n.el, 90)}`)
        .join(" | "),
      count: nested.length,
    });
  }
  const clickable = vis('div[role="button"], span[role="button"], div[onclick], span[onclick]');
  if (clickable.length) {
    const by = {};
    clickable.forEach((e) => {
      const k = `${e.tagName.toLowerCase()}${e.getAttribute("role") === "button" ? " role=button" : ""}${e.hasAttribute("onclick") ? " onclick" : ""}`;
      by[k] = (by[k] ?? 0) + 1;
    });
    add("clickable-noninteractive", "medium", "interactive", {
      variant: Object.entries(by)
        .map(([k, v]) => `${k}×${v}`)
        .join(", "),
      selector: cssPath(clickable[0]),
      snippet: clickable
        .slice(0, 4)
        .map((e) => snip(e, 90))
        .join(" | "),
      count: clickable.length,
    });
  }
  const badA = [];
  for (const a of vis("a")) {
    if ((a.getAttribute("role") || "").toLowerCase() === "button") continue;
    const href = a.getAttribute("href");
    let v = null;
    if (href === null) v = "missing";
    else if (!href.trim()) v = "empty";
    else if (href.trim() === "#") v = "hash";
    else if (/^\s*javascript:/i.test(href)) v = "javascript";
    if (v) badA.push({ v, el: a });
  }
  if (badA.length) {
    const by = {};
    badA.forEach((b) => (by[b.v] = (by[b.v] ?? 0) + 1));
    add("invalid-anchor-href", "medium", "interactive", {
      variant: Object.entries(by)
        .map(([k, v]) => `${k}:${v}`)
        .join(","),
      selector: cssPath(badA[0].el),
      snippet: badA
        .slice(0, 4)
        .map((b) => snip(b.el, 90))
        .join(" | "),
      count: badA.length,
    });
  }
  const emptyBtn = vis("button").filter((b) => !accName(b));
  if (emptyBtn.length)
    add("empty-button-name", "critical", "interactive", {
      selector: cssPath(emptyBtn[0]),
      snippet: emptyBtn
        .slice(0, 4)
        .map((b) => snip(b, 90))
        .join(" | "),
      count: emptyBtn.length,
    });

  // forms & media
  const SKIP_INPUT = new Set(["hidden", "submit", "button", "reset", "image"]);
  const unl = vis("input, select, textarea").filter((el) => {
    if (el.tagName === "INPUT" && SKIP_INPUT.has((el.getAttribute("type") || "text").toLowerCase()))
      return false;
    if (
      (el.getAttribute("aria-label") || "").trim() ||
      byIdText(el.getAttribute("aria-labelledby"))
    )
      return false;
    if ((el.getAttribute("title") || "").trim()) return false;
    if (el.labels && [...el.labels].some((l) => (l.textContent ?? "").trim())) return false;
    return true;
  });
  if (unl.length) {
    const by = {};
    unl.forEach((e) => {
      const k =
        e.tagName === "INPUT"
          ? `input[type=${(e.getAttribute("type") || "text").toLowerCase()}]`
          : e.tagName.toLowerCase();
      by[k] = (by[k] ?? 0) + 1;
    });
    add("form-control-missing-label", "critical", "forms", {
      variant: Object.entries(by)
        .map(([k, v]) => `${k}×${v}`)
        .join(", "),
      selector: cssPath(unl[0]),
      snippet: unl
        .slice(0, 4)
        .map((e) => snip(e, 100))
        .join(" | "),
      count: unl.length,
    });
  }
  const noAlt = vis("img").filter((i) => !i.hasAttribute("alt"));
  if (noAlt.length)
    add("img-missing-alt", "high", "media", {
      selector: cssPath(noAlt[0]),
      snippet: noAlt
        .slice(0, 4)
        .map((i) => snip(i, 100))
        .join(" | "),
      count: noAlt.length,
    });
  const svgs = vis("svg").filter((s) => {
    if (s.parentElement?.closest("svg")) return false;
    const role = (s.getAttribute("role") || "").toLowerCase();
    if (role === "presentation" || role === "none") return false;
    if ((s.getAttribute("aria-label") || "").trim() || byIdText(s.getAttribute("aria-labelledby")))
      return false;
    if (s.querySelector("title") && (s.querySelector("title").textContent || "").trim())
      return false;
    const ctl = s.closest('a[href], button, [role="button"], [role="link"]');
    if (ctl) {
      const c = ctl.cloneNode(true);
      c.querySelectorAll("svg").forEach((x) => x.remove());
      if ((ctl.getAttribute("aria-label") || "").trim() || (c.textContent || "").trim())
        return false;
    }
    return true;
  });
  if (svgs.length)
    add("unlabelled-svg", "medium", "media", {
      selector: cssPath(svgs[0]),
      snippet: svgs
        .slice(0, 4)
        .map((s) => snip(s, 90))
        .join(" | "),
      count: svgs.length,
    });

  // lists, tables, ids
  const badList = [];
  for (const l of all("ul, ol")) {
    for (const c of l.children) {
      const t = c.tagName.toLowerCase();
      if (!["li", "script", "template"].includes(t))
        badList.push({ k: `${l.tagName.toLowerCase()}>${t}`, el: c });
    }
  }
  if (badList.length) {
    const by = {};
    badList.forEach((b) => (by[b.k] = (by[b.k] ?? 0) + 1));
    add("invalid-list-child", "medium", "lists", {
      variant: Object.entries(by)
        .map(([k, v]) => `${k}×${v}`)
        .join(", "),
      selector: cssPath(badList[0].el),
      snippet: badList
        .slice(0, 4)
        .map((b) => snip(b.el, 90))
        .join(" | "),
      count: badList.length,
    });
  }
  const orphanLi = all("li").filter(
    (li) => !["UL", "OL", "MENU"].includes(li.parentElement?.tagName),
  );
  if (orphanLi.length) {
    const by = {};
    orphanLi.forEach((li) => {
      const k = li.parentElement?.tagName.toLowerCase() ?? "none";
      by[k] = (by[k] ?? 0) + 1;
    });
    add("li-outside-list", "medium", "lists", {
      variant: Object.entries(by)
        .map(([k, v]) => `parent=${k}:${v}`)
        .join(","),
      selector: cssPath(orphanLi[0]),
      snippet: orphanLi
        .slice(0, 3)
        .map((e) => snip(e, 90))
        .join(" | "),
      count: orphanLi.length,
    });
  }
  const badTables = [];
  for (const t of vis("table")) {
    const role = (t.getAttribute("role") || "").toLowerCase();
    if (role === "presentation" || role === "none") continue;
    const th = t.querySelector("th");
    const thead = t.querySelector("thead");
    if (!th && !thead) badTables.push({ v: "no-th-or-thead", el: t });
    else if (
      th &&
      !thead &&
      ![...t.querySelectorAll("th")].some((x) => (x.getAttribute("scope") || "").trim())
    )
      badTables.push({ v: "th-without-scope-or-thead", el: t });
  }
  if (badTables.length) {
    const by = {};
    badTables.forEach((b) => (by[b.v] = (by[b.v] ?? 0) + 1));
    add(
      "table-missing-headers",
      badTables.some((b) => b.v === "no-th-or-thead") ? "medium" : "low",
      "tables",
      {
        variant: Object.entries(by)
          .map(([k, v]) => `${k}:${v}`)
          .join(","),
        selector: cssPath(badTables[0].el),
        snippet: badTables
          .slice(0, 3)
          .map((b) => snip(b.el, 90))
          .join(" | "),
        count: badTables.length,
      },
    );
  }
  const idMap = new Map();
  for (const el of all("[id]")) {
    const id = el.id.trim();
    if (!id) continue;
    if (!idMap.has(id)) idMap.set(id, []);
    idMap.get(id).push(el);
  }
  const dups = [...idMap.entries()].filter(([, els]) => els.length > 1);
  if (dups.length) {
    const dupSet = new Set(dups.map(([id]) => id));
    const referenced = new Set();
    for (const el of all("[for],[aria-labelledby],[aria-describedby],[aria-controls],[headers]")) {
      for (const attr of ["for", "aria-labelledby", "aria-describedby", "aria-controls", "headers"])
        for (const tok of (el.getAttribute(attr) || "").split(/\s+/))
          if (dupSet.has(tok)) referenced.add(tok);
    }
    const svgOnly = dups.every(([, els]) =>
      els.every((e) => e.tagName.toLowerCase() !== "svg" && !!e.closest("svg")),
    );
    add("duplicate-id", referenced.size ? "high" : svgOnly ? "low" : "medium", "document", {
      variant: `${dups.length} unique ids duplicated; referenced=${referenced.size}`,
      selector: cssPath(dups[0][1][0]),
      snippet: dups
        .slice(0, 8)
        .map(([id, els]) => `id="${id}" ×${els.length} (${cssPath(els[0])})`)
        .join("; "),
      count: dups.reduce((s, [, els]) => s + els.length, 0),
      extra: {
        duplicate_ids: dups.slice(0, 8).map(([id]) => id),
        referenced_ids: [...referenced].slice(0, 12),
      },
    });
  }
  return { findings, counts: { ...counts, h1_texts: h1Texts.slice(0, 10) } };
}

async function wireRoutes(context) {
  await context.route("**/*", (route) => {
    const req = route.request();
    if (req.isNavigationRequest()) return route.continue();
    if (BLOCK_TYPES.has(req.resourceType()) || BLOCK_HOSTS.test(req.url())) return route.abort();
    return route.continue();
  });
}

async function settle(page, idle) {
  if (idle) await page.waitForLoadState("networkidle", { timeout: IDLE_TIMEOUT }).catch(() => {});
  else await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
}

function kindOf(ct) {
  if (/pdf/i.test(ct)) return "PDF";
  if (/spreadsheet|officedocument|msword|excel|zip/i.test(ct)) return "ZIP/Office document";
  return ct || "unknown";
}

async function auditOne(server, client, req, row) {
  const url = row.requested_url;
  const t0 = Date.now();
  const rec = {
    brand: row.brand,
    k: row.k,
    p: row.p,
    path: row.path,
    requested_url: url,
    final_url: url,
    status: null,
    ok: false,
    content_type: null,
    bytes: 0,
    redirects: [],
    elapsed_ms: 0,
    error: null,
    block: null,
    render: "chromium-dom",
    server_counts: null,
    client_counts: null,
    server_findings: [],
    findings: [],
  };
  try {
    // Initial server response (also used to detect non-HTML documents).
    const head = await req.get(url, { timeout: NAV_TIMEOUT, maxRedirects: 10 });
    const ct = head.headers()["content-type"] || "";
    rec.status = head.status();
    rec.content_type = ct;
    rec.final_url = head.url();
    const body = await head.body();
    rec.bytes = body.length;
    if (!/html/i.test(ct)) {
      rec.error = `non-html content: ${kindOf(ct)} (${ct.split(";")[0]})`;
      return rec;
    }
    if (rec.status >= 400) {
      rec.error = `http ${rec.status}`;
      return rec;
    }
    // Server HTML: same URL, JavaScript disabled, parsed by Chromium as-is.
    const sp = await server.newPage();
    try {
      await sp.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      await settle(sp, false);
      const s = await sp.evaluate(auditDom, "server");
      rec.server_findings = s.findings;
      rec.server_counts = s.counts;
    } finally {
      await sp.close();
    }
    // Client DOM: live hydrated page.
    const cp = await client.newPage();
    try {
      const resp = await cp.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      if (resp) rec.status = resp.status();
      rec.final_url = cp.url();
      await settle(cp, true);
      const c = await cp.evaluate(auditDom, "client");
      rec.findings = c.findings;
      rec.client_counts = c.counts;
    } finally {
      await cp.close();
    }
    rec.ok = true;
  } catch (e) {
    rec.error = `${e.name}: ${String(e.message).split("\n")[0]}`;
  } finally {
    rec.elapsed_ms = Date.now() - t0;
  }
  return rec;
}

async function main() {
  const src = JSON.parse(fs.readFileSync(URLS_FILE, "utf8"));
  let rows = (src.pages ?? src).map((p) => ({
    brand: p.brand ?? p.b,
    k: p.k,
    p: p.p,
    path: p.path,
    requested_url: p.requested_url ?? p.url,
  }));
  if (ONLY) rows = rows.filter((r) => r.requested_url.includes(ONLY));
  const browser = await chromium.launch({ headless: true });
  const common = { userAgent: UA, viewport: { width: 1440, height: 900 }, locale: "en-US" };
  const server = await browser.newContext({ ...common, javaScriptEnabled: false });
  const client = await browser.newContext({ ...common, javaScriptEnabled: true });
  await wireRoutes(server);
  await wireRoutes(client);
  const req = client.request;
  const results = new Array(rows.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < rows.length) {
      const i = next++;
      let rec = await auditOne(server, client, req, rows[i]);
      if (
        !rec.ok &&
        !String(rec.error).startsWith("non-html") &&
        !String(rec.error).startsWith("http 4")
      )
        rec = await auditOne(server, client, req, rows[i]);
      results[i] = rec;
      done++;
      console.log(
        `[${done}/${rows.length}] ${rec.ok ? "OK" : "FAIL"} ${rec.status} ${rec.requested_url} ${rec.elapsed_ms}ms ` +
          (rec.ok
            ? `server h1=${rec.server_counts.h1} main=${rec.server_counts.main} · client h1=${rec.client_counts.h1} main=${rec.client_counts.main} · findings s${rec.server_findings.length}/c${rec.findings.length}`
            : rec.error),
      );
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await browser.close();
  fs.writeFileSync(
    OUT,
    JSON.stringify({ audited_at: new Date().toISOString(), user_agent: UA, results }, null, 2) +
      "\n",
  );
  console.log(`wrote ${OUT} · ${results.filter((r) => r.ok).length}/${results.length} rendered`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
