import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql, dbSource } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { RULES, ruleStatement, ruleCheckJson, DEFAULT_BRAND_CONFIG } from "@/data/rules-seed";
import { crawl } from "@/data/crawl";
import { statesData } from "@/data/states";
import { analyzeHtml, SEED_HTML } from "@/lib/html/semantic";
import { analyzeJsonLd } from "@/lib/html/jsonld";
import { detectRuleConflicts, type RuleRow } from "@/lib/studio/rule-conflicts";

const ruleInput = z.object({
  id: z.string().min(1).optional(),
  code: z.string().min(1),
  title: z.string().min(1),
  layer: z.enum(["L1", "L2"]),
  domain: z.enum(["fdr", "achieve", "both", "system"]),
  product: z.string().min(1),
  statement: z.string().min(1),
  checkJson: z.string().optional(),
});

async function appendHistory(
  userId: string,
  kind: string,
  label: string,
  json: string,
  rows: number,
) {
  const sql = await getSql();
  const id = `${userId}:${kind}:${crypto.randomUUID()}`;
  await sql`
    insert into studio_history (id, user_id, kind, label, bytes, rows, json)
    values (${id}, ${userId}, ${kind}, ${label}, ${json.length}, ${rows}, ${json})
  `;
  return id;
}

async function upsertCatalogHead(
  userId: string,
  kind: string,
  json: string,
  rows: number,
) {
  const sql = await getSql();
  const id = `${userId}:${kind}`;
  await sql`
    insert into studio_catalog (id, user_id, kind, bytes, rows, json, updated_at)
    values (${id}, ${userId}, ${kind}, ${json.length}, ${rows}, ${json}, now())
    on conflict (id) do update set
      bytes = excluded.bytes,
      rows = excluded.rows,
      json = excluded.json,
      updated_at = now()
  `;
}

async function seedCatalog(userId: string) {
  const sql = await getSql();
  const blobs = [
    { kind: "crawl", json: JSON.stringify(crawl), rows: crawl.pages.length, label: `Seed crawl ${crawl.crawledAt}` },
    { kind: "states", json: JSON.stringify(statesData), rows: statesData.states.length, label: "Seed state coverage" },
  ];
  for (const b of blobs) {
    const have = await sql<{ n: number }>`
      select count(*)::int as n from studio_history where user_id = ${userId} and kind = ${b.kind}
    `;
    if ((have[0]?.n ?? 0) > 0) continue;
    await upsertCatalogHead(userId, b.kind, b.json, b.rows);
    await appendHistory(userId, b.kind, b.label, b.json, b.rows);
  }
}

async function seedIfEmpty(userId: string) {
  const sql = await getSql();
  await seedCatalog(userId);
  const foundN = await sql<{ n: number }>`select count(*)::int as n from studio_findings where user_id = ${userId}`;
  if ((foundN[0]?.n ?? 0) === 0) {
    for (const [url, html] of Object.entries(SEED_HTML)) {
      for (const f of [...analyzeHtml(html, url), ...analyzeJsonLd(html, url)]) {
        const id = `${userId}:${f.code}:${encodeURIComponent(f.url)}`;
        await sql`
          insert into studio_findings (id, user_id, code, title, lane, url, why, found, suggested)
          values (${id}, ${userId}, ${f.code}, ${f.title}, ${f.lane}, ${f.url}, ${f.why}, ${f.found}, ${f.suggested})
          on conflict (id) do nothing
        `;
      }
    }
  }
  const existing = await sql<{ code: string }>`select code from studio_rules where user_id = ${userId}`;
  const have = new Set(existing.map((r) => r.code));
  for (const r of RULES) {
    if (have.has(r.code)) continue;
    const id = `${userId}:${r.id}`;
    await sql`
      insert into studio_rules (id, user_id, code, title, layer, domain, product, statement, check_json)
      values (${id}, ${userId}, ${r.code}, ${r.title}, ${r.layer}, ${r.domain}, ${r.product}, ${ruleStatement(r)}, ${ruleCheckJson(r.code)})
      on conflict (id) do nothing
    `;
    await sql`
      insert into studio_tasks (id, user_id, rule_id, title, notes, status)
      values (${`${userId}:task:${r.id}`}, ${userId}, ${id}, ${r.title}, ${r.fix}, ${"open"})
      on conflict (id) do nothing
    `;
  }
  for (const brand of ["fdr", "achieve"] as const) {
    const json = JSON.stringify(DEFAULT_BRAND_CONFIG[brand], null, 2);
    await sql`
      insert into studio_configs (id, user_id, brand, json)
      values (${`${userId}:${brand}`}, ${userId}, ${brand}, ${json})
      on conflict (id) do nothing
    `;
  }
}

