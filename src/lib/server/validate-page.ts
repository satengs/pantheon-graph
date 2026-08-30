import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { analyzeHtml } from "@/lib/html/semantic";
import { analyzeJsonLd } from "@/lib/html/jsonld";
import { analyzeArticleSignals } from "@/lib/html/article-signals";
import { analyzeAeo } from "@/lib/html/aeo";
import { extractPageFacts } from "@/lib/html/page-facts";
import { grokJudge, needsGrok } from "@/lib/server/grok-judge";
import { persistFindings } from "@/lib/server/analyze-page";
import { RULES, RULE_SCOPE, RULE_TITLE } from "@/data/rules-seed";
import type { HtmlFinding } from "@/lib/html/semantic";

const FETCH_HEADERS = { "user-agent": "OriginStudio/1.0 (+content-graph)" };

export type RuleVerdict = {
  code: string;
  title: string;
  status: "pass" | "fail";
  why: string;
  quote: string;
  engine: "html" | "jsonld" | "article" | "grok-4" | "local";
};

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Fetch ${url} ${res.status}`);
  return (await res.text()).slice(0, 400_000);
}

export const validatePage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      url: z.string().url(),
      codes: z.array(z.string().min(1)).max(40),
      custom: z.object({ title: z.string().max(80), statement: z.string().min(8).max(600) }).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const html = await fetchHtml(data.url);
    const facts = extractPageFacts(html, data.url);
    const engines: HtmlFinding[] = [
      ...analyzeHtml(html, data.url),
      ...analyzeJsonLd(html, data.url),
      ...analyzeArticleSignals(html, data.url),
      ...analyzeAeo(html, data.url, []),
    ];
    const byCode = new Map<string, HtmlFinding[]>();
    for (const f of engines) {
      const list = byCode.get(f.code) ?? [];
      list.push(f);
      byCode.set(f.code, list);
    }

    const results: RuleVerdict[] = [];
    let grokCalls = 0;
    let agent: "none" | "grok-4" | "local" = "none";

    for (const code of data.codes) {
      const rule = RULES.find((r) => r.code === code);
      const title = RULE_TITLE[code] ?? rule?.title ?? code;
      const statement = RULE_SCOPE[code] ?? rule?.reason ?? "";
      const hits = byCode.get(code) ?? [];
      if (hits.length) {
        const f = hits[0]!;
        results.push({
          code,
          title,
          status: "fail",
          why: f.why,
          quote: f.found?.slice(0, 240) || "",
          engine: f.code.startsWith("S2") && Number(f.code.slice(1)) >= 27 ? "article" : "html",
        });
        continue;
      }
      if (needsGrok(code)) {
        const judged = await grokJudge(facts, { code, statement });
        grokCalls += 1;
        agent = judged.agent;
        results.push({
          code,
          title,
          status: judged.pass ? "pass" : "fail",
          why: judged.why,
          quote: judged.quote,
          engine: judged.agent,
        });
        continue;
      }
      results.push({
        code,
        title,
        status: "pass",
        why: "Deterministic engines found no violation on this URL.",
        quote: facts.h1 || facts.title,
        engine: "html",
      });
    }

    if (data.custom) {
      const judged = await grokJudge(facts, { code: "CUSTOM", statement: data.custom.statement });
      grokCalls += 1;
      agent = judged.agent;
      results.push({
        code: "CUSTOM",
        title: data.custom.title.trim() || "Custom rule",
        status: judged.pass ? "pass" : "fail",
        why: judged.why,
        quote: judged.quote,
        engine: judged.agent,
      });
    }

    const fails: HtmlFinding[] = results
      .filter((r) => r.status === "fail")
      .map((r) => ({
        id: "",
        code: r.code,
        title: r.title,
        lane: "issue",
        url: data.url,
        why: r.why,
        found: r.quote,
        suggested: r.engine === "grok-4" ? "Grok judged this rule fail" : "",
      }));
    await persistFindings(context.userId, fails);

    return {
      url: data.url,
      facts: { title: facts.title, h1: facts.h1, types: facts.jsonLdTypes },
      agent,
      grokCalls,
      fail: results.filter((r) => r.status === "fail").length,
      pass: results.filter((r) => r.status === "pass").length,
      results,
    };
  });
