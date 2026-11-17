import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-"));
const seo = path.join(root, "seo-vs-mkt");
const spine = (rows, extra = "") =>
  `# brief\n\n| # | Status | Tag |${extra ? ` ${extra} |` : ""} Point |\n|---|---|---|${extra ? "---|" : ""}---|\n${rows.join("\n")}\n`;
fs.mkdirSync(path.join(seo, "evidence-brief-2026-10-15"), { recursive: true });
fs.mkdirSync(path.join(seo, "evidence-brief-2026-10-16"), { recursive: true });
fs.mkdirSync(path.join(seo, "weekly-evidence-brief-2026-10-16"), { recursive: true });
fs.mkdirSync(path.join(seo, "evidence-brief-weekly-2026-W43"), { recursive: true });
fs.writeFileSync(path.join(seo, "evidence-brief-2026-10-15/daily-brief.md"), spine(["| 1 | NEW | Public | **P0-1** www `/apply` 301 |"]));
fs.writeFileSync(path.join(seo, "evidence-brief-2026-10-16/daily-brief.md"), spine(["| 1 | STILL OPEN | Public | hold |"]));
fs.writeFileSync(path.join(seo, "weekly-evidence-brief-2026-10-16/brief.md"), spine(["| 2 | NEW | Loans | High | **Achieve `/heloc` rate drift** → Loans |"], "Severity"));
fs.writeFileSync(path.join(seo, "evidence-brief-weekly-2026-W43/weekly-brief.md"), spine(["| 3 | NEW | Public | **x** |"]));
fs.writeFileSync(path.join(seo, "evidence-brief-weekly-2026-W43/room_messages.md"), "no spine");
process.env.EVIDENCE_ROOT = root;
const m = await import("./import-evidence.mjs");

test("weekly brief folders are discovered and the newest wins", () => {
  const b = m.discoverBriefs();
  assert.deepEqual(
    b.map((x) => `${x.kind}:${x.date}`),
    ["daily:2026-10-15", "daily:2026-10-16", "weekly:2026-10-16", "weekly:2026-10-23"],
  );
});

test("named columns parse an extra Severity column", () => {
  const rows = m.parseSpine(fs.readFileSync(path.join(seo, "weekly-evidence-brief-2026-10-16/brief.md"), "utf8"));
  assert.equal(rows[0].sev, "High");
  assert.match(rows[0].point, /heloc/);
});

test("severity: P0 label → critical, passing mention ≠ P0, column wins, else unrated", () => {
  assert.equal(m.severityFrom(["**P0-2** cold Unauthorized"]).severity, "critical");
  assert.equal(m.severityFrom(["**Hub** 2 CTAs (P0-4 reaches reviews)"]).severity, "unrated");
  assert.equal(m.severityFrom(["x"], ["NEW · near-P0"]).severity, "unrated");
  assert.equal(m.severityFrom(["x"], ["UPDATE · **P0**"]).severity, "critical");
  assert.equal(m.severityFrom(["x"], [], "Medium").severity, "medium");
});

test("status + point split", () => {
  assert.equal(m.statusFrom("NEW · PARTIAL (updates 57)"), "partly fixed");
  assert.equal(m.statusFrom("CLOSED channel"), "open");
  assert.equal(m.statusFrom("FIXED"), "fixed");
  const p = m.splitPoint("**P0-1** www `/apply` **301** still bakes UTMs — Funnel check");
  assert.equal(p.title, "www /apply 301 still bakes UTMs");
  const q = m.splitPoint("**Headline is long enough.** evidence here and more evidence. → Apply: fix it");
  assert.equal(q.title, "Headline is long enough");
  assert.equal(q.fix, "Apply: fix it");
});

test("URL host inference keeps Apply slugs on apply.* and drops competitors", () => {
  const u = m.urlsFrom("Meta → `/fbcfos`; NDR `/debt-relief/` ; FDR `/scam/` ; Achieve `/heloc`", "fdr");
  assert.deepEqual(u, [
    "https://apply.freedomdebtrelief.com/fbcfos",
    "https://www.achieve.com/heloc",
    "https://www.freedomdebtrelief.com/scam/",
  ]);
});

