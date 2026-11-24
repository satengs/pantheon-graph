#!/usr/bin/env node
/**
 * Live semantic HTML audit in headless Chromium, run twice per URL:
 *   - server: the exact initial HTML response, parsed by Chromium with JavaScript disabled
 *   - client: the live hydrated DOM after scripts run (domcontentloaded + networkidle, 18 s cap, 500 ms settle)
 * The same checks run on both, so every finding records Server HTML vs Client DOM counts.
 *
 * Usage: node scripts/audit-semantic-html-dom.mjs [--urls audit.json] [--out page-results.json] [--only substr]
 *   --mode dual (default): raw + server (JS off) + live client DOM per URL (deep Chromium tier).
 *   --mode server-sweep: full-site tier — concurrent fetch + JS-off Chromium parse of every URL
 *     (--fetch-concurrency 30, --parse-concurrency 10), same 200/HTML/non-challenge guard.
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
const MODE = arg("--mode", "dual"); // dual = raw + server (JS off) + client (JS on); server-sweep = tier 1
const FETCH_CONCURRENCY = Number(arg("--fetch-concurrency", "30"));
const PARSE_CONCURRENCY = Number(arg("--parse-concurrency", "10"));
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
  // ---------- SEO outline: headings that dilute the page's primary topic / secondary keywords ----------
  // These use every heading in the DOM (not only visible ones): crawlers read hidden mega-menus,
  // drawers and modals from the HTML even when CSS hides them.
  const hText = (h) => (h.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const HEADINGS = "h1,h2,h3,h4,h5,h6";
  const CHROME_SEL = 'header,nav,[role="banner"],[role="navigation"]';
  const FOOT_SEL = 'footer,[role="contentinfo"]';
  const inMain = (el) => !!el.closest('main,[role="main"]');
  const allHeadings = all(HEADINGS).filter((h) => hText(h));
  const levelSummary = (hs) => {
    const by = {};
    hs.forEach((h) => (by[h.tagName.toLowerCase()] = (by[h.tagName.toLowerCase()] ?? 0) + 1));
    return Object.entries(by)
      .sort()
      .map(([k, v]) => `${k}:${v}`)
      .join(",");
  };
  const sampleHeads = (hs, n = 8) =>
    hs.slice(0, n).map((h) => `<${h.tagName.toLowerCase()}> ${hText(h)}`);
  // Header/nav headings: menu items, drawers, mega-menu columns. A <header> inside <main>/<article>
  // is a content header, not site chrome, so it is excluded.
  const chromeHeads = allHeadings.filter(
    (h) =>
      h.closest(CHROME_SEL) &&
      !h.closest("main header, article header, [role='main'] header") &&
      h.tagName !== "H1",
  );
  if (chromeHeads.length)
    add(
      "heading-in-header-nav",
      chromeHeads.some((h) => /^H[23]$/.test(h.tagName)) ? "medium" : "low",
      "seo-outline",
      {
        variant: levelSummary(chromeHeads),
        selector: cssPath(chromeHeads[0]),
        snippet: sampleHeads(chromeHeads).join(" | "),
        count: chromeHeads.length,
        extra: {
          texts: sampleHeads(chromeHeads, 12),
          visible: chromeHeads.filter((h) => !hidden(h)).length,
        },
      },
    );
  const footHeads = allHeadings.filter(
    (h) =>
      h.closest(FOOT_SEL) && !h.closest("main footer, article footer") && !h.closest(CHROME_SEL),
  );
  if (footHeads.length)
    add(
      "heading-in-footer",
      footHeads.some((h) => /^H[23]$/.test(h.tagName)) ? "medium" : "low",
      "seo-outline",
      {
        variant: levelSummary(footHeads),
        selector: cssPath(footHeads[0]),
        snippet: sampleHeads(footHeads).join(" | "),
        count: footHeads.length,
        extra: {
          texts: sampleHeads(footHeads, 12),
          visible: footHeads.filter((h) => !hidden(h)).length,
        },
      },
    );
  // Same-level <h2> on secondary modules competing with the page's primary <h2>s.
  const SECONDARY_TEXT =
    /\b(related|more (articles|stories|posts|resources|from)|recommended|you (may|might) also|popular|trending|latest (articles|posts|news)|keep reading|read next|further reading|newsletter|subscribe|cookie|similar)\b/i;
  const SECONDARY_HOOK =
    /(related|recommend|more-?articles|read-?next|popular|trending|carousel|newsletter|subscribe|cookie|consent|modal|dialog|drawer|sidebar)/i;
  const hookOf = (h) => {
    let cur = h.parentElement;
    for (let d = 0; cur && d < 6 && cur !== document.body; d++, cur = cur.parentElement) {
      const sig = `${cur.id} ${typeof cur.className === "string" ? cur.className : ""} ${cur.getAttribute("data-testid") || ""} ${cur.getAttribute("aria-label") || ""}`;
      const m = sig.match(SECONDARY_HOOK);
      if (m) return m[1].toLowerCase();
    }
    return null;
  };
  const secondaryReason = (h) => {
    if (h.closest('aside,[role="complementary"]')) return "aside";
    if (h.closest('dialog,[role="dialog"],[aria-modal="true"]')) return "dialog";
    if (h.closest("a[href]")) return "card-link";
    if (SECONDARY_TEXT.test(hText(h))) return "related-text";
    const hook = hookOf(h);
    if (hook) return `module:${hook}`;
    return null;
  };
  const h2s = allHeadings.filter(
    (h) => h.tagName === "H2" && !h.closest(CHROME_SEL) && !h.closest(FOOT_SEL),
  );
  const secondaryH2 = [];
  const primaryH2 = [];
  for (const h of h2s) {
    const why = secondaryReason(h);
    if (why) secondaryH2.push({ h, why });
    else primaryH2.push(h);
  }
  if (secondaryH2.length && primaryH2.length) {
    const by = {};
    secondaryH2.forEach(({ why }) => (by[why.split(":")[0]] = (by[why.split(":")[0]] ?? 0) + 1));
    add("secondary-h2-competing", secondaryH2.length >= 3 ? "medium" : "low", "seo-outline", {
      variant: Object.entries(by)
        .sort()
        .map(([k, v]) => `${k}:${v}`)
        .join(","),
      selector: cssPath(secondaryH2[0].h),
      snippet:
        `${secondaryH2.length} secondary <h2> vs ${primaryH2.length} primary <h2>. Secondary: ` +
        secondaryH2
          .slice(0, 6)
          .map(({ h, why }) => `"${hText(h)}" (${why})`)
          .join(" | "),
      count: secondaryH2.length,
      extra: {
        texts: secondaryH2.slice(0, 12).map(({ h, why }) => `${hText(h)} (${why})`),
        primary_h2: primaryH2.slice(0, 8).map(hText),
        primary_count: primaryH2.length,
      },
    });
  }
  // Generic anchor text with no descriptive accessible name.
  const GENERIC =
    /^(learn more|read more|click here|here|more|view more|see more|view all|see all|get started|start now|continue|details|more info|find out more|discover more|go|apply now|this link|link)$/i;
  const genericLinks = [];
  for (const a of all("a[href]")) {
    const visible = (a.textContent ?? "").replace(/[\s›»→>|]+/g, " ").trim();
    if (!visible || !GENERIC.test(visible)) continue;
    const named =
      (a.getAttribute("aria-label") || "").trim() ||
      byIdText(a.getAttribute("aria-labelledby")) ||
      (a.getAttribute("title") || "").trim();
    if (named && !GENERIC.test(named.replace(/[\s›»→>|]+/g, " ").trim())) continue;
    genericLinks.push({ a, t: visible });
  }
  if (genericLinks.length) {
    const by = {};
    genericLinks.forEach(({ t }) => (by[t.toLowerCase()] = (by[t.toLowerCase()] ?? 0) + 1));
    add("generic-link-text", genericLinks.length >= 5 ? "medium" : "low", "seo-links", {
      variant: Object.entries(by)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([k, v]) => `${k}:${v}`)
        .join(","),
      selector: cssPath(genericLinks[0].a),
      snippet: genericLinks
        .slice(0, 6)
        .map(({ a, t }) => `"${t}" → ${(a.getAttribute("href") || "").slice(0, 70)}`)
        .join(" | "),
      count: genericLinks.length,
      extra: { texts: Object.keys(by).slice(0, 10) },
    });
  }
  // Editorial pages without <article>; related modules not isolated in <aside>.
  const ldTypes = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((x) => x.textContent || "")
    .join(" ");
  const ogType = (
    document.querySelector('meta[property="og:type"]')?.getAttribute("content") || ""
  ).toLowerCase();
  const published = !!document.querySelector(
    'meta[property="article:published_time"],meta[property="article:modified_time"],time[datetime]',
  );
  const editorial =
    location.pathname.replace(/\/+$/, "") !== "" &&
    ((ogType === "article" && published) ||
      /"@type"\s*:\s*"(Article|BlogPosting|NewsArticle|TechArticle|HowTo)"/.test(ldTypes) ||
      /\/(learn|blog|articles?|guides?|news|resources)\/[^/]+\/[^/]+/.test(location.pathname));
  const articles = all('article,[role="article"]');
  if (editorial && articles.length === 0)
    add("missing-article", "medium", "seo-outline", {
      variant:
        ogType === "article" && published
          ? "og:type=article"
          : /"@type"/.test(ldTypes)
            ? "json-ld"
            : "editorial-path",
      selector: "main",
      snippet: `Editorial page (${ogType === "article" && published ? "og:type article + published time" : "article schema / path"}) with no <article> element wrapping the story`,
    });
  const relatedNotAside = secondaryH2.filter(
    ({ why }) =>
      why === "related-text" ||
      /^module:(related|recommend|more-?articles|read-?next|popular|trending)/.test(why),
  );
  if (relatedNotAside.length)
    add("secondary-module-not-aside", "low", "seo-outline", {
      variant: `${relatedNotAside.length}-module`,
      selector: cssPath(relatedNotAside[0].h),
      snippet: relatedNotAside
        .slice(0, 5)
        .map(({ h }) => `"${hText(h)}"`)
        .join(" | "),
      count: relatedNotAside.length,
      extra: { texts: relatedNotAside.slice(0, 10).map(({ h }) => hText(h)) },
    });

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
  // ---------- Deep semantic checks (24 Nov 2026 deep audit) ----------
  const VALID_ROLES = new Set(
    "alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox comment complementary contentinfo definition deletion dialog directory document emphasis feed figure form generic grid gridcell group heading img image insertion link list listbox listitem log main mark marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option paragraph presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status strong subscript superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem doc-abstract doc-acknowledgments doc-afterword doc-appendix doc-backlink doc-biblioentry doc-bibliography doc-biblioref doc-chapter doc-colophon doc-conclusion doc-cover doc-credit doc-credits doc-dedication doc-endnote doc-endnotes doc-epigraph doc-epilogue doc-errata doc-example doc-footnote doc-foreword doc-glossary doc-glossref doc-index doc-introduction doc-noteref doc-notice doc-pagebreak doc-pagelist doc-part doc-preface doc-prologue doc-pullquote doc-qna doc-subtitle doc-tip doc-toc graphics-document graphics-object graphics-symbol".split(
      " ",
    ),
  );
  const groupBy = (items, key) => {
    const by = {};
    items.forEach((x) => (by[key(x)] = (by[key(x)] ?? 0) + 1));
    return Object.entries(by)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join(",");
  };
  // Document language: invalid lang, or Spanish content declared as English.
  if (lang && !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(lang))
    add("invalid-html-lang", "high", "document", {
      variant: `lang=${lang.slice(0, 20)}`,
      selector: "html",
      snippet: `<html lang="${lang.slice(0, 40)}">`,
    });
  const spanishPath = /(^|\/)(es|espanol|en-espanol)(\/|$)/i.test(location.pathname);
  if (spanishPath && !/^es\b/i.test(lang))
    add("spanish-page-wrong-lang", "high", "document", {
      variant: `lang=${lang || "missing"}`,
      selector: "html",
      snippet: `Spanish URL ${location.pathname} declares <html lang="${lang || ""}">`,
    });
  // Landmark nesting / duplicates.
  const badMain = all('main,[role="main"]').filter((m) =>
    m.parentElement?.closest(
      'header,footer,nav,aside,article,section,[role="banner"],[role="contentinfo"]',
    ),
  );
  if (badMain.length)
    add("landmark-misnested", "high", "landmarks", {
      variant: `main inside ${badMain[0].parentElement.closest("header,footer,nav,aside,article,section,[role]").tagName.toLowerCase()}`,
      selector: cssPath(badMain[0]),
      snippet: badMain
        .slice(0, 3)
        .map((m) => snip(m, 90))
        .join(" | "),
      count: badMain.length,
    });
  const sectioning = "article,aside,main,nav,section,header,footer";
  const topHeaders = vis("header").filter((h) => !h.parentElement?.closest(sectioning));
  const topFooters = vis("footer").filter((h) => !h.parentElement?.closest(sectioning));
  if (topHeaders.length > 1 || topFooters.length > 1)
    add("duplicate-banner-contentinfo", "medium", "landmarks", {
      variant: `${topHeaders.length}-header,${topFooters.length}-footer`,
      selector: cssPath((topHeaders.length > 1 ? topHeaders : topFooters)[1]),
      snippet: [
        ...(topHeaders.length > 1 ? topHeaders : []),
        ...(topFooters.length > 1 ? topFooters : []),
      ]
        .slice(0, 4)
        .map((h) => snip(h, 80))
        .join(" | "),
      count: Math.max(topHeaders.length, topFooters.length),
    });
  const asides = vis('aside,[role="complementary"]');
  if (asides.length > 1) {
    const labels = asides.map((n) =>
      (
        (n.getAttribute("aria-label") || "").trim() || byIdText(n.getAttribute("aria-labelledby"))
      ).toLowerCase(),
    );
    const seen = new Map();
    labels.forEach((l) => seen.set(l, (seen.get(l) ?? 0) + 1));
    const bad = asides.filter((_, i) => !labels[i] || seen.get(labels[i]) > 1);
    if (bad.length)
      add("multiple-aside-unlabelled", "low", "landmarks", {
        variant: `${asides.length}-asides`,
        selector: cssPath(bad[0]),
        snippet: bad
          .slice(0, 3)
          .map((n) => snip(n, 80))
          .join(" | "),
        count: bad.length,
      });
  }
  const unnamedSections = vis("section").filter(
    (s) =>
      !(s.getAttribute("aria-label") || "").trim() &&
      !byIdText(s.getAttribute("aria-labelledby")) &&
      !s.querySelector("h1,h2,h3,h4,h5,h6,[role=heading]"),
  );
  if (unnamedSections.length)
    add("section-without-name", unnamedSections.length >= 5 ? "low" : "low", "landmarks", {
      variant: `${unnamedSections.length}-sections`,
      selector: cssPath(unnamedSections[0]),
      snippet: unnamedSections
        .slice(0, 4)
        .map((s) => snip(s, 80))
        .join(" | "),
      count: unnamedSections.length,
    });
  // Excessive <h2> dilution.
  const allH2 = allHeadings.filter((h) => h.tagName === "H2");
  if (allH2.length > 10)
    add("excessive-h2", allH2.length > 20 ? "medium" : "low", "seo-outline", {
      variant: allH2.length > 30 ? ">30 h2" : allH2.length > 20 ? "21-30 h2" : "11-20 h2",
      selector: cssPath(allH2[0]),
      snippet:
        `${allH2.length} <h2> on the page (${allH2.filter((h) => h.closest(CHROME_SEL) || h.closest(FOOT_SEL)).length} in header/nav/footer). First: ` +
        allH2
          .slice(0, 8)
          .map((h) => `"${hText(h).slice(0, 40)}"`)
          .join(" | "),
      count: allH2.length,
      extra: { texts: allH2.slice(0, 15).map(hText) },
    });
  // Visual headings: big/bold short standalone text without heading semantics.
  const fakeHeads = [];
  const scope = document.querySelector('main,[role="main"]') || document.body;
  for (const el of scope.querySelectorAll("div,span,p,strong,b")) {
    if (fakeHeads.length > 40) break;
    if (
      inIgnored(el) ||
      el.closest(
        "h1,h2,h3,h4,h5,h6,[role=heading],a,button,label,legend,th,caption,figcaption,summary,nav,header,footer,li,blockquote,dt,select,option",
      )
    )
      continue;
    if ([...el.children].some((c) => !/^(BR|EM|I|STRONG|B|SPAN|SUP|SUB|SMALL)$/.test(c.tagName)))
      continue;
    if (
      el.children.length &&
      el.tagName === "DIV" &&
      [...el.children].some((c) => (c.textContent ?? "").trim() === (el.textContent ?? "").trim())
    )
      continue;
    const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t.length < 4 || t.length > 70) continue;
    const words = t.split(" ").length;
    if (words > 10 || (/[.!?:]$/.test(t) && words > 6)) continue;
    if (!/[A-Za-z]{3}/.test(t) || /^[$~]?\s*\d[\d.,]*\s*[%+xX]?\s*\S{0,12}\+?$/.test(t)) continue;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize) || 0;
    const fw = Number(cs.fontWeight) || (cs.fontWeight === "bold" ? 700 : 400);
    if (!(fs >= 22 && fw >= 500) && !(fs >= 28)) continue;
    if (hidden(el)) continue;
    // Skip if the parent already contributes the same text (count the innermost block once).
    if (fakeHeads.some((f) => f.el.contains(el) || el.contains(f.el))) continue;
    fakeHeads.push({ el, t, fs, fw });
  }
  if (fakeHeads.length)
    add("visual-heading-not-semantic", fakeHeads.length >= 3 ? "medium" : "low", "seo-outline", {
      variant: groupBy(fakeHeads, (f) => f.el.tagName.toLowerCase()),
      selector: cssPath(fakeHeads[0].el),
      snippet: fakeHeads
        .slice(0, 5)
        .map(
          (f) =>
            `<${f.el.tagName.toLowerCase()}> "${f.t.slice(0, 50)}" (${Math.round(f.fs)}px/${f.fw})`,
        )
        .join(" | "),
      count: fakeHeads.length,
      extra: { texts: fakeHeads.slice(0, 10).map((f) => f.t) },
    });
  // iframes without an accessible title.
  const frames = all("iframe").filter((f) => {
    if (f.closest('[aria-hidden="true"]')) return false;
    if ((f.getAttribute("title") || "").trim() || (f.getAttribute("aria-label") || "").trim())
      return false;
    const w = Number(f.getAttribute("width")),
      h = Number(f.getAttribute("height"));
    if ((w === 0 || w === 1) && (h === 0 || h === 1)) return false;
    return !hidden(f);
  });
  if (frames.length)
    add("iframe-missing-title", "medium", "media", {
      variant: groupBy(frames, (f) => {
        try {
          return new URL(f.src, location.href).hostname || "inline";
        } catch {
          return "inline";
        }
      }),
      selector: cssPath(frames[0]),
      snippet: frames
        .slice(0, 3)
        .map((f) => snip(f, 110))
        .join(" | "),
      count: frames.length,
    });
  // Radio / checkbox groups without <fieldset>+<legend> or a named group role.
  const groups = new Map();
  for (const i of vis('input[type="radio"],input[type="checkbox"]')) {
    const k = `${i.type}:${i.name || "(no name)"}:${i.form ? [...document.forms].indexOf(i.form) : -1}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  }
  const badGroups = [];
  for (const [k, els] of groups) {
    if (els.length < 2 || (k.includes("(no name)") && els[0].type === "checkbox")) continue;
    const ok = els.every((e) => {
      const fsEl = e.closest("fieldset");
      if (fsEl && (fsEl.querySelector("legend")?.textContent ?? "").trim()) return true;
      const g = e.closest('[role="radiogroup"],[role="group"]');
      return (
        !!g &&
        !!(
          (g.getAttribute("aria-label") || "").trim() || byIdText(g.getAttribute("aria-labelledby"))
        )
      );
    });
    if (!ok) badGroups.push({ k, el: els[0], n: els.length });
  }
  if (badGroups.length)
    add("choice-group-missing-fieldset", "high", "forms", {
      variant: groupBy(badGroups, (g) => g.k.split(":")[0]),
      selector: cssPath(badGroups[0].el),
      snippet: badGroups
        .slice(0, 4)
        .map((g) => `${g.n}× ${g.k.split(":").slice(0, 2).join(' name="')}" ${snip(g.el, 70)}`)
        .join(" | "),
      count: badGroups.length,
    });
  // Broken <label for>.
  const brokenFor = all("label[for]").filter((l) => {
    const id = l.getAttribute("for");
    if (!id) return false;
    const t = document.getElementById(id);
    return !t || !/^(INPUT|SELECT|TEXTAREA|METER|PROGRESS|OUTPUT|BUTTON)$/.test(t.tagName);
  });
  if (brokenFor.length)
    add("label-for-broken", "high", "forms", {
      selector: cssPath(brokenFor[0]),
      snippet: brokenFor
        .slice(0, 4)
        .map((l) => snip(l, 90))
        .join(" | "),
      count: brokenFor.length,
    });
  // ARIA: broken id references, invalid roles, conflicting roles, positive tabindex, focusable in aria-hidden.
  const brokenRefs = [];
  for (const el of all("[aria-labelledby],[aria-describedby],[aria-controls]")) {
    for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls"]) {
      const v = (el.getAttribute(attr) || "").trim();
      if (!v) continue;
      for (const id of v.split(/\s+/))
        if (!document.getElementById(id)) brokenRefs.push({ attr, id, el });
    }
  }
  if (brokenRefs.length)
    add(
      "aria-reference-broken",
      brokenRefs.some((b) => b.attr === "aria-labelledby") ? "high" : "medium",
      "aria",
      {
        variant: groupBy(brokenRefs, (b) => b.attr),
        selector: cssPath(brokenRefs[0].el),
        snippet: brokenRefs
          .slice(0, 4)
          .map((b) => `${b.attr}="${b.id}" (no such id) ${snip(b.el, 70)}`)
          .join(" | "),
        count: brokenRefs.length,
      },
    );
  const badRoles = [];
  for (const el of all("[role]")) {
    const roles = (el.getAttribute("role") || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!roles.length) continue;
    const r = roles[0];
    const tag = el.tagName.toLowerCase();
    if (!VALID_ROLES.has(r)) badRoles.push({ v: `invalid role="${r}"`, el });
    else if (tag === "a" && el.hasAttribute("href") && r === "button")
      badRoles.push({ v: 'a[href] role="button"', el });
    else if (tag === "button" && r === "link") badRoles.push({ v: 'button role="link"', el });
    else if (/^h[1-6]$/.test(tag) && !["heading", "none", "presentation", "tab"].includes(r))
      badRoles.push({ v: `${tag} role="${r}"`, el });
    else if (["ul", "ol"].includes(tag) && ["button", "link"].includes(r))
      badRoles.push({ v: `${tag} role="${r}"`, el });
  }
  if (badRoles.length)
    add(
      "aria-role-invalid",
      badRoles.some((b) => b.v.startsWith("invalid")) ? "high" : "medium",
      "aria",
      {
        variant: groupBy(badRoles, (b) => b.v),
        selector: cssPath(badRoles[0].el),
        snippet: badRoles
          .slice(0, 4)
          .map((b) => `${b.v} ${snip(b.el, 70)}`)
          .join(" | "),
        count: badRoles.length,
      },
    );
  const posTab = all("[tabindex]").filter((e) => Number(e.getAttribute("tabindex")) > 0);
  if (posTab.length)
    add("positive-tabindex", "medium", "aria", {
      variant: groupBy(posTab, (e) => `tabindex=${e.getAttribute("tabindex")}`),
      selector: cssPath(posTab[0]),
      snippet: posTab
        .slice(0, 4)
        .map((e) => snip(e, 90))
        .join(" | "),
      count: posTab.length,
    });
  const FOCUSABLE =
    'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),iframe,[tabindex],[contenteditable="true"]';
  const hiddenFocus = [];
  for (const h of all('[aria-hidden="true"]')) {
    const cands = [h, ...h.querySelectorAll(FOCUSABLE)].filter(
      (e) => e.matches(FOCUSABLE) && e.getAttribute("tabindex") !== "-1" && !e.closest("[inert]"),
    );
    for (const e of cands) {
      if (
        typeof e.checkVisibility === "function" &&
        !e.checkVisibility({ checkVisibilityCSS: true })
      )
        continue;
      hiddenFocus.push(e);
    }
  }
  if (hiddenFocus.length)
    add("focusable-in-aria-hidden", "high", "aria", {
      variant: groupBy(hiddenFocus, (e) => e.tagName.toLowerCase()),
      selector: cssPath(hiddenFocus[0]),
      snippet: hiddenFocus
        .slice(0, 4)
        .map((e) => snip(e, 90))
        .join(" | "),
      count: hiddenFocus.length,
    });
  // Links with no accessible name at all (icon-only links).
  const unnamedLinks = vis("a[href]").filter((a) => !accName(a));
  if (unnamedLinks.length)
    add("link-missing-name", "high", "seo-links", {
      selector: cssPath(unnamedLinks[0]),
      snippet: unnamedLinks
        .slice(0, 4)
        .map((a) => snip(a, 100))
        .join(" | "),
      count: unnamedLinks.length,
    });
  // <img> alt that is a filename or generic placeholder.
  const PLACEHOLDER_ALT =
    /^(image|img|icon|logo|photo|picture|pic|graphic|banner|placeholder|untitled|spacer|thumbnail|hero|default|null|undefined|alt|image of|photo of)[\s_-]*\d*$/i;
  const FILE_ALT =
    /(\.(jpe?g|png|gif|webp|svg|avif|bmp)$)|^(img|dsc|dscn|image|screenshot|screen shot|shutterstock|getty|istock|adobestock)[\s_-]*\d+/i;
  const badAlt = vis("img[alt]").filter((i) => {
    const a = i.getAttribute("alt").trim();
    return a && (PLACEHOLDER_ALT.test(a) || FILE_ALT.test(a));
  });
  if (badAlt.length)
    add("img-placeholder-alt", "medium", "media", {
      variant: groupBy(badAlt, (i) =>
        FILE_ALT.test(i.alt.trim()) ? "filename" : `alt=${i.alt.trim().toLowerCase().slice(0, 20)}`,
      ),
      selector: cssPath(badAlt[0]),
      snippet: badAlt
        .slice(0, 4)
        .map((i) => `alt="${i.getAttribute("alt").slice(0, 60)}" ${snip(i, 70)}`)
        .join(" | "),
      count: badAlt.length,
    });
  // Parity snapshot (compared server vs client in aggregation).
  const mainEl = document.querySelector('main,[role="main"]');
  const parityRoot = mainEl || document.body;
  const parity = {
    has_main: !!mainEl,
    main_text: (parityRoot.textContent ?? "").replace(/\s+/g, " ").trim().length,
    main_links: [
      ...new Set(
        [...parityRoot.querySelectorAll("a[href]")]
          .filter((a) => !inIgnored(a))
          .map((a) => {
            try {
              const u = new URL(a.getAttribute("href"), location.href);
              return u.protocol.startsWith("http")
                ? u.origin + u.pathname.replace(/\/+$/, "")
                : null;
            } catch {
              return null;
            }
          })
          .filter(Boolean),
      ),
    ].slice(0, 600),
    main_headings: [
      ...new Set(
        [...parityRoot.querySelectorAll("h1,h2,h3,h4,h5,h6")]
          .filter((h) => !inIgnored(h))
          .map((h) => `${h.tagName.toLowerCase()} ${hText(h)}`)
          .filter((s) => s.length > 3),
      ),
    ].slice(0, 300),
  };
  return {
    findings,
    counts: { ...counts, h1_texts: h1Texts.slice(0, 10) },
    streamed_segments: streamed,
    parity,
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
    rec.server_parity = s.parity;
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
    rec.client_parity = c.parity;
    rec.ok = true;
  } catch (e) {
    rec.error = `${e.name}: ${String(e.message).split("\n")[0]}`;
  } finally {
    rec.elapsed_ms = Date.now() - t0;
  }
  return rec;
}

// ---------- Full-site server HTML sweep (tier 1) ----------
const CSS_CACHE = new Map();
function cssFor(url) {
  if (!CSS_CACHE.has(url))
    CSS_CACHE.set(
      url,
      fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) })
        .then(async (r) =>
          r.ok
            ? {
                body: Buffer.from(await r.arrayBuffer()),
                ct: r.headers.get("content-type") || "text/css",
              }
            : null,
        )
        .catch(() => null),
    );
  return CSS_CACHE.get(url);
}

/** Raw initial HTML via Node fetch with a browser UA, validated as a genuine 200 HTML page (3 attempts). */
async function fetchRawNode(url, log) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(1500 * 2 ** (attempt - 1));
    try {
      const r = await fetch(url, {
        redirect: "follow",
        headers: {
          "user-agent": UA,
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(NAV_TIMEOUT),
      });
      const ct = r.headers.get("content-type") || "";
      const buf = Buffer.from(await r.arrayBuffer());
      const html = /html/i.test(ct) ? buf.toString("utf8") : "";
      last = { status: r.status, ct, html, finalUrl: r.url, bytes: buf.length, via: "fetch" };
      if (
        !/html/i.test(ct) ||
        (r.status >= 400 && r.status < 500 && r.status !== 403 && r.status !== 429)
      )
        return { ...last, reason: null, definitive: true };
      const reason = invalidHtmlReason({ status: r.status, contentType: ct, html });
      if (!reason) return { ...last, reason: null };
      last.reason = reason;
      log.push(`raw#${attempt + 1}: ${reason}`);
    } catch (e) {
      last = { ...(last || {}), reason: `${e.name}: ${String(e.message).split("\n")[0]}` };
      log.push(`raw#${attempt + 1}: ${last.reason}`);
    }
  }
  return last;
}

