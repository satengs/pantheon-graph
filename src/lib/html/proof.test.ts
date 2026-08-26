import assert from "node:assert/strict";
import test from "node:test";
import { extractPageProof, pairConflict } from "./proof.ts";

test("self-canonical is detected even when it looks valid", () => {
  const url = "https://www.achieve.com/glossary/d/debt-relief";
  const html = `<link rel="canonical" href="${url}"><title>Debt Relief Meaning & Definition | Achieve</title><h1>Debt Relief Meaning & Definition</h1>`;
  const p = extractPageProof(html, url);
  assert.equal(p.selfCanonical, true);
  assert.equal(p.h1, "Debt Relief Meaning & Definition");
});

test("twin self-canonicals produce a conflict", () => {
  const f = extractPageProof(
    `<link rel="canonical" href="https://www.freedomdebtrelief.com/glossary/d/debt-relief/"><h1>Debt Relief Meaning & Definition</h1><script type="application/ld+json">{"@type":"DefinedTerm","name":"Debt Relief","@id":"https://data.example/x"}</script>`,
    "https://www.freedomdebtrelief.com/glossary/d/debt-relief/",
  );
  const a = extractPageProof(
    `<link rel="canonical" href="https://www.achieve.com/glossary/d/debt-relief"><h1>Debt Relief Meaning & Definition</h1>`,
    "https://www.achieve.com/glossary/d/debt-relief",
  );
  const c = pairConflict("debt-relief", f, a);
  assert.match(c, /self/i);
  assert.match(c, /Identical H1/);
});
