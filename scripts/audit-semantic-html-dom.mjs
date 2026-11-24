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
import path from "node:path";
import { pathToFileURL } from "node:url";
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
  let streamed = 0;
  if (mode === "server") {
    document.querySelectorAll("noscript").forEach((n) => n.remove());
    // React streaming SSR ships Suspense content inside <div hidden id="S:n"> and swaps it in with
    // inline $RC/$RS scripts. That markup IS in the server HTML (crawlers parsing HTML see it), so
    // apply the swaps here instead of treating the hidden segment as missing.
    const scripts = [...document.querySelectorAll("script:not([src])")].map(
      (x) => x.textContent || "",
    );
    const calls = [];
    for (const t of scripts)
      for (const m of t.matchAll(/\$R([CS])\(\s*"([^"]+)"\s*,\s*"([^"]+)"/g))
        calls.push(m.slice(1));
    for (const [kind, a, b] of calls) {
      const seg = document.getElementById(kind === "C" ? b : a);
      const target = document.getElementById(kind === "C" ? a : b);
      if (!seg || !target || !seg.parentNode) continue;
      const frag = document.createDocumentFragment();
      while (seg.firstChild) frag.appendChild(seg.firstChild);
      if (kind === "C") {
        // Remove the fallback between the B:n template and the closing <!--/$--> comment.
        let n = target.nextSibling;
        let depth = 0;
        while (n) {
          const nx = n.nextSibling;
          if (n.nodeType === 8) {
            const d = n.data;
            if (d === "/$") {
              if (depth === 0) break;
              depth--;
            } else if (d === "$" || d === "$?" || d === "$!") depth++;
          }
          n.parentNode.removeChild(n);
          n = nx;
        }
        target.parentNode.insertBefore(frag, target);
        target.remove();
      } else {
        target.replaceWith(frag);
      }
      seg.remove();
      streamed++;
    }
    // Any streamed segment without a matching script: still server markup, so unhide it.
    document.querySelectorAll('div[hidden][id^="S:"]').forEach((d) => {
      d.removeAttribute("hidden");
      streamed++;
    });
  }
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
  return {
    findings,
    counts: { ...counts, h1_texts: h1Texts.slice(0, 10) },
    streamed_segments: streamed,
  };
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

// ---------- Response validation (never diff a challenge / error / partial page as "0 tags") ----------
const LANDMARKS = ["h1", "main", "header", "footer", "nav"];
const MIN_HTML_BYTES = 500;
const CHALLENGE_RES = [
  /just a moment\.\.\./i,
  /attention required!?\s*\|?\s*cloudflare/i,
  /<title>\s*attention required/i,
  /<title>\s*access denied/i,
  /checking your browser/i,
  /cf-browser-verification/i,
  /cf-challenge|challenge-platform\/h\/[a-z]\/orchestrate/i,
  /_incapsula_resource|incapsula incident id/i,
  /px-captcha|perimeterx/i,
  /<title>\s*(request rejected|403 forbidden|404 not found|502 bad gateway|503 service unavailable|504 gateway time-?out)/i,
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Strip script/style/template/noscript/comments so tag counts reflect real markup. */
function stripInert(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, "");
}
export function rawLandmarkCounts(html) {
  const s = stripInert(html);
  const out = {};
  for (const t of LANDMARKS) out[t] = (s.match(new RegExp(`<${t}[\\s>/]`, "gi")) || []).length;
  return out;
}
/** Validate a raw HTTP response as a genuine 200 HTML document. Returns null if valid, else a reason. */
export function invalidHtmlReason({ status, contentType, html }) {
  if (status !== 200) return `status ${status}`;
  if (!/text\/html|application\/xhtml/i.test(contentType || ""))
    return `content-type ${contentType || "missing"}`;
  if (!html || html.length < MIN_HTML_BYTES) return `tiny body (${html ? html.length : 0} bytes)`;
  if (!/<head[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) return "missing <head>/<body>";
  if (!/<\/html\s*>/i.test(html)) return "truncated (no </html>)";
  const probe =
    html.slice(0, 20000) + " " + (html.match(/<title[^>]*>[\s\S]*?<\/title>/i)?.[0] ?? "");
  for (const re of CHALLENGE_RES)
    if (re.test(probe)) return `challenge/interstitial (${re.source.slice(0, 40)})`;
  return null;
}

/** Runs in the page: cheap document-shape probe used to validate a rendered pass. */
function docProbe() {
  const d = document;
  const html = d.documentElement ? d.documentElement.outerHTML : "";
  const counts = {};
  for (const t of ["h1", "main", "header", "footer", "nav"])
    counts[t] = d.querySelectorAll(t).length;
  return {
    title: d.title || "",
    bytes: html.length,
    has_head: !!d.head,
    has_body: !!d.body,
    body_text: (d.body?.innerText || d.body?.textContent || "").trim().length,
    probe: (d.title || "") + " " + (d.body?.textContent || "").slice(0, 4000),
    counts,
  };
}
function invalidDocReason(probe, rawCounts, rawBytes) {
  if (!probe.has_head || !probe.has_body) return "rendered DOM missing <head>/<body>";
  if (probe.bytes < MIN_HTML_BYTES) return `rendered DOM tiny (${probe.bytes} bytes)`;
  if (probe.body_text < 50) return `rendered body text tiny (${probe.body_text} chars)`;
  for (const re of [
    /just a moment/i,
    /attention required/i,
    /access denied/i,
    /checking your browser/i,
    /cf-browser-verification/i,
  ])
    if (re.test(probe.probe) && probe.body_text < 3000)
      return `rendered challenge/interstitial (${re.source})`;
  if (rawBytes && probe.bytes < rawBytes * 0.5)
    return `rendered DOM incomplete (${probe.bytes} of ${rawBytes} raw bytes)`;
  if (rawCounts)
    for (const t of LANDMARKS)
      if (rawCounts[t] > 0 && probe.counts[t] === 0)
        return `rendered DOM lost <${t}> (raw HTML has ${rawCounts[t]}, DOM has 0)`;
  return null;
}

/** Raw initial HTML with retries: Playwright request first, then Node fetch with a browser UA. */
async function fetchRawHtml(req, url, log) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(1500 * 2 ** (attempt - 1));
    const viaFetch = attempt === 2;
    try {
      let status, ct, html, finalUrl, bytes;
      if (!viaFetch) {
        const r = await req.get(url, { timeout: NAV_TIMEOUT, maxRedirects: 10 });
        status = r.status();
        ct = r.headers()["content-type"] || "";
        finalUrl = r.url();
        const buf = await r.body();
        bytes = buf.length;
        html = /html/i.test(ct) ? buf.toString("utf8") : "";
      } else {
        const r = await fetch(url, {
          redirect: "follow",
          headers: {
            "user-agent": UA,
            accept: "text/html,application/xhtml+xml",
            "accept-language": "en-US,en;q=0.9",
          },
          signal: AbortSignal.timeout(NAV_TIMEOUT),
        });
        status = r.status;
        ct = r.headers.get("content-type") || "";
        finalUrl = r.url;
        const buf = Buffer.from(await r.arrayBuffer());
        bytes = buf.length;
        html = /html/i.test(ct) ? buf.toString("utf8") : "";
      }
      last = { status, ct, html, finalUrl, bytes, via: viaFetch ? "fetch" : "playwright-request" };
      // Non-HTML documents and hard 4xx are definitive; do not retry.
      if (!/html/i.test(ct) || (status >= 400 && status < 500 && status !== 403 && status !== 429))
        return { ...last, reason: null, definitive: true };
      const reason = invalidHtmlReason({ status, contentType: ct, html });
      if (!reason) return { ...last, reason: null };
      last.reason = reason;
      log.push(`raw#${attempt + 1} ${last.via}: ${reason}`);
    } catch (e) {
      last = { ...(last || {}), reason: `${e.name}: ${String(e.message).split("\n")[0]}` };
      log.push(`raw#${attempt + 1}: ${last.reason}`);
    }
  }
  return last;
}

