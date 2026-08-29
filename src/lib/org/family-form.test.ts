import assert from "node:assert/strict";
import test from "node:test";
import {
  firstErrorStep,
  hasFamilyErrors,
  parseWebsite,
  usedBrand,
  validateFamilyDraft,
  validateOrgName,
  validateWebsiteField,
} from "./family-form.ts";

test("parseWebsite accepts empty, host-only, and https", () => {
  assert.equal(parseWebsite("").ok && "empty" in parseWebsite("") && parseWebsite("").empty, true);
  const host = parseWebsite("www.example.com");
  assert.equal(host.ok && !host.empty && host.host, "example.com");
  const full = parseWebsite("https://www.achieve.com/heloc");
  assert.equal(full.ok && !full.empty && full.host, "achieve.com");
});

test("parseWebsite rejects junk URLs", () => {
  assert.equal(parseWebsite("javascript:alert(1)").ok, false);
  assert.equal(parseWebsite("not a url").ok, false);
  assert.equal(parseWebsite("http://localhost").ok, true);
  assert.equal(parseWebsite("https://nope").ok, false);
  assert.equal(parseWebsite("ftp://example.com").ok, false);
});

test("validateOrgName covers empty, short, and non-letter", () => {
  assert.equal(validateOrgName("  ", "parent"), "Name the parent company");
  assert.equal(validateOrgName("A", "brand"), "Use at least 2 characters");
  assert.equal(validateOrgName("12345", "brand"), "Include a letter in the name");
  assert.equal(validateOrgName("Northstar", "parent"), undefined);
});

test("draft requires parent name and at least one brand", () => {
  const empty = validateFamilyDraft({ parentName: "", parentUrl: "", brands: [{ key: "a", name: "", website: "" }] });
  assert.equal(empty.parentName, "Name the parent company");
  assert.equal(empty.form, "Add at least one sub-company");
  assert.equal(firstErrorStep(empty), 1);
  assert.equal(hasFamilyErrors(empty), true);
});

test("draft rejects invalid parent URL and website-only brand without a name", () => {
  const e = validateFamilyDraft({
    parentName: "Northstar",
    parentUrl: "nope",
    brands: [{ key: "b1", name: "", website: "https://www.example.com" }],
  });
  assert.ok(e.parentUrl);
  assert.equal(e.brands.b1?.name, "Name this brand");
});

test("draft rejects duplicate names and hosts", () => {
  const e = validateFamilyDraft({
    parentName: "Acme",
    parentUrl: "https://www.acme.com",
    brands: [
      { key: "b1", name: "Acme", website: "https://one.example.com" },
      { key: "b2", name: "Beta", website: "https://www.acme.com/about" },
    ],
  });
  assert.equal(e.brands.b1?.name, "The parent already uses this name");
  assert.equal(e.brands.b2?.website, "The parent already uses this website");
});

test("draft flags names already in the studio", () => {
  const e = validateFamilyDraft(
    { parentName: "Pantheon", parentUrl: "", brands: [{ key: "b1", name: "Achieve", website: "https://www.achieve.com" }] },
    [
      { name: "Pantheon", host: "", kind: "parent" },
      { name: "Achieve", host: "achieve.com", kind: "brand" },
    ],
  );
  assert.equal(e.parentName, "A parent with this name already exists");
  assert.equal(e.brands.b1?.name, "A brand with this name already exists");
});

test("parent may be name-only; each brand needs a website", () => {
  const missing = validateFamilyDraft({
    parentName: "Northstar",
    parentUrl: "",
    brands: [{ key: "b1", name: "Lumen", website: "" }],
  });
  assert.equal(missing.parentName, undefined);
  assert.equal(missing.parentUrl, undefined);
  assert.equal(missing.brands.b1?.website, "Add this brand's website");

  const ok = validateFamilyDraft({
    parentName: "Northstar",
    parentUrl: "",
    brands: [{ key: "b1", name: "Lumen", website: "https://www.lumen.example" }],
  });
  assert.equal(hasFamilyErrors(ok), false);
});

test("valid family passes", () => {
  const e = validateFamilyDraft({
    parentName: "Northstar",
    parentUrl: "northstar.example",
    brands: [
      { key: "b1", name: "Lumen", website: "https://www.lumen.example" },
      { key: "b2", name: "Harbor", website: "harbor.example" },
    ],
  });
  assert.equal(hasFamilyErrors(e), false);
  assert.equal(usedBrand({ key: "x", name: "Harbor", website: "" }), true);
  assert.equal(validateWebsiteField(""), "Paste a website first");
});
