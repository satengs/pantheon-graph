import type { PageFacts } from "@/lib/html/page-facts";

export type JudgeResult = {
  pass: boolean;
  why: string;
  quote: string;
  agent: "grok-4" | "local";
};

const COPY_CODES = new Set(["S02", "S03", "S06", "S09", "S10", "S12", "S22", "S23", "S24", "S25", "S32", "CUSTOM"]);

export function needsGrok(code: string): boolean {
  return COPY_CODES.has(code) || code.startsWith("C");
}

function localHeuristic(facts: PageFacts, code: string, statement: string): JudgeResult {
  if (code === "S12" || /nmls/i.test(statement)) {
    const loan = /heloc|home-equity|personal-loan|loan/i.test(facts.url);
    const fail = facts.hasNmls && !loan;
    return {
      pass: !fail,
      why: fail
        ? `NMLS ${facts.nmlsIds.join(", ") || "ID"} appears on a non-loan URL.`
        : facts.hasNmls
          ? "NMLS is on a loan URL."
          : "No NMLS on this page.",
      quote: facts.nmlsIds[0] ? `NMLS ${facts.nmlsIds[0]}` : "",
      agent: "local",
    };
  }
  if (code === "S28" || /title.*h1/i.test(statement)) {
    const a = facts.title.replace(/\s*\|\s*.*$/, "").trim().toLowerCase();
    const b = facts.h1.trim().toLowerCase();
    const pass = Boolean(a && b && (a.includes(b) || b.includes(a) || a === facts.ogTitle.toLowerCase().replace(/\s*\|\s*.*$/, "")));
    return { pass, why: pass ? "Title, H1, and og:title agree." : "Title / H1 / og:title diverge.", quote: facts.h1 || facts.title, agent: "local" };
  }
  return {
    pass: false,
    why: "Copy/entity rules need Grok in production. Set XAI_API_KEY to judge this page against the rule statement.",
    quote: facts.h1 || facts.title,
    agent: "local",
  };
}

export async function grokJudge(facts: PageFacts, rule: { code: string; statement: string }): Promise<JudgeResult> {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) return localHeuristic(facts, rule.code, rule.statement);

  const model = process.env.XAI_MODEL?.trim() || "grok-4";
  const body = {
    model,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "You are Origin page agent. Judge one page against one content-graph rule. Reply JSON only: {\"pass\":boolean,\"why\":string,\"quote\":string}. Quote a short live phrase from the page. pass=true only if the page satisfies the rule.",
      },
      {
        role: "user",
        content: JSON.stringify({
          rule: rule.code,
          statement: rule.statement,
          page: {
            url: facts.url,
            title: facts.title,
            h1: facts.h1,
            canonical: facts.canonical,
            ogTitle: facts.ogTitle,
            jsonLdTypes: facts.jsonLdTypes,
            nmls: facts.nmlsIds,
            text: facts.text.slice(0, 4000),
          },
        }),
      },
    ],
  };

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return localHeuristic(facts, rule.code, rule.statement);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const m = /\{[\s\S]*\}/.exec(raw);
    const parsed = JSON.parse(m?.[0] ?? raw) as { pass?: boolean; why?: string; quote?: string };
    return {
      pass: Boolean(parsed.pass),
      why: String(parsed.why || "").slice(0, 400),
      quote: String(parsed.quote || "").slice(0, 240),
      agent: "grok-4",
    };
  } catch {
    return localHeuristic(facts, rule.code, rule.statement);
  }
}
