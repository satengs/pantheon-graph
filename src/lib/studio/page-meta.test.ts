import assert from "node:assert/strict";
import test from "node:test";
import { pageMetaBlocksLive, pageMetaForUrl } from "./page-meta.ts";

test("page inspector seed has canonical + H1 without opening an issue", () => {
  const meta = pageMetaForUrl("https://www.freedomdebtrelief.com/glossary/d/debt-relief/");
  assert.ok(meta);
  assert.match(meta.canonical, /debt-relief/);
  assert.equal(meta.selfCanonical, true);
  assert.ok(meta.h1);
});

test("unknown URL returns null rather than inventing metadata", () => {
  assert.equal(pageMetaForUrl("https://example.com/nope"), null);
  assert.equal(pageMetaForUrl(""), null);
});

test("bankruptcy identity includes og:title and description when captured", () => {
  const meta = pageMetaForUrl("https://www.freedomdebtrelief.com/glossary/b/bankruptcy/");
  assert.ok(meta);
  assert.match(meta.canonical, /bankruptcy/);
  assert.ok(meta.ogTitle);
  assert.ok(meta.description);
  assert.equal(meta.robots, "");
});

test("/debt-relief/ inspector has snapshot fields and blocks live on S02", () => {
  const meta = pageMetaForUrl("https://www.freedomdebtrelief.com/debt-relief/");
  assert.ok(meta);
  assert.equal(meta.robots, "index,follow");
  assert.match(meta.ogTitle, /debt relief/i);
  assert.match(meta.description, /creditor/i);
  assert.equal(pageMetaBlocksLive(meta), true);
});
