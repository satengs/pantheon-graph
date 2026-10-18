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
