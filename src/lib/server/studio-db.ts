import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { RULES, ruleStatement, DEFAULT_BRAND_CONFIG } from "@/data/rules-seed";

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

async function seedIfEmpty(userId: string) {
  const sql = await getSql();
  const existing = await sql<{ n: number }>`select count(*)::int as n from studio_rules where user_id = ${userId}`;
  if ((existing[0]?.n ?? 0) > 0) return;
  for (const r of RULES) {
    const id = `${userId}:${r.id}`;
    await sql`
      insert into studio_rules (id, user_id, code, title, layer, domain, product, statement, check_json)
      values (${id}, ${userId}, ${r.code}, ${r.title}, ${r.layer}, ${r.domain}, ${r.product}, ${ruleStatement(r)}, ${"{}"})
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
      on conflict (id) do update set json = excluded.json
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
    return { rules, tasks, configs, store: "postgres" as const };
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
    return { id };
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
    return { id };
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
