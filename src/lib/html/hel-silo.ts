import type { HtmlFinding } from "@/lib/html/semantic";

const HELOC_PATH = /\/heloc(\/|$|\?)/i;
const HEL_PATH = /\/home-equity-loan(\/|$|\?)/i;

function titleOf(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return (m?.[1] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function h1s(html: string): string[] {
  const out: string[] = [];
  const re = /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.push(m[1]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  }
  return out;
}

function finding(url: string, found: string, why: string, suggested: string): HtmlFinding {
  return {
    id: `S32:${url}`,
    code: "S32",
    title: "Keep HELOC and home equity loan siloed",
    lane: "achieve",
    url,
    why,
    found,
    suggested,
  };
}

/** HELOC (line of credit) and HEL (closed-end loan) are different products. */
export function analyzeHelSilo(html: string, url: string): HtmlFinding[] {
  const title = titleOf(html);
  const heads = h1s(html);
  const head = heads[0] ?? "";
  const blob = `${title} ${head}`.toLowerCase();

  if (HELOC_PATH.test(url) && !HEL_PATH.test(url)) {
    const claimsHel =
      /\bhome equity loan\b/.test(blob) && !/\bcompare\b|\bvs\.?\b|\bversus\b|\bdifference\b/.test(blob);
    const h1IsHel = /^home equity loan\b/i.test(head) && !/heloc|line of credit/i.test(head);
    if (claimsHel || h1IsHel) {
      return [
        finding(
          url,
          `title ${title}\nH1 ${head || "(none)"}`,
          "This URL is the HELOC product. Treating home equity loan as the same product merges two LoanOrCredit entities.",
          "H1 and title stay HELOC / line of credit. Compare links to /home-equity-loan must be labeled compare, not aliases.",
        ),
      ];
    }
  }

  if (HEL_PATH.test(url)) {
    const claimsHeloc = /\bheloc\b/.test(blob) && !/\bcompare\b|\bvs\.?\b|\bversus\b|\bdifference\b/.test(blob);
    const h1IsHeloc = /\bheloc\b/i.test(head) && !/home equity loan/i.test(head);
    if (claimsHeloc || h1IsHeloc) {
      return [
        finding(
          url,
          `title ${title}\nH1 ${head || "(none)"}`,
          "This URL is the home equity loan product. Naming it HELOC steals the line-of-credit entity.",
          "H1 and title stay home equity loan / lump sum / closed-end. Compare links to /heloc must be labeled compare.",
        ),
      ];
    }
  }

  return [];
}