export const listStudio = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.userId;
    await seedIfEmpty(userId);
    const sql = await getSql();
    const rules = await sql<{
      id: string;
      code: string;
      title: string;
      layer: string;
      domain: string;
      product: string;
      statement: string;
      check_json: string;
    }>`select id, code, title, layer, domain, product, statement, check_json from studio_rules where user_id = ${userId} order by code`;
    const tasks = await sql<{
      id: string;
      rule_id: string | null;
      title: string;
      notes: string;
      status: string;
    }>`select id, rule_id, title, notes, status from studio_tasks where user_id = ${userId} order by title`;
    const configs = await sql<{
      brand: string;
      json: string;
    }>`select brand, json from studio_configs where user_id = ${userId}`;
    const catalog = await sql<{
      kind: string;
      bytes: number;
      rows: number;
      updated_at: string;
    }>`select kind, bytes, rows, updated_at from studio_catalog where user_id = ${userId} order by kind`;
    const ruleN = await sql<{ n: number }>`select count(*)::int as n from studio_rules where user_id = ${userId}`;
    const taskN = await sql<{ n: number }>`select count(*)::int as n from studio_tasks where user_id = ${userId}`;
    const noteN = await sql<{ n: number }>`select count(*)::int as n from studio_notes where user_id = ${userId}`;
    const history = await sql<{
      id: string;
      kind: string;
      label: string;
      bytes: number;
      rows: number;
      created_at: string;
    }>`select id, kind, label, bytes, rows, created_at from studio_history where user_id = ${userId} order by created_at desc limit 40`;
    const findings = await sql<{
      id: string;
      code: string;
      title: string;
      lane: string;
      url: string;
      why: string;
      found: string;
      suggested: string;
    }>`select id, code, title, lane, url, why, found, suggested from studio_findings where user_id = ${userId} order by code, title`;
    const conflicts = detectRuleConflicts(rules);
    return {
      rules,
      conflicts,
      tasks,
      configs,
      catalog,
      history,
      findings,
      store: dbSource,
      counts: {
        rules: ruleN[0]?.n ?? 0,
        tasks: taskN[0]?.n ?? 0,
        notes: noteN[0]?.n ?? 0,
        versions: history.length,
      },
    };
  });

export const upsertRule = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(ruleInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = data.id ?? `${context.userId}:${data.code}`;
    await sql`
      insert into studio_rules (id, user_id, code, title, layer, domain, product, statement, check_json)
      values (${id}, ${context.userId}, ${data.code}, ${data.title}, ${data.layer}, ${data.domain}, ${data.product}, ${data.statement}, ${data.checkJson ?? "{}"})
      on conflict (id) do update set
        code = excluded.code,
        title = excluded.title,
        layer = excluded.layer,
        domain = excluded.domain,
        product = excluded.product,
        statement = excluded.statement,
        check_json = excluded.check_json
    `;
    await appendHistory(
      context.userId,
      "rule",
      `${data.code} ${data.title}`,
      JSON.stringify(data),
      1,
    );
    const rows = await sql<RuleRow>`
      select code, title, domain, product, statement from studio_rules where user_id = ${context.userId}
    `;
    const conflicts = detectRuleConflicts(rows);
    return { id, conflicts };
  });

export const deleteRule = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`delete from studio_rules where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true };
  });

export const upsertTask = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().optional(),
      title: z.string().min(1),
      notes: z.string().optional(),
      status: z.enum(["open", "done"]).optional(),
      ruleId: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = data.id ?? `${context.userId}:task:${crypto.randomUUID()}`;
    await sql`
      insert into studio_tasks (id, user_id, rule_id, title, notes, status)
      values (${id}, ${context.userId}, ${data.ruleId ?? null}, ${data.title}, ${data.notes ?? ""}, ${data.status ?? "open"})
      on conflict (id) do update set
        title = excluded.title,
        notes = excluded.notes,
        status = excluded.status,
        rule_id = excluded.rule_id
    `;
    const rows = await sql<RuleRow>`
      select code, title, domain, product, statement from studio_rules where user_id = ${context.userId}
    `;
    const conflicts = detectRuleConflicts(rows);
    return { id, conflicts };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`delete from studio_tasks where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true };
  });

export const saveConfig = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ brand: z.enum(["fdr", "achieve"]), json: z.string().min(2) }))
  .handler(async ({ context, data }) => {
    JSON.parse(data.json);
    const sql = await getSql();
    const id = `${context.userId}:${data.brand}`;
    await sql`
      insert into studio_configs (id, user_id, brand, json, updated_at)
      values (${id}, ${context.userId}, ${data.brand}, ${data.json}, now())
      on conflict (id) do update set json = excluded.json, updated_at = now()
    `;
    await appendHistory(
      context.userId,
      "config",
      `${data.brand} JSON`,
      data.json,
      1,
    );
    return { ok: true };
  });

export const saveNote = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ pageKey: z.string().min(1), body: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = `${context.userId}:${data.pageKey}`;
    await sql`
      insert into studio_notes (id, user_id, page_key, body, updated_at)
      values (${id}, ${context.userId}, ${data.pageKey}, ${data.body}, now())
      on conflict (id) do update set body = excluded.body, updated_at = now()
    `;
    return { ok: true };
  });

export const loadNote = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ pageKey: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ body: string }>`
      select body from studio_notes where user_id = ${context.userId} and page_key = ${data.pageKey} limit 1
    `;
    return { body: rows[0]?.body ?? "" };
  });

export async function recordLiveCrawl(
  userId: string,
  payload: {
    crawledAt: string;
    counts: { fdr: number; achieve: number };
    fdr: string[];
    achieve: string[];
  },
) {
  const json = JSON.stringify(payload);
  const rows = payload.fdr.length + payload.achieve.length;
  await upsertCatalogHead(userId, "crawl", json, rows);
  await appendHistory(
    userId,
    "crawl",
    `Live crawl ${payload.crawledAt.slice(0, 19)} · FDR ${payload.counts.fdr} · Achieve ${payload.counts.achieve}`,
    json,
    rows,
  );
}
