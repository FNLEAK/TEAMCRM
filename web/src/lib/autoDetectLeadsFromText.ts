/**
 * Auto-detect leads from messy CSV/TXT using regex + heuristics (no strict column mapping).
 */

import type { LeadInsertPayload } from "@/lib/csvLeadMapping";
import { formatUsPhoneDisplay } from "@/lib/phone";

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
const EMAIL_SINGLE_RE = /\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/i;

/** Domains with common TLDs (extend as needed) */
const WEBSITE_RE =
  /\b(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9-]+)*\.(?:com|org|io|net|us|co|biz|info|edu|gov|ai|app|dev))\b/gi;

/**
 * Find first valid US-style 10-digit number (optionally 11 starting with 1) in a line.
 * Returns formatted (XXX)-XXX-XXXX and the raw 10 digits for deduping.
 */
export function extractFirstPhoneFromText(line: string): { display: string; digits10: string } | null {
  const d = line.replace(/\D/g, "");
  if (d.length < 10) return null;

  for (let i = 0; i <= d.length - 10; i++) {
    if (i + 11 <= d.length && d[i] === "1") {
      const eleven = d.slice(i, i + 11);
      if (/^1\d{10}$/.test(eleven)) {
        const ten = eleven.slice(1);
        const display = formatUsPhoneDisplay(ten);
        if (!display) return null;
        return { display, digits10: ten };
      }
    }
    const ten = d.slice(i, i + 10);
    if (/^\d{10}$/.test(ten)) {
      const display = formatUsPhoneDisplay(ten);
      if (!display) return null;
      return { display, digits10: ten };
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

function firstEmail(line: string): string | null {
  const m = line.match(EMAIL_RE);
  return m?.[0] ?? null;
}

function normalizeCompanyWord(raw: string): string {
  const cleaned = raw
    .replace(/[_\-+.]+/g, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

function companyFromEmail(email: string | null): string | null {
  if (!email) return null;
  const m = email.match(EMAIL_SINGLE_RE);
  if (!m) return null;
  const domain = m[2].toLowerCase();
  const parts = domain.split(".").filter(Boolean);
  if (parts.length < 2) return null;
  // Use second-level domain as business root (e.g. smartlandscaping from smartlandscaping.weebly.com)
  const root = parts[parts.length - 2];
  if (!root || /^(gmail|yahoo|outlook|hotmail|icloud|aol|protonmail|live|msn)$/.test(root)) return null;
  const normalized = normalizeCompanyWord(root);
  return normalized.length >= 2 ? normalized : null;
}

function companyFromWebsite(url: string | null): string | null {
  if (!url) return null;
  const host = url
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .toLowerCase()
    .replace(/^www\./, "");
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return null;
  // For subdomains like smartlandscaping.weebly.com prefer left-most label as brand
  const root = parts.length >= 3 ? parts[0] : parts[parts.length - 2];
  if (!root || /^(www|mail|app|admin|cdn|api)$/.test(root)) return null;
  const normalized = normalizeCompanyWord(root);
  return normalized.length >= 2 ? normalized : null;
}

function removeUrlNoiseForCompany(s: string): string {
  return s
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(/\b[a-z0-9.-]+\.(?:com|org|io|net|us|co|biz|info|edu|gov|ai|app|dev)\S*/gi, " ")
    .replace(/\bhttps?:?\/{0,2}\b/gi, " ");
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
  const email = firstEmail(line);
  const fromEmail = companyFromEmail(email);
  if (fromEmail) return fromEmail.slice(0, 200);

  let work = line;
  work = removeEmails(work);
  work = removeUrlNoiseForCompany(work);
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
    if (/^(?:https?:?\/{0,2}|www)$/i.test(p)) continue;
    if (/[/.]/.test(p) && !/[a-z]/i.test(p)) continue;
    if (/^[a-z0-9.-]+\.(?:com|org|io|net|us|co|biz|info|edu|gov|ai|app|dev)$/i.test(p)) continue;
    const low = p.toLowerCase().replace(/[^a-z0-9]/gi, "");
    if (PLACEHOLDER_WORDS.has(low)) continue;
    if (/^\d+$/.test(p)) continue;
    if (p.includes("@")) continue;
    if (p.length >= 2) candidates.push(p);
  }

  if (candidates.length > 0) {
    const candidate = candidates.slice(0, 12).join(" ").slice(0, 200);
    // If this still looks like URL noise, discard it.
    if (!/(?:https?:\/\/|www\.|\.com|\.org|\.net|\.io|\.co|\.biz|\.info|\.ai|\.app|\.dev)/i.test(candidate)) {
      return candidate;
    }
  }

  /** Fallback: whole cleaned line minus obvious junk */
  const cleaned = stripPlaceholderTokens(removeDigitNoiseForCompany(removeEmails(line))).replace(/\s+/g, " ").trim();
  if (cleaned && !/(?:https?:\/\/|www\.|\.com|\.org|\.net|\.io|\.co|\.biz|\.info|\.ai|\.app|\.dev)/i.test(cleaned)) {
    return cleaned.slice(0, 200);
  }
  return companyFromWebsite(website)?.slice(0, 200) ?? "";
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
  let email: string | null = null;
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
    const em = firstEmail(cell);
    if (em && !email) {
      email = em;
    }
    if (cell.includes("@")) continue;
    const cleaned = stripPlaceholderTokens(removeUrlNoiseForCompany(cell));
    const low = cleaned.toLowerCase();
    if (cleaned.length < 2 || PLACEHOLDER_WORDS.has(low.replace(/[^a-z0-9]/gi, ""))) continue;
    companyParts.push(cleaned);
  }

  let company = companyParts.join(" ").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!company) company = companyFromEmail(email) ?? "";
  if (!company) company = companyFromWebsite(website) ?? "";
  if (/(?:https?:\/\/|www\.|\.com|\.org|\.net|\.io|\.co|\.biz|\.info|\.ai|\.app|\.dev)/i.test(company)) {
    company = companyFromEmail(email) ?? companyFromWebsite(website) ?? "";
  }
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
