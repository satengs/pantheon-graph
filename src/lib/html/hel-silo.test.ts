import assert from "node:assert/strict";
import { analyzeHelSilo } from "./hel-silo.ts";

const mix = `<html><title>Home Equity Loan | Achieve</title><h1>Home Equity Loan</h1></html>`;
const okHeloc = `<html><title>HELOC | Achieve</title><h1>Home Equity Line of Credit (HELOC)</h1></html>`;
const okHel = `<html><title>Home Equity Loan | Achieve</title><h1>Home Equity Loan</h1></html>`;
const compare = `<html><title>HELOC vs home equity loan</title><h1>Compare HELOC vs home equity loan</h1></html>`;

const bad = analyzeHelSilo(mix, "https://www.achieve.com/heloc");
assert.equal(bad.some((f) => f.code === "S32"), true, "HEL title on /heloc fails S32");

const goodH = analyzeHelSilo(okHeloc, "https://www.achieve.com/heloc");
assert.equal(goodH.length, 0, "HELOC title on /heloc passes");

const goodL = analyzeHelSilo(okHel, "https://www.achieve.com/home-equity-loan");
assert.equal(goodL.length, 0, "HEL title on /home-equity-loan passes");

const vs = analyzeHelSilo(compare, "https://www.achieve.com/heloc");
assert.equal(vs.length, 0, "labeled compare is allowed");

const steal = analyzeHelSilo(
  `<html><title>HELOC</title><h1>HELOC</h1></html>`,
  "https://www.achieve.com/home-equity-loan",
);
assert.equal(steal.some((f) => f.code === "S32"), true, "HELOC H1 on HEL URL fails");

console.log("hel-silo.test.ts ok");