test("manual Scout rows dedupe by id or URL+title and confirmations do not invent severity", () => {
  const items = [
    { id: "E83", title: "Impersonation scams use FDR's name; owned page silent", urls: ["https://www.freedomdebtrelief.com/scam/"], sources: ["evidence-brief"], confirmations: [], verification: "reported" },
  ];
  assert.ok(m.isDupe(items, { id: "E83", title: "other", urls: [] }));
  assert.ok(m.isDupe(items, { id: "MS-X", title: "Impersonation scams use FDR's name; owned page silent", urls: ["https://www.freedomdebtrelief.com/scam/"] }));
  assert.equal(m.isDupe(items, { id: "MS05", title: "FDR /scam/ needs an advance-fee and impersonation block (DFPI hook)", urls: ["https://www.freedomdebtrelief.com/scam/"] }), null);
});

test("worseSev keeps the higher Funnel impact", () => {
  assert.equal(m.worseSev("high", "critical"), "critical");
  assert.equal(m.worseSev("medium", "high"), "high");
  assert.equal(m.worseSev(null, "low"), "low");
});

test("applyReplacements strips personal names and box paths", () => {
  const reps = [
    { find: "Satenik decision", replace: "owner decision" },
    { find: "Alea Hunt", replace: "a co-brand publisher" },
  ];
  assert.equal(m.applyReplacements("Lane stays unmeasurable (Satenik decision).", reps), "Lane stays unmeasurable (owner decision).");
  assert.equal(m.applyReplacements("quoted (Alea Hunt)", reps), "quoted (a co-brand publisher)");
  assert.match(m.applyReplacements("see /workspace/seo-vs-mkt/pack.md"), /^\s*see \(evidence pack\)/);
});

test("own-brand URLs not in the crawl roll up to the brand; apply hosts stay unmapped with a reason", () => {
  const crawl = new Map([["freedomdebtrelief.com/scam", "other"]]);
  const vanity = { id: "E2", brand: "fdr", urls: ["https://www.freedomdebtrelief.com/apply"] };
  m.matchEvidenceItem(vanity, crawl);
  assert.equal(vanity.match.kind, "site-wide");
  assert.deepEqual(vanity.match.nodes, ["brand:fdr"]);
  assert.match(vanity.match.reason, /rolled up to the brand/);

  const apply = { id: "E98", brand: "fdr", urls: ["https://apply.freedomdebtrelief.com/fb"] };
  m.matchEvidenceItem(apply, crawl);
  assert.equal(apply.match.kind, "unmapped");
  assert.equal(apply.match.reason, "off-site ad host (apply.freedomdebtrelief.com)");
  assert.ok(apply.match.reason, "unmapped rows must have a visible reason");

  const crawlHit = { id: "E83", brand: "fdr", urls: ["https://www.freedomdebtrelief.com/scam/"] };
  m.matchEvidenceItem(crawlHit, crawl);
  assert.equal(crawlHit.match.kind, "page");
  assert.equal(crawlHit.match.drawn, false);
});

test("applyOverrides can force a brand and a pre-set match", () => {
  const items = [
    {
      id: "E133",
      brand: "achieve",
      urls: ["https://www.achieve.com/"],
      why: "start.FFN /home is noindex.",
      match: undefined,
    },
  ];
  const applied = m.applyOverrides(items, {
    items: {
      E133: {
        brand: "fdr",
        urls: ["https://start.freedomfinancialnetwork.com/home"],
        match: { kind: "site-wide", nodes: ["brand:fdr"] },
        whySuffix: "They only run on Achieve's advertiser account.",
      },
    },
  });
  assert.deepEqual(applied, ["E133"]);
  assert.equal(items[0].brand, "fdr");
  assert.deepEqual(items[0].match.nodes, ["brand:fdr"]);
  assert.match(items[0].why, /advertiser account/);
});
