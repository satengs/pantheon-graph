export type HtmlFinding = {
  id: string;
  code: string;
  title: string;
  lane: "fdr" | "achieve" | "issue" | "performance";
  url: string;
  why: string;
  found: string;
  suggested: string;
};

type Heading = { level: number; text: string; inFooter: boolean; inNav: boolean };

function strip(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

function textOf(tag: string): string {
  return tag.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function region(html: string, start: number): { inFooter: boolean; inNav: boolean } {
  const before = html.slice(0, start).toLowerCase();
  const lastFooter = before.lastIndexOf("<footer");
  const lastMain = Math.max(before.lastIndexOf("<main"), before.lastIndexOf("<article"));
  const lastNav = before.lastIndexOf("<nav");
  return {
    inFooter: lastFooter > lastMain && lastFooter !== -1,
    inNav: lastNav > lastMain && lastNav !== -1,
  };
}

export function extractHeadings(html: string): Heading[] {
  const clean = strip(html);
  const out: Heading[] = [];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const pos = m.index;
    const r = region(clean, pos);
    out.push({
      level: Number(m[1]),
      text: textOf(m[2] ?? "").slice(0, 140),
      inFooter: r.inFooter,
      inNav: r.inNav,
    });
  }
  return out;
}

function pretty(lines: string[]): string {
  return lines.join("\n");
}

export function analyzeHtml(html: string, url: string): HtmlFinding[] {
  const findings: HtmlFinding[] = [];
  const clean = strip(html);
  const heads = extractHeadings(html);
  const brand: HtmlFinding["lane"] = url.includes("achieve.com") ? "achieve" : url.includes("freedomdebtrelief") ? "fdr" : "issue";
  const h1 = heads.filter((h) => h.level === 1 && !h.inFooter);
  const faqHeads = heads.filter((h) => /faq|frequently asked/i.test(h.text));
  const related = heads.filter((h) => /related (article|post|content|resource)|you may also/i.test(h.text));
  const footerH2 = heads.filter((h) => h.inFooter && h.level <= 2);
  const hasMain = /<main\b/i.test(clean);
  const hasFooter = /<footer\b/i.test(clean);

  if (h1.length !== 1) {
    findings.push({
      id: `H1:${url}`,
      code: "H1",
      title: h1.length === 0 ? "Page is missing a single H1" : "Multiple H1s compete with the title",
      lane: "issue",
      url,
      why: "The document title entity must own one H1. Extra H1s (FAQ, related, hero clones) split the entity the same way duplicate glossary slugs do.",
      found: pretty(h1.length ? h1.map((h) => `<h1>${h.text}</h1>`) : ["(no H1 in main)"]),
      suggested: pretty([
        "<main>",
        `  <h1>${h1[0]?.text || "Page topic"}</h1>`,
        "  …body…",
        "</main>",
      ]),
    });
  }

  for (let i = 1; i < heads.length; i++) {
    const prev = heads[i - 1]!;
    const cur = heads[i]!;
    if (cur.inFooter || prev.inFooter) continue;
    if (cur.level > prev.level + 1) {
      findings.push({
        id: `SKIP:${url}:${i}`,
        code: "SKIP",
        title: `Heading skips from H${prev.level} to H${cur.level}`,
        lane: "issue",
        url,
        why: "Outline jumps hide sections from assistive tech and from the content graph. Related blocks then look like peers of the product.",
        found: pretty([`<h${prev.level}>${prev.text}</h${prev.level}>`, `<h${cur.level}>${cur.text}</h${cur.level}>`]),
        suggested: pretty([
          `<h${prev.level}>${prev.text}</h${prev.level}>`,
          `<h${prev.level + 1}>${cur.text}</h${prev.level + 1}>`,
        ]),
      });
      break;
    }
  }

  const questionH2 = heads.filter((h) => !h.inFooter && h.level === 2 && /^(what|how|why|can|is |does )/i.test(h.text));
  if ((faqHeads.some((h) => h.level <= 2) || questionH2.length >= 2) && h1[0] && questionH2.length) {
      findings.push({
        id: `FAQ:${url}`,
        code: "FAQ",
        title: "FAQ questions sit at the same heading level as the page title siblings",
        lane: brand === "issue" ? "issue" : brand,
        url,
        why: "An FAQ H2 is not the page topic. If questions are H2 next to the product H2 (or clones of the H1), crawlers treat each question as a competing document section. Nest questions under one FAQ heading, or use details/summary.",
        found: pretty([
          `<h1>${h1[0].text}</h1>`,
          ...questionH2.slice(0, 3).map((h) => `<h2>${h.text}</h2>`),
        ]),
        suggested: pretty([
          `<h1>${h1[0].text}</h1>`,
          '<section aria-labelledby="faq">',
          '  <h2 id="faq">Frequently asked questions</h2>',
          ...questionH2.slice(0, 3).map((h) => `  <h3>${h.text}</h3>`),
          "</section>",
        ]),
      });
  }

  if (related.some((h) => h.level <= 2)) {
    findings.push({
      id: `REL:${url}`,
      code: "REL",
      title: "Related articles are the same heading level as primary sections",
      lane: brand === "issue" ? "issue" : brand,
      url,
      why: "Related articles are asides, not chapters of this page. An H2 'Related articles' beside an H2 product section makes both equal in the outline. Drop the list to H3 inside an aside, or keep a single H2 and list items as links.",
      found: pretty(related.map((h) => `<h${h.level}>${h.text}</h${h.level}>`)),
      suggested: pretty([
        "<aside aria-label=\"Related articles\">",
        "  <h3>Related articles</h3>",
        "  <ul><li><a href=\"…\">…</a></li></ul>",
        "</aside>",
      ]),
    });
  }

  if (footerH2.length && h1[0]) {
    findings.push({
      id: `FOOT:${url}`,
      code: "FOOT",
      title: "Footer headings conflict with main content",
      lane: brand === "issue" ? "issue" : brand,
      url,
      why: "Footer H1/H2 reuse the product name and enter the same outline as <main>. Screen readers and outline tools then see a second 'Debt relief' after the article. Footer labels should be navigation copy, not document headings.",
      found: pretty([
        `<main><h1>${h1[0].text}</h1></main>`,
        "<footer>",
        ...footerH2.slice(0, 3).map((h) => `  <h${h.level}>${h.text}</h${h.level}>`),
        "</footer>",
      ]),
      suggested: pretty([
        `<main><h1>${h1[0].text}</h1></main>`,
        "<footer>",
        "  <nav aria-label=\"Footer\">",
        ...footerH2.slice(0, 3).map((h) => `    <p class="footer-label">${h.text}</p>`),
        "  </nav>",
        "</footer>",
      ]),
    });
  }

  if (!hasMain) {
    findings.push({
      id: `MAIN:${url}`,
      code: "MAIN",
      title: "No <main> landmark",
      lane: "issue",
      url,
      why: "Without <main>, footer, nav, and promo blocks are indistinguishable from the article in the accessibility tree and in HTML-first crawlers.",
      found: "<body>\n  <div class=\"page\">…header, article, footer…</div>\n</body>",
      suggested: "<body>\n  <header>…</header>\n  <main>…article…</main>\n  <footer>…</footer>\n</body>",
    });
  }

  if (!hasFooter) {
    findings.push({
      id: `NOFOOT:${url}`,
      code: "NOFOOT",
      title: "Footer is not a <footer> element",
      lane: "issue",
      url,
      why: "A styled div at the bottom still participates in the heading outline. A real footer landmark keeps those links out of the article.",
      found: '<div class="footer">…links…</div>',
      suggested: '<footer>\n  <nav aria-label="Footer">…links…</nav>\n</footer>',
    });
  }

  const title = clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  if (h1[0] && title && jaccard(h1[0].text, title) < 0.25) {
    findings.push({
      id: `TITLE:${url}`,
      code: "TITLE",
      title: "H1 does not match the document title",
      lane: brand === "issue" ? "issue" : brand,
      url,
      why: "Title and H1 should name the same entity. A mismatch is how settlement pages steal the relief node.",
      found: pretty([`<title>${title}</title>`, `<h1>${h1[0].text}</h1>`]),
      suggested: pretty([`<title>${h1[0].text}</title>`, `<h1>${h1[0].text}</h1>`]),
    });
  }

  return findings;
}

function jaccard(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  let n = 0;
  ta.forEach((t) => {
    if (tb.has(t)) n += 1;
  });
  const u = ta.size + tb.size - n;
  return u === 0 ? 0 : n / u;
}

/** Seed outlines so Issues has rows before the first live fetch. */
export const SEED_HTML: Record<string, string> = {
  "https://www.freedomdebtrelief.com/debt-relief/": `<html><head><title>What is debt relief? An Overview | Freedom Debt Relief</title>
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": "https://www.freedomdebtrelief.com/#wrong", name: "Freedom Debt Relief" },
      { "@type": ["WebPage", "FAQPage", "Article"], "@id": "https://www.freedomdebtrelief.com/debt-relief/", name: "What is debt relief?" },
    ],
  })}</script>
</head>
<body>
<div class="page">
<h1>What is debt relief?</h1>
<h2>Debt settlement</h2>
<h2>What is debt settlement?</h2>
<h2>How does the program work?</h2>
<h2>Related articles</h2>
<footer>
<h2>Debt relief</h2>
<h2>Debt settlement</h2>
</footer>
</div>
</body></html>`,
  "https://www.achieve.com/heloc": `<html><head><title>Home Equity Line of Credit (HELOC) - Apply FREE today! | Achieve</title></head>
<body>
<header><h1>HELOC</h1></header>
<h2>What is a HELOC?</h2>
<h2>Home equity loan</h2>
<h4>Draw period</h4>
<h2>Related articles</h2>
<div class="site-footer"><h2>HELOC</h2></div>
</body></html>`,
};
