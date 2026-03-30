/**
 * Auto-detect leads from messy CSV/TXT using regex + heuristics (no strict column mapping).
 */

import type { LeadInsertPayload } from "@/lib/csvLeadMapping";

export type AutoDetectResult = {
  leads: LeadInsertPayload[];
  /** Rows/lines that produced no usable lead */
  skippedLines: number;
  duplicatesRemoved: number;
  linesScanned: number;
};

/** Column-header junk and placeholder tokens from messy exports */
const PLACEHOLDER_WORDS = new Set(
  [
    "owner",
    "deal_amount",
    "deal amount",
    "dealamount",
    "manager",
    "sales_rep",
    "sales rep",
    "rep",
    "first_name",
    "first name",
    "last_name",
    "last name",
    "email",
    "phone",
    "website",
    "company",
    "business",
    "title",
    "notes",
    "status",
    "n/a",
    "na",
    "null",
    "undefined",
    "tbd",
    "unknown",
  ].map((s) => s.toLowerCase()),
);

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;

/** Domains with common TLDs (extend as needed) */
const WEBSITE_RE =
  /\b(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9-]+)*\.(?:com|org|io|net|us|co|biz|info|edu|gov|ai|app|dev))\b/gi;

function formatUsPhone10(digits10: string): string {
  if (digits10.length !== 10) return digits10;
  return `(${digits10.slice(0, 3)}) ${digits10.slice(3, 6)}-${digits10.slice(6)}`;
}

/**
 * Find first valid US-style 10-digit number (optionally 11 starting with 1) in a line.
 * Returns formatted (XXX) XXX-XXXX and the raw 10 digits for deduping.
 */
export function extractFirstPhoneFromText(line: string): { display: string; digits10: string } | null {
  const d = line.replace(/\D/g, "");
  if (d.length < 10) return null;

  for (let i = 0; i <= d.length - 10; i++) {
    if (i + 11 <= d.length && d[i] === "1") {
      const eleven = d.slice(i, i + 11);
      if (/^1\d{10}$/.test(eleven)) {
        const ten = eleven.slice(1);
        return { display: formatUsPhone10(ten), digits10: ten };
      }
    }
    const ten = d.slice(i, i + 10);
    if (/^\d{10}$/.test(ten)) {
      return { display: formatUsPhone10(ten), digits10: ten };
    }
  }
  return null;
}