/** Parse validated raw HTML in Chromium with JS off (CSS applied from a shared cache, no other network). */
async function serverParse(page, state, url, raw) {
  state.url = raw.finalUrl || url;
  state.html = raw.html;
  const t0 = Date.now();
  await page.goto(state.url, { waitUntil: "load", timeout: NAV_TIMEOUT });
  const t1 = Date.now();
  const probe = await page.evaluate(docProbe);
  const reason = invalidDocReason(probe, raw.counts, raw.bytes);
  if (reason) return { ok: false, reason: `server pass ${reason}` };
  const out = await page.evaluate(auditDom, "server");
  return { ok: true, ...out, timing: { goto: t1 - t0, audit: Date.now() - t1 } };
}

async function serverSweep(rows) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    javaScriptEnabled: false,
  });
  const results = new Array(rows.length);
  // Pipeline: FETCH_CONCURRENCY workers fetch raw HTML, then borrow one of PARSE_CONCURRENCY
  // JS-off Chromium pages to parse it. Raw HTML is dropped right after parsing (bounded memory).
  const pool = [];
  const waiters = [];
  for (let k = 0; k < PARSE_CONCURRENCY; k++) {
    const page = await ctx.newPage();
    const state = { url: null, html: null };
    await page.route("**/*", async (route) => {
      const req = route.request();
      if (req.isNavigationRequest() && req.frame() === page.mainFrame())
        return route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: state.html ?? "",
        });
      if (req.resourceType() === "stylesheet") {
        const c = await cssFor(req.url());
        return c ? route.fulfill({ status: 200, contentType: c.ct, body: c.body }) : route.abort();
      }
      return route.abort();
    });
    pool.push({ page, state });
  }
  const borrow = () =>
    pool.length ? Promise.resolve(pool.pop()) : new Promise((r) => waiters.push(r));
  const giveBack = (p) => (waiters.length ? waiters.shift()(p) : pool.push(p));
  const parseOnce = (slot, row, raw) =>
    serverParse(slot.page, slot.state, row.requested_url, raw).catch((e) => ({
      ok: false,
      reason: `${e.name}: ${String(e.message).split("\n")[0]}`,
    }));
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: FETCH_CONCURRENCY }, async () => {
      while (next < rows.length) {
        const i = next++;
        const row = rows[i];
        const log = [];
        const raw = await fetchRawNode(row.requested_url, log);
        const rec = {
          brand: row.brand,
          k: row.k,
          p: row.p,
          path: row.path,
          requested_url: row.requested_url,
          final_url: raw?.finalUrl ?? row.requested_url,
          status: raw?.status ?? null,
          ok: false,
          content_type: raw?.ct ?? null,
          bytes: raw?.bytes ?? 0,
          error: null,
          block: null,
          tier: "server-sweep",
          validation: { log },
          raw_counts: null,
          server_counts: null,
          server_findings: [],
        };
        try {
          if (raw?.ct && !/html/i.test(raw.ct))
            rec.error = `non-html content: ${kindOf(raw.ct)} (${raw.ct.split(";")[0]})`;
          else if (raw?.definitive && raw.status >= 400) rec.error = `http ${raw.status}`;
          else if (!raw || raw.reason) {
            rec.error = `server HTML invalid after 3 attempts: ${raw?.reason ?? "no response"}`;
            rec.block = "server-pass-validation";
          } else {
            raw.counts = rawLandmarkCounts(raw.html);
            rec.raw_counts = raw.counts;
            const slot = await borrow();
            let s;
            try {
              s = await parseOnce(slot, row, raw);
              if (!s.ok) s = await parseOnce(slot, row, raw);
            } finally {
              slot.state.html = null;
              giveBack(slot);
            }
            if (!s.ok) {
              rec.error = s.reason;
              rec.block = "server-pass-validation";
            } else {
              rec.ok = true;
              rec.server_counts = s.counts;
              rec.server_findings = s.findings;
              rec.server_streamed_segments = s.streamed_segments;
              rec.timing = s.timing;
              rec.server_parity = {
                has_main: s.parity.has_main,
                main_text: s.parity.main_text,
                main_links: s.parity.main_links.length,
                main_headings: s.parity.main_headings.length,
              };
            }
          }
        } catch (e) {
          rec.error = `${e.name}: ${String(e.message).split("\n")[0]}`;
        }
        if (raw) raw.html = null;
        results[i] = rec;
        if (++done % 100 === 0 || done === rows.length)
          console.log(
            `[server ${done}/${rows.length}] ${rec.ok ? "OK" : "FAIL"} ${rec.requested_url} ${rec.ok ? `h1=${rec.server_counts.h1} findings=${rec.server_findings.length}` : rec.error}`,
          );
      }
    }),
  );
  await browser.close();
  return results;
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
  if (MODE === "server-sweep") {
    const t0 = Date.now();
    const results = await serverSweep(rows);
    fs.writeFileSync(
      OUT,
      JSON.stringify({
        audited_at: new Date(t0).toISOString(),
        user_agent: UA,
        mode: MODE,
        elapsed_ms: Date.now() - t0,
        results,
      }) + "\n",
    );
    console.log(
      `wrote ${OUT} · ${results.filter((r) => r.ok).length}/${results.length} server HTML parsed in ${Math.round((Date.now() - t0) / 1000)}s`,
    );
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const common = { userAgent: UA, viewport: { width: 1440, height: 900 }, locale: "en-US" };
  const server = await browser.newContext({ ...common, javaScriptEnabled: false });
  const client = await browser.newContext({ ...common, javaScriptEnabled: true });
  await wireRoutes(server);
  await wireRoutes(client);
  const req = client.request;
  const results = new Array(rows.length);
  // Resumable: every finished URL is appended to OUT.jsonl; a restart skips those URLs.
  const JSONL = `${OUT}.jsonl`;
  const prior = new Map();
  if (fs.existsSync(JSONL))
    for (const line of fs.readFileSync(JSONL, "utf8").split("\n"))
      if (line.trim()) {
        const r = JSON.parse(line);
        prior.set(r.requested_url, r);
      }
  rows.forEach((r, i) => {
    if (prior.has(r.requested_url)) results[i] = prior.get(r.requested_url);
  });
  let next = 0;
  let done = results.filter(Boolean).length;
  async function worker() {
    while (next < rows.length) {
      const i = next++;
      if (results[i]) continue;
      let rec = await auditOne(server, client, req, rows[i]);
      if (
        !rec.ok &&
        !String(rec.error).startsWith("non-html") &&
        !String(rec.error).startsWith("http 4") &&
        !rec.block
      )
        rec = await auditOne(server, client, req, rows[i]);
      results[i] = rec;
      fs.appendFileSync(JSONL, JSON.stringify(rec) + "\n");
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
