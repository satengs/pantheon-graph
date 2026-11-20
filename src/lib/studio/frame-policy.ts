/** Whether a target page's headers allow this app to embed it in an iframe. */
export function allowsFraming(xfo: string | null | undefined, csp: string | null | undefined): boolean {
  if (xfo && /(?:^|\s)(?:deny|sameorigin)(?:\s|$)/i.test(xfo.trim())) return false;
  if (!csp) return true;
  const m = /(?:^|;)[^;]*frame-ancestors\s+([^;]+)/i.exec(csp);
  if (!m) return true;
  const src = m[1]!.trim().toLowerCase();
  if (!src || src === "'none'" || src === "none") return false;
  // A lone * allows any embedder. Anything else (including 'self') is a closed list we are not on.
  const tokens = src.split(/\s+/).filter(Boolean);
  return tokens.includes("*");
}