function firstWebsite(line: string): string | null {
  const m = line.match(WEBSITE_RE);
  if (!m?.[0]) return null;
  let url = m[0].trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

function stripPlaceholderTokens(s: string): string {
  let t = s;
  for (const word of PLACEHOLDER_WORDS) {
    const re = new RegExp(`\\b${word.replace(/_/g, "[_\\s]")}\\b`, "gi");
    t = t.replace(re, " ");
  }
  return t.replace(/\s+/g, " ").trim();
}

function removeEmails(s: string): string {
  return s.replace(EMAIL_RE, " ");
}

/**
 * Remove phone-like digit runs from string (after extraction) so company line is cleaner.
 */
function removeDigitNoiseForCompany(s: string): string {
  return s.replace(/\d[\d\s().\-]{6,}\d/g, " ");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildCompanyFromLine(line: string, phoneDisplay: string | null, website: string | null): string {
  let work = line;
  work = removeEmails(work);
  if (website) {
    const bare = website.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    work = work.replace(new RegExp(escapeRegExp(bare), "gi"), " ");
  }
  work = removeDigitNoiseForCompany(work);
  work = stripPlaceholderTokens(work);
  work = work.replace(/[,|;]+/g, " ").replace(/\s+/g, " ").trim();

  /** Split into tokens; first token that looks like a business name (not email/phone-like) */
  const parts = work.split(/\s+/).filter(Boolean);
  const candidates: string[] = [];
  for (const p of parts) {
    const low = p.toLowerCase().replace(/[^a-z0-9]/gi, "");
    if (PLACEHOLDER_WORDS.has(low)) continue;
    if (/^\d+$/.test(p)) continue;
    if (p.includes("@")) continue;
    if (p.length >= 2) candidates.push(p);
  }

  if (candidates.length > 0) {
    return candidates.slice(0, 12).join(" ").slice(0, 200);
  }

  /** Fallback: whole cleaned line minus obvious junk */
  const cleaned = stripPlaceholderTokens(removeDigitNoiseForCompany(removeEmails(line))).replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 200);
}

function splitDelimitedCells(line: string): string[] | null {
  if (line.includes("\t")) {
    const p = line.split("\t").map((s) => s.trim());
    return p.filter(Boolean).length >= 2 ? p.filter(Boolean) : null;
  }
  const commaCount = (line.match(/,/g) ?? []).length;
  if (commaCount >= 1) {
    const p = line.split(",").map((s) => s.trim()).filter(Boolean);
    return p.length >= 2 ? p : null;
  }
  return null;
}

/**
 * Prefer comma/tab-separated cells (typical CSV row) — classify each field.
 */
function extractFromDelimitedLine(line: string): { phone: string | null; website: string | null; company: string } | null {
  const parts = splitDelimitedCells(line);
  if (!parts) return null;

  let phone: string | null = null;
  let website: string | null = null;
  const companyParts: string[] = [];

  for (const cell of parts) {
    const ph = extractFirstPhoneFromText(cell);
    if (ph && !phone) {
      phone = ph.display;
      continue;
    }
    const w = firstWebsite(cell);
    if (w && !website) {
      website = w;
      continue;
    }
    if (cell.includes("@")) continue;
    const cleaned = stripPlaceholderTokens(cell);
    const low = cleaned.toLowerCase();
    if (cleaned.length < 2 || PLACEHOLDER_WORDS.has(low.replace(/[^a-z0-9]/gi, ""))) continue;
    companyParts.push(cleaned);
  }

  const company = companyParts.join(" ").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!company && !phone && !website) return null;
  return { phone, website, company };
}

function leadKey(l: Pick<LeadInsertPayload, "company_name" | "phone" | "website">): string {
  const p = (l.phone ?? "").replace(/\D/g, "");
  const c = l.company_name.toLowerCase().trim();
  const w = (l.website ?? "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  if (p.length >= 10) return `p:${p.slice(-10)}`;
  return `c:${c}|w:${w}`;
}

function dedupe(leads: LeadInsertPayload[]): { leads: LeadInsertPayload[]; removed: number } {
  const seen = new Set<string>();
  const out: LeadInsertPayload[] = [];
  for (const L of leads) {
    const k = leadKey(L);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(L);
  }
  return { leads: out, removed: leads.length - out.length };
}

/**
 * Scan raw file text line-by-line; extract phone, website, company per line.
 */
export function autoDetectLeadsFromText(raw: string): AutoDetectResult {
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const leads: LeadInsertPayload[] = [];
  let skippedLines = 0;

  for (const line of lines) {
    const delimited = extractFromDelimitedLine(line);

    let phone: string | null;
    let website: string | null;
    let company: string;

    if (delimited) {
      phone = delimited.phone;
      website = delimited.website;
      company = delimited.company || buildCompanyFromLine(line, phone, website);
    } else {
      const phoneInfo = extractFirstPhoneFromText(line);
      phone = phoneInfo?.display ?? null;
      website = firstWebsite(line);
      company = buildCompanyFromLine(line, phone, website);
    }

    company = stripPlaceholderTokens(company);

    if (!company || company.length < 2) {
      if (phone || website) {
        company = "Unknown business";
      } else {
        skippedLines++;
        continue;
      }
    }

    /** Reject company that's only placeholders after strip */
    const onlyJunk = !/[A-Za-z0-9]{2,}/.test(company);
    if (onlyJunk && !phone && !website) {
      skippedLines++;
      continue;
    }
    if (onlyJunk && (phone || website)) {
      company = "Unknown business";
    }

    leads.push({
      company_name: company,
      phone,
      website,
      status: "New",
    });
  }

  const { leads: unique, removed } = dedupe(leads);

  return {
    leads: unique,
    skippedLines,
    duplicatesRemoved: removed,
    linesScanned: lines.length,
  };
}
