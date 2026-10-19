/**
 * Shared Playwright helpers for the guard e2e checks. Runs against a locally built + served app
 * (`npm run build && npm run preview` → http://127.0.0.1:8081, override with GUARD_BASE).
 *
 * Login: the app's own demo sign-in form (admin / 123, the same as production). No test-only
 * bypass or seed exists or is needed — see GUARDRAILS.md.
 */
import { chromium } from "playwright";

export const BASE = process.env.GUARD_BASE ?? "http://127.0.0.1:8081";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

let browser;
export async function launch() {
  browser ??= await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  });
  return browser;
}
export async function closeAll() {
  await browser?.close();
  browser = undefined;
}

/** Fresh incognito context, signed in through the real /login form, on a cold ?view=graph load. */
export async function coldGraph() {
  const b = await launch();
  const context = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', "admin");
  await page.fill('input[type="password"]', "123");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
  await page.goto(`${BASE}/?view=graph`, { waitUntil: "networkidle" });
  await waitGraph(page);
  return { context, page, errors };
}

/** Graph is drawn and the family context (rule codes, issue nodes) has arrived. */
export async function waitGraph(page) {
  await page.waitForSelector('[data-testid="graph-sev-totals"]', { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll('g[data-kind="issue"]').length > 0, null, { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll('g[data-kind="page"]').length > 0, null, { timeout: 30_000 });
  await sleep(800);
}

export async function center(page, nodeId) {
  const box = await page.locator(`g[data-node-id="${nodeId}"] circle`).first().boundingBox();
  if (!box) throw new Error(`node ${nodeId} not on screen`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export const totals = (page, testId) =>
  page.evaluate((id) => {
    const e = document.querySelector(`[data-testid="${id}"]`);
    return e ? { C: +e.dataset.c, H: +e.dataset.h, M: +e.dataset.m, L: +e.dataset.l } : null;
  }, testId);

export async function tab(page, name) {
  await page.evaluate((t) => {
    const b = [...document.querySelectorAll("button,a,[role=tab]")].find((e) => e.textContent.trim() === t);
    if (!b) throw new Error(`no tab ${t}`);
    b.click();
  }, name);
  await sleep(1500);
}

export const hubShown = (page, id) =>
  page.evaluate((id) => document.querySelector(`g[data-node-id="${id}"] [data-testid="hub-shown"]`)?.textContent ?? null, id);

export const pagesOfHub = (page, brand, product) =>
  page.evaluate(
    ([b, p]) => [...document.querySelectorAll('g[data-kind="page"]')].filter((g) => g.dataset.nodeId?.startsWith(`page:${b}:${p}:`)).length,
    [brand, product],
  );

export const transformOf = (page, id) =>
  page.evaluate((id) => document.querySelector(`g[data-node-id="${id}"]`)?.getAttribute("transform"), id);

export const parseT = (t) => {
  const m = /translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)/.exec(t ?? "");
  return m ? { x: +m[1], y: +m[2] } : null;
};

/** Every DOM string that says "undefined" / "unknown": text, attribute values, SVG text. */
export const badStrings = (page) =>
  page.evaluate(() => {
    const re = /\b(undefined|unknown)\b/i;
    const out = new Set();
    for (const m of document.body.innerText.matchAll(/.{0,40}\b(undefined|unknown)\b.{0,30}/gi)) out.add(`text: ${m[0]}`);
    for (const el of document.querySelectorAll("*"))
      for (const a of el.attributes)
        if (re.test(a.value) && !["class", "style", "d", "href", "src"].includes(a.name)) out.add(`attr ${el.tagName}.${a.name}=${a.value.slice(0, 60)}`);
    return [...out];
  });

/** All Issues rows (virtual list) as code -> severity pill ("html" for live-HTML checks). */
export async function issueRows(page) {
  const all = new Map();
  for (let i = 0; i < 40; i++) {
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('[role=button][tabindex="0"]')].map((r) => {
        const code = r.querySelector("p")?.textContent?.split(" ")[0] ?? "";
        const pill = r.querySelector("[data-sev-pill]")?.getAttribute("data-sev-pill");
        const html = /\bHTML\b/.test(r.textContent ?? "") && !pill;
        return [code, pill ?? (html ? "html" : "?")];
      }),
    );
    for (const [c, s] of rows) if (c) all.set(c, s);
    const end = await page.evaluate(() => {
      const v = [...document.querySelectorAll(".overflow-auto")].find((e) => e.scrollHeight > e.clientHeight && e.querySelector("[role=button]"));
      if (!v) return true;
      const before = v.scrollTop;
      v.scrollTop += 400;
      return v.scrollTop === before;
    });
    await sleep(120);
    if (end) break;
  }
  return all;
}
