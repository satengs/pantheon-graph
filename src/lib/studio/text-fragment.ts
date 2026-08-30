/** Chrome text fragment so the live page scrolls to and highlights the quote. */
export function textFragmentUrl(url: string, quote?: string): string {
  if (!url.startsWith("http")) return url;
  const [base, hash] = url.split("#");
  const t = (quote || "").replace(/\s+/g, " ").trim();
  if (t.length < 8) {
    if (hash && !hash.startsWith(":~:")) return url;
    return base;
  }
  const start = t.slice(0, Math.min(96, t.length));
  return `${base}#:~:text=${encodeURIComponent(start)}`;
}

export function sectionHint(location?: string): string {
  const l = (location || "").toLowerCase();
  if (l.includes("faq")) return "FAQ";
  if (l.includes("footer") || l.includes("nmls")) return "Footer / disclosures";
  if (l.includes("title") || l.includes("h1")) return "Title / H1";
  if (l.includes("json") || l.includes("schema")) return "JSON-LD";
  if (l.includes("nav")) return "Navigation";
  return location?.trim() || "Page";
}
