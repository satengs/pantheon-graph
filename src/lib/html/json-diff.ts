export type DiffLine = { op: "same" | "del" | "add"; text: string };

function prettyMaybe(text: string): string {
  const t = text.trim();
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return text;
  }
}

/** Line diff for found vs suggested JSON-LD (or HTML). */
export function jsonLdDiff(found: string, suggested: string): DiffLine[] {
  const a = prettyMaybe(found).split("\n");
  const b = prettyMaybe(suggested).split("\n");
  const out: DiffLine[] = [];
  const bSet = new Set(b.map((l) => l.trim()));
  const aSet = new Set(a.map((l) => l.trim()));
  for (const line of a) {
    out.push({ op: bSet.has(line.trim()) ? "same" : "del", text: line });
  }
  for (const line of b) {
    if (!aSet.has(line.trim())) out.push({ op: "add", text: line });
  }
  return out;
}
