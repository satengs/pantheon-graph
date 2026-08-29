export type FamilyBrandDraft = {
  key: string;
  name: string;
  website: string;
};

export type FamilyDraft = {
  parentName: string;
  parentUrl: string;
  brands: FamilyBrandDraft[];
};

export type ExistingOrgHint = {
  name: string;
  host: string;
  kind: "parent" | "brand";
};

export type BrandFieldErrors = {
  name?: string;
  website?: string;
};

export type FamilyFormErrors = {
  parentName?: string;
  parentUrl?: string;
  brands: Record<string, BrandFieldErrors>;
  form?: string;
};

export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const URL_MAX = 300;
export const BRAND_MAX = 12;

export function isBlank(raw: string): boolean {
  return raw.trim().length === 0;
}

export function usedBrand(b: FamilyBrandDraft): boolean {
  return !isBlank(b.name) || !isBlank(b.website);
}

export function parseWebsite(
  raw: string,
): { ok: true; empty: true } | { ok: true; empty: false; url: string; host: string } | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) return { ok: true, empty: true };
  if (t.length > URL_MAX) return { ok: false, error: "Keep the URL under 300 characters" };
  if (/\s/.test(t)) return { ok: false, error: "Remove spaces from the URL" };
  if (/^(javascript|data|file|vbscript):/i.test(t)) return { ok: false, error: "Use an http(s) website" };
  const withProto = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  let u: URL;
  try {
    u = new URL(withProto);
  } catch {
    return { ok: false, error: "That doesn't look like a website" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: "Use an http(s) website" };
  }
  const host = u.hostname.replace(/\.$/, "").toLowerCase();
  if (!host) return { ok: false, error: "That doesn't look like a website" };
  if (host !== "localhost" && !host.includes(".")) {
    return { ok: false, error: "Include a domain, like example.com" };
  }
  if (!/^[a-z0-9.-]+$/i.test(host)) return { ok: false, error: "That host isn't valid" };
  if (host.includes("..") || host.startsWith(".") || host.startsWith("-")) {
    return { ok: false, error: "That host isn't valid" };
  }
  return { ok: true, empty: false, url: u.toString(), host: host.replace(/^www\./, "") };
}

export function validateOrgName(raw: string, kind: "parent" | "brand"): string | undefined {
  const t = raw.trim();
  if (!t) return kind === "parent" ? "Name the parent company" : "Name this brand";
  if (t.length < NAME_MIN) return "Use at least 2 characters";
  if (t.length > NAME_MAX) return `Keep it under ${NAME_MAX} characters`;
  if (/[<>\u0000-\u001f]/.test(t)) return "Remove special characters";
  if (!/[a-z]/i.test(t)) return "Include a letter in the name";
  return undefined;
}

export function emptyFamilyErrors(): FamilyFormErrors {
  return { brands: {} };
}

export function hasFamilyErrors(e: FamilyFormErrors): boolean {
  return Boolean(e.parentName || e.parentUrl || e.form || Object.keys(e.brands).length);
}

export function firstErrorStep(e: FamilyFormErrors): 1 | 2 | 3 {
  if (e.parentName || e.parentUrl) return 1;
  if (e.form || Object.keys(e.brands).length) return 2;
  return 3;
}

function setBrandError(errors: FamilyFormErrors, key: string, field: keyof BrandFieldErrors, message: string) {
  const cur = errors.brands[key] ?? {};
  cur[field] = message;
  errors.brands[key] = cur;
}

export function validateFamilyDraft(draft: FamilyDraft, existing: ExistingOrgHint[] = []): FamilyFormErrors {
  const errors = emptyFamilyErrors();
  const parentName = draft.parentName.trim();
  const nameErr = validateOrgName(draft.parentName, "parent");
  if (nameErr) errors.parentName = nameErr;

  const parentSite = parseWebsite(draft.parentUrl);
  if (!parentSite.ok) errors.parentUrl = parentSite.error;

  const takenNames = new Map<string, string>();
  const takenHosts = new Map<string, string>();
  for (const o of existing) {
    const n = o.name.trim().toLowerCase();
    if (n) takenNames.set(n, o.kind === "parent" ? "A parent with this name already exists" : "A brand with this name already exists");
    const h = o.host.trim().toLowerCase().replace(/^www\./, "");
    if (h) takenHosts.set(h, "This website is already in the studio");
  }

  if (!nameErr && parentName) {
    const hit = takenNames.get(parentName.toLowerCase());
    if (hit) errors.parentName = hit;
    takenNames.set(parentName.toLowerCase(), "The parent already uses this name");
  }

  if (parentSite.ok && !parentSite.empty) {
    const hit = takenHosts.get(parentSite.host);
    if (hit) errors.parentUrl = hit;
    takenHosts.set(parentSite.host, "The parent already uses this website");
  }

  const filled = draft.brands.filter(usedBrand);
  if (filled.length === 0) {
    errors.form = "Add at least one sub-company";
  }
  if (filled.length > BRAND_MAX) {
    errors.form = `Keep the family to ${BRAND_MAX} brands`;
  }

  for (const b of filled) {
    const nErr = validateOrgName(b.name, "brand");
    if (nErr) setBrandError(errors, b.key, "name", nErr);
    else {
      const key = b.name.trim().toLowerCase();
      const hit = takenNames.get(key);
      if (hit) setBrandError(errors, b.key, "name", hit);
      else takenNames.set(key, "Another brand already uses this name");
    }

    const site = parseWebsite(b.website);
    if (!site.ok) setBrandError(errors, b.key, "website", site.error);
    else if (site.empty) setBrandError(errors, b.key, "website", "Add this brand's website");
    else {
      const hit = takenHosts.get(site.host);
      if (hit) setBrandError(errors, b.key, "website", hit);
      else takenHosts.set(site.host, "Another company already uses this website");
    }
  }

  return errors;
}

export function validateWebsiteField(raw: string): string | undefined {
  const parsed = parseWebsite(raw);
  if (!parsed.ok) return parsed.error;
  if (parsed.empty) return "Paste a website first";
  return undefined;
}
