export type RuleRow = {
  id?: string;
  code: string;
  title: string;
  domain: string;
  product: string;
  statement: string;
};

export type RuleConflict = {
  a: string;
  b: string;
  kind: "duplicate-code" | "owner-clash" | "silo-vs-merge" | "wrong-shelf";
  why: string;
};

const FDR_OWN = ["debt-relief", "debt relief", "settlement"];
const ACH_OWN = ["heloc", "hel", "home equity loan", "home-equity-loan", "personal-loan", "personal loan", "apr"];

const PAIRS: Array<[string, string]> = [
  ["heloc", "home equity loan"],
  ["heloc", "hel"],
  ["home equity loan", "hel"],
  ["debt relief", "settlement"],
];

const MERGE = /\b(alias|aliases|same product|same ask|interchangeable|treat as one|merge|one entity|one url)\b/i;
const SILO = /\b(silo|separate|separated|distinct|not aliases|different product|keep apart|two urls|must stay)\b/i;

function blob(r: RuleRow): string {
  return `${r.code} ${r.title} ${r.product} ${r.statement}`.toLowerCase();
}

function mentions(text: string, term: string): boolean {
  const t = term.toLowerCase();
  return text.includes(t) || text.includes(t.replace(/\s+/g, "-"));
}

function ownsFdr(text: string): boolean {
  return FDR_OWN.some((t) => mentions(text, t));
}

function ownsAch(text: string): boolean {
  return ACH_OWN.some((t) => mentions(text, t));
}

function pairHits(text: string, pair: [string, string]): boolean {
  return mentions(text, pair[0]) && mentions(text, pair[1]);
}

export function detectRuleConflicts(rules: RuleRow[]): RuleConflict[] {
  const out: RuleConflict[] = [];
  for (let i = 0; i < rules.length; i++) {
    const a = rules[i]!;
    const aText = blob(a);

    if (a.domain === "fdr" && ownsAch(a.product) && !ownsFdr(a.product)) {
      out.push({
        a: a.code,
        b: "brand-owner:achieve",
        kind: "wrong-shelf",
        why: `${a.code} is scoped to FDR but pins a product Achieve owns (${a.product}).`,
      });
    }
    if (a.domain === "achieve" && ownsFdr(a.product) && !ownsAch(a.product)) {
      out.push({
        a: a.code,
        b: "brand-owner:fdr",
        kind: "wrong-shelf",
        why: `${a.code} is scoped to Achieve but pins a product FDR owns (${a.product}).`,
      });
    }

    for (let j = i + 1; j < rules.length; j++) {
      const b = rules[j]!;
      const bText = blob(b);

      if (a.code.toLowerCase() === b.code.toLowerCase() && a.statement.trim() !== b.statement.trim()) {
        out.push({
          a: a.code,
          b: b.code,
          kind: "duplicate-code",
          why: `Two rules share code ${a.code} with different statements.`,
        });
      }

      const aFdr = a.domain === "fdr" || /\bfdr owns\b|\bfreedom debt relief owns\b/i.test(aText);
      const bAch = b.domain === "achieve" || /\bachieve owns\b/i.test(bText);
      const aAch = a.domain === "achieve" || /\bachieve owns\b/i.test(aText);
      const bFdr = b.domain === "fdr" || /\bfdr owns\b/i.test(bText);
      const sharedProduct =
        a.product !== "all" &&
        b.product !== "all" &&
        a.product.toLowerCase() === b.product.toLowerCase();
      if (sharedProduct && ((aFdr && bAch) || (aAch && bFdr))) {
        out.push({
          a: a.code,
          b: b.code,
          kind: "owner-clash",
          why: `${a.code} and ${b.code} both claim product ${a.product} for different brands.`,
        });
      }

      for (const pair of PAIRS) {
        if (!pairHits(aText, pair) || !pairHits(bText, pair)) continue;
        const aMerge = MERGE.test(aText) && !SILO.test(aText);
        const bSilo = SILO.test(bText) && !MERGE.test(bText);
        const aSilo = SILO.test(aText) && !MERGE.test(aText);
        const bMerge = MERGE.test(bText) && !SILO.test(bText);
        if ((aMerge && bSilo) || (aSilo && bMerge)) {
          out.push({
            a: a.code,
            b: b.code,
            kind: "silo-vs-merge",
            why: `${a.code} and ${b.code} disagree on ${pair[0]} vs ${pair[1]} (merge vs silo).`,
          });
        }
      }
    }
  }
  return out;
}