/** One rendered pass (server = JS off, client = JS on) with validation + retries. */
async function renderPass(context, url, mode, raw, log) {
  let lastReason = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(1500 * 2 ** (attempt - 1));
    const page = await context.newPage();
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      const status = resp ? resp.status() : null;
      const ct = resp ? resp.headers()["content-type"] || "" : "";
      await settle(page, mode === "client");
      let reason = null;
      if (status !== 200) reason = `${mode} pass status ${status}`;
      else if (!/text\/html|application\/xhtml/i.test(ct))
        reason = `${mode} pass content-type ${ct || "missing"}`;
      else {
        const probe = await page.evaluate(docProbe);
        // Server pass must reflect the validated raw HTML; client pass only needs to be a real page.
        reason = invalidDocReason(
          probe,
          mode === "server" ? raw.counts : null,
          mode === "server" ? raw.bytes : 0,
        );
        if (reason) reason = `${mode} pass ${reason}`;
      }
      if (!reason) {
        const out = await page.evaluate(auditDom, mode);
        return { ok: true, status, final_url: page.url(), attempts: attempt + 1, ...out };
      }
      lastReason = reason;
      log.push(`${mode}#${attempt + 1}: ${reason}`);
    } catch (e) {
      lastReason = `${mode} pass ${e.name}: ${String(e.message).split("\n")[0]}`;
      log.push(`${mode}#${attempt + 1}: ${lastReason}`);
    } finally {
      await page.close().catch(() => {});
    }
  }
  return { ok: false, reason: lastReason };
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
    validation: { raw: null, server: null, client: null, log: [] },
    raw_counts: null,
    server_counts: null,
    client_counts: null,
    server_findings: [],
    findings: [],
  };
  const log = rec.validation.log;
  try {
    // 1) Raw initial server response, validated as a genuine 200 HTML page.
    const raw = await fetchRawHtml(req, url, log);
    rec.status = raw?.status ?? null;
    rec.content_type = raw?.ct ?? null;
    rec.final_url = raw?.finalUrl ?? url;
    rec.bytes = raw?.bytes ?? 0;
    if (raw?.ct && !/html/i.test(raw.ct)) {
      rec.error = `non-html content: ${kindOf(raw.ct)} (${raw.ct.split(";")[0]})`;
      return rec;
    }
    if (raw?.definitive && raw.status >= 400) {
      rec.error = `http ${raw.status}`;
      return rec;
    }
    if (!raw || raw.reason) {
      rec.error = `server HTML invalid after 3 attempts: ${raw?.reason ?? "no response"}`;
      rec.block = "server-pass-validation";
      return rec;
    }
    rec.validation.raw = `ok via ${raw.via} (${raw.bytes} bytes)`;
    raw.counts = rawLandmarkCounts(raw.html);
    rec.raw_counts = raw.counts;
    // 2) Server HTML: JavaScript disabled, parsed by Chromium, cross-checked against the raw HTML.
    const s = await renderPass(server, url, "server", raw, log);
    if (!s.ok) {
      rec.error = `server pass invalid after 3 attempts: ${s.reason}`;
      rec.block = "server-pass-validation";
      return rec;
    }
    rec.validation.server = `ok (attempt ${s.attempts})`;
    rec.server_findings = s.findings;
    rec.server_counts = s.counts;
    rec.server_streamed_segments = s.streamed_segments;
    // 3) Client DOM: live hydrated page, validated as a real page too.
    const c = await renderPass(client, url, "client", raw, log);
    if (!c.ok) {
      rec.error = `client pass invalid after 3 attempts: ${c.reason}`;
      rec.block = "client-pass-validation";
      rec.server_findings = [];
      rec.server_counts = null;
      return rec;
    }
    rec.validation.client = `ok (attempt ${c.attempts})`;
    rec.status = c.status;
    rec.final_url = c.final_url;
    rec.findings = c.findings;
    rec.client_counts = c.counts;
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
        !String(rec.error).startsWith("http 4") &&
        !rec.block
      )
        rec = await auditOne(server, client, req, rows[i]);
      results[i] = rec;
      done++;
      console.log(
        `[${done}/${rows.length}] ${rec.ok ? "OK" : "FAIL"} ${rec.status} ${rec.requested_url} ${rec.elapsed_ms}ms ` +
          (rec.ok
            ? `raw h1=${rec.raw_counts.h1} main=${rec.raw_counts.main} · server h1=${rec.server_counts.h1} main=${rec.server_counts.main} · client h1=${rec.client_counts.h1} main=${rec.client_counts.main} · findings s${rec.server_findings.length}/c${rec.findings.length}`
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

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
