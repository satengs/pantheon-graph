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

test("own-brand URLs not in the crawl roll up to the brand; FDR Apply hosts roll up to the Apply hub", () => {
  const crawl = new Map([["freedomdebtrelief.com/scam", "other"]]);
  const vanity = { id: "E2", brand: "fdr", urls: ["https://www.freedomdebtrelief.com/apply"] };
  m.matchEvidenceItem(vanity, crawl);
  assert.equal(vanity.match.kind, "site-wide");
  assert.deepEqual(vanity.match.nodes, ["brand:fdr"]);
  assert.match(vanity.match.reason, /rolled up to the brand/);

  const apply = { id: "E98", brand: "fdr", urls: ["https://apply.freedomdebtrelief.com/fb"] };
  m.matchEvidenceItem(apply, crawl);
  assert.equal(apply.match.kind, "site-wide");
  assert.deepEqual(apply.match.nodes, ["hub:fdr:apply"]);
  assert.equal(apply.brand, "fdr");
  assert.equal(apply.owner, "Apply");
  assert.match(apply.match.reason, /Apply hub/);

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

test("applyBriefMerges folds a repeat into the existing row and drops the brief id", () => {
  const items = [
    { id: "MS02", title: "pending sweep", why: "old", urls: ["https://www.achieve.com/learn/a"], refs: ["Evidence Brief 2026-11-16"], sources: ["scout"], verification: "to_verify", severity: "unrated", firstSeen: "2026-11-16", lastSeen: "2026-11-16", status: "open" },
    { id: "E158", title: "693 of 710", why: "new sweep", urls: ["https://www.achieve.com/learn/b"], refs: ["Evidence Brief 2026-11-20"], sources: ["evidence-brief"], verification: "reported", severity: "critical", firstSeen: "2026-11-20", lastSeen: "2026-11-20", status: "open" },
    { id: "E155", title: "peer context", urls: [], refs: ["Evidence Brief 2026-11-20"], sources: ["evidence-brief"], verification: "reported", firstSeen: "2026-11-20", lastSeen: "2026-11-20" },
  ];
  const pack = {
    asOf: "2026-11-20",
    skipRows: ["155"],
    merges: [
      { fromRow: "158", into: ["MS02"], also: [], title: "dev.Achieve.com on 693 of 710 /learn articles (one template)", why: "confirmed sweep" },
    ],
  };
  const out = m.applyBriefMerges(items, [pack]);
  assert.deepEqual(out.removed.sort(), ["E155", "E158"]);
  assert.equal(items.map((i) => i.id).join(), "MS02");
  assert.equal(items[0].title, "dev.Achieve.com on 693 of 710 /learn articles (one template)");
  assert.equal(items[0].lastSeen, "2026-11-20");
  assert.ok(items[0].refs.includes("Evidence Brief 2026-11-16"));
  assert.ok(items[0].refs.includes("Evidence Brief 2026-11-20"));
  assert.ok(items[0].sources.includes("scout") && items[0].sources.includes("evidence-brief"));
});

test("later Funnel confirmations upgrade existing rows and never invent a WR-FF id", () => {
  const items = [
    { id: "MS02", confirmations: [], verification: "to_verify", severity: "unrated", severityBasis: "pending" },
    { id: "MS04", confirmations: [], verification: "to_verify", severity: "unrated" },
    { id: "E133", confirmations: [], verification: "reported", severity: "critical", severityBasis: "Evidence Brief 2026-11-20 P0" },
    { id: "E146", confirmations: [], verification: "reported", severity: "unrated" },
  ];
  const maps = [
    {
      asOf: "2026-11-12",
      confirmed: [{ funnel: "WR-FF-03", evidenceIds: ["E133"], impact: "high" }],
      unverified: [{ evidenceIds: ["E146"], verificationNote: "needs dashboard access" }],
    },
    {
      asOf: "2026-11-19",
      confirmed: [
        { funnel: "learn-template-sweep", evidenceIds: ["MS02"], impact: "critical" },
        { funnel: "statistics-gap-sweep", evidenceIds: ["MS04"], impact: "medium" },
      ],
    },
  ];
  const stamped = m.applyConfirmations(items, maps);
  m.applyPendingBriefSeverities(items);
  // Funnel Fix's confirmed High stands. An override records the brief P0 as a note.
  m.applyOverrides(items, {
    items: {
      E133: {
        severity: "high",
        severityBasis: "Evidence Brief Nov 20 rated P0; Funnel Fix confirmed High",
      },
    },
  });
  assert.equal(items.find((i) => i.id === "MS02").verification, "confirmed");
  assert.equal(items.find((i) => i.id === "MS02").severity, "critical");
  assert.equal(items.find((i) => i.id === "MS04").severity, "medium");
  assert.equal(items.find((i) => i.id === "E133").severity, "high", "Funnel Fix High is not upgraded by the brief P0");
  assert.match(items.find((i) => i.id === "E133").severityBasis, /Evidence Brief Nov 20 rated P0; Funnel Fix confirmed High/);
  assert.equal(items.find((i) => i.id === "E146").verification, "unverified");
  assert.equal(items.every((i) => !i.id.startsWith("WR-FF")), true);
  assert.ok(stamped.confirmed.includes("MS02"));
});

test("markNewRowsToVerify only flips unconfirmed firstSeen=asOf rows; unverified stay put", () => {
  const items = [
    { id: "E163", firstSeen: "2026-11-20", verification: "reported", severity: "critical", severityBasis: "P0 in brief" },
    { id: "E141", firstSeen: "2026-11-13", lastSeen: "2026-11-20", verification: "reported", severity: "unrated" },
    { id: "E146", firstSeen: "2026-11-13", verification: "unverified", severity: "unrated" },
    { id: "MS02", firstSeen: "2026-11-16", verification: "confirmed", severity: "critical" },
  ];
  const marked = m.markNewRowsToVerify(items, "2026-11-20");
  assert.deepEqual(marked, ["E163"]);
  assert.equal(items[0].verification, "to_verify");
  assert.equal(items[0].severity, "unrated");
  assert.equal(items[1].verification, "reported");
  assert.equal(items[2].verification, "unverified");
  assert.equal(items[3].verification, "confirmed");
});


test("overrides can set title, why and fix after import stamps", () => {
  const items = [
    { id: "E70", title: "Same P0, new dest + new claim", why: "old", fix: "Apply + Compliance" },
    { id: "E163", title: "mobile-app", why: "", fix: "", verification: "to_verify", severity: "unrated" },
    { id: "E170", title: "CNBC", why: "Funnel to curl next week.", fix: "", verification: "to_verify", severity: "unrated" },
  ];
  const applied = m.applyOverrides(items, {
    items: {
      E70: { title: "apply.freedomdebtrelief.com/fbcfos is still a test page; the Meta “$280 per month” claim is missing from the FDR homepage" },
      E163: { why: "The /mobile-app-download/ page is indexable but has no App Store or Google Play link in the HTML, and no inlinks from home or /how-it-works/.", fix: "Add App Store and Google Play links, and add inlinks from home or /how-it-works/." },
      E170: { fix: "Owner to decide after verification" },
    },
  });
  assert.deepEqual(applied.sort(), ["E163", "E170", "E70"]);
  assert.match(items[0].title, /fbcfos/);
  assert.equal(items[0].id, "E70");
  assert.match(items[1].why, /no App Store or Google Play link/);
  assert.match(items[1].fix, /Add App Store and Google Play links/);
  assert.equal(items[2].fix, "Owner to decide after verification");
  assert.equal(items[2].why, "Funnel to curl next week.");
});
