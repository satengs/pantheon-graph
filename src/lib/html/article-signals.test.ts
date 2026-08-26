import assert from "node:assert/strict";
import test from "node:test";
import { analyzeArticleSignals } from "./article-signals.ts";

test("flags incomplete Achieve Article without dates", () => {
  const html = `<title>7 smarter debt steps | Achieve</title><h1>7 smarter debt steps to start the New Year</h1>
  <script type="application/ld+json">${JSON.stringify({
    "@type": "Article",
    headline: "7 smarter debt steps to start the New Year",
    author: { "@type": "Person", name: "Elina Tarkazikis" },
    image: "https://www.achieve.com/x.jpg",
    description: "A reset",
  })}</script>`;
  const f = analyzeArticleSignals(html, "https://www.achieve.com/learn/achieve-insights/7-smarter-debt-steps-to-start-the-new-year");
  assert.equal(f.some((x) => x.code === "S27"), true);
});

test("flags title vs H1 clash", () => {
  const html = `<title>401(K) Loan To Pay Off Your Credit Card Debt | Freedom Debt Relief</title>
  <h1>Is it a Good Idea to Use a 401(k) Loan to Pay Off Your Credit Card Debt?</h1>
  <script type="application/ld+json">${JSON.stringify({
    "@type": "Article",
    headline: "Is it a Good Idea to Use a 401(k) Loan to Pay Off Your Credit Card Debt?",
    author: { "@type": "Person", name: "Richard Barrington" },
    datePublished: "2023-01-23",
    dateModified: "2026-03-10",
    image: { "@id": "https://www.freedomdebtrelief.com/debt-relief/#primaryimage" },
  })}</script>`;
  const url = "https://www.freedomdebtrelief.com/learn/credit-card-debt/401k-loan-credit-card-debt/";
  const f = analyzeArticleSignals(html, url);
  assert.equal(f.some((x) => x.code === "S28"), true);
  assert.equal(f.some((x) => x.code === "S30"), true);
  assert.equal(f.some((x) => x.code === "S31"), true);
});
