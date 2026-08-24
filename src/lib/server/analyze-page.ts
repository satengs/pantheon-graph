import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { analyzeHtml, type HtmlFinding } from "@/lib/html/semantic";

const FETCH_HEADERS = { "user-agent": "OriginStudio/1.0 (+content-graph)" };

async function insertFindings(userId: string, findings: HtmlFinding[]) {
  const sql = await getSql();
  for (const f of findings) {
    const id = `${userId}:${f.code}:${encodeURIComponent(f.url)}`;
    f.id = id;
    await sql`
      insert into studio_findings (id, user_id, code, title, lane, url, why, found, suggested)
      values (${id}, ${userId}, ${f.code}, ${f.title}, ${f.lane}, ${f.url}, ${f.why}, ${f.found}, ${f.suggested})
      on conflict (id) do update set
        title = excluded.title,
        why = excluded.why,
        found = excluded.found,
        suggested = excluded.suggested,
        lane = excluded.lane
    `;
  }
}

export async function persistFindings(userId: string, findings: HtmlFinding[]) {
  await insertFindings(userId, findings);
}

export const analyzePage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ url: z.string().url(), endpoint: z.string().optional() }))
  .handler(async ({ context, data }) => {
    const res = await fetch(data.url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`Fetch ${data.url} ${res.status}`);
    const html = (await res.text()).slice(0, 400_000);
    let findings = analyzeHtml(html, data.url);

    const endpoint = data.endpoint?.trim();
    if (endpoint && /^https:\/\//i.test(endpoint)) {
      try {
        const extra = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", ...FETCH_HEADERS },
          body: JSON.stringify({ url: data.url, findings }),
          signal: AbortSignal.timeout(12_000),
        });
        if (extra.ok) {
          const body = (await extra.json()) as { findings?: HtmlFinding[] };
          if (Array.isArray(body.findings)) findings = findings.concat(body.findings);
        }
      } catch {
        /* local logic still stands if the workflow is down */
      }
    }

    await insertFindings(context.userId, findings);
    return { url: data.url, count: findings.length, findings };
  });
