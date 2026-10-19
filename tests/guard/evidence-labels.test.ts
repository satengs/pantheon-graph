// guard: evidence labels — every Evidence tag string (canvas + legend + tooltip) comes from
// evidenceLabel(); nothing can print "undefined" / "unknown", even from a legacy evidence.json.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import doc from "../../public/data/evidence.json";
import { buildEvidenceIndex, evTagText, normalizeEvidenceDoc } from "@/lib/graph/evidence";
import { evidenceLabel } from "@/lib/graph/evidence-label";

const BAD = /\b(undefined|unknown|null|NaN)\b/i;
const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("guard: evidence labels", () => {
  test("canvas tags and legend call evidenceLabel(); no hand-built 'Evidence N' strings", () => {
    const canvas = src("src/components/studio/GraphCanvas.tsx");
    expect(canvas).toMatch(/import \{ evidenceLabel \} from "@\/lib\/graph\/evidence-label"/);
    // canvas tag
    expect(canvas).toMatch(/const evLbl = evShow \? evidenceLabel\(/);
    // legend examples
    expect(canvas).toMatch(/legendFull: evidenceLabel\(/);
    expect(canvas).toMatch(/legendCompact: evidenceLabel\(/);
    for (const f of ["src/components/studio/GraphCanvas.tsx", "src/components/studio/EvidenceCard.tsx", "src/components/studio/Inspector.tsx", "src/lib/graph/evidence.ts"]) {
      expect(src(f), f).not.toMatch(/`Evidence \$\{/);
    }
  });

  for (const [name, raw] of [
    ["current evidence.json", doc],
    ["legacy evidence.json ('unknown' / missing severity)", {
      ...doc,
      items: (doc as { items: Array<Record<string, unknown>> }).items.map((i, n) =>
        n % 3 === 0 ? { ...i, severity: undefined } : i.severity === "unrated" ? { ...i, severity: "unknown" } : i,
      ),
    }],
  ] as const) {
    test(`every roll-up label is clean: ${name}`, () => {
      const d = normalizeEvidenceDoc(raw);
      expect(d).not.toBeNull();
      const idx = buildEvidenceIndex(d);
      const rolls = [idx.forAll(), ...["fdr", "achieve", "bills"].map((b) => idx.forBrand(b))];
      for (const it of d!.items) rolls.push(idx.forPage(it.urls[0]));
      let seen = 0;
      for (const r of rolls) {
        if (!r) continue;
        seen++;
        const l = evidenceLabel(r.items)!;
        for (const s of [l.full, ...l.compact, evTagText(r), evTagText(r, true)]) expect(s).not.toMatch(BAD);
        expect(l.full).toMatch(/^Evidence \d+ · (\d+ (critical|high|medium|low)|unrated)$/);
      }
      expect(seen).toBeGreaterThan(3);
      for (const it of d!.items) expect(["critical", "high", "medium", "low", "unrated"]).toContain(it.severity);
    });
  }

  test("evidence.json on disk uses 'unrated', never the legacy 'unknown' key", () => {
    const sev = (doc as { summary: { severity: Record<string, number> } }).summary.severity;
    expect(Object.keys(sev)).not.toContain("unknown");
    for (const i of (doc as { items: Array<{ severity: string }> }).items) expect(i.severity).not.toBe("unknown");
  });
});
