/**
 * Map arbitrary CSV headers (e.g. "Business Name", "Site") to `leads` insert columns.
 * Supports fuzzy header matching plus content-based inference when headers are messy or unknown.
 */

import Papa from "papaparse";
import { normalizeLeadPhoneForStorage } from "@/lib/phone";

export type LeadInsertPayload = {
  company_name: string;
  phone: string | null;
  website: string | null;
  status: string;
  /** Set on bulk CSV import — same UUID for every row in that run. */
  import_batch_id?: string | null;
  /** Original CSV filename for that import (same on each row in the batch). */
  import_filename?: string | null;
};

const DEFAULT_STATUS = "New";

export function normalizeHeaderKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FIELD_ALIASES: Record<"company_name" | "phone" | "website", string[]> = {
  company_name: [
    "company_name",
    "company name",
    "business name",
    "business",
    "name",
    "company",
    "organization",
    "org",
    "title",
    "account",
    "customer",
    "client",
    "firm",
    "establishment",
  ],
  phone: [
    "phone",
    "telephone",
    "tel",
    "mobile",
    "cell",
    "phone number",
    "contact number",
    "main phone",
    "office phone",
    "primary phone",
  ],
  website: [
    "website",
    "site",
    "url",
    "web",
    "domain",
    "link",
    "homepage",
    "web site",
    "www",
  ],
};

export type CsvColumnResolution = {
  /** Original CSV header string → used for Papa row keys */
  columnByField: Partial<Record<"company_name" | "phone" | "website", string>>;
  /** Human-readable lines for the UI */
  summaryLines: string[];
  /** True if we can resolve company (required) */
  ok: boolean;
};

export function resolveCsvColumns(headers: string[]): CsvColumnResolution {
  const cleaned = headers.map((h) => (typeof h === "string" ? h.trim() : "")).filter(Boolean);
  const normToOriginal = new Map<string, string>();
  for (const h of cleaned) {
    normToOriginal.set(normalizeHeaderKey(h), h);
  }

  const columnByField: Partial<Record<"company_name" | "phone" | "website", string>> = {};
  const summaryLines: string[] = [];

  (["company_name", "phone", "website"] as const).forEach((field) => {
    const aliases = FIELD_ALIASES[field];
    let found: string | undefined;
    for (const alias of aliases) {
      const key = normalizeHeaderKey(alias);
      if (normToOriginal.has(key)) {
        found = normToOriginal.get(key);
        break;
      }
    }
    if (!found) {
      for (const h of cleaned) {
        const n = normalizeHeaderKey(h);
        for (const alias of aliases) {
          const ak = normalizeHeaderKey(alias);
          if (n.includes(ak) || ak.includes(n)) {
            found = h;
            break;
          }
        }
        if (found) break;
      }
    }
    if (found) {
      columnByField[field] = found;
      summaryLines.push(`${found} → ${field} (header match)`);
    }
  });

  const ok = Boolean(columnByField.company_name);
  return { columnByField, summaryLines, ok };
}

/** Strip UTF-8 BOM so first header parses correctly. */
export function stripBom(text: string): string {
  if (text.length > 0 && text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const base = (h || "").trim() || "Column";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

type PapaResult = Papa.ParseResult<Record<string, string>>;

function parseWithDelimiter(text: string, delimiter: string): PapaResult {
  /** Empty string = Papa auto-detect delimiter (comma, tab, etc.) */
  const delim: string = delimiter.length === 0 ? "" : delimiter;
  /** Runtime Papa supports relaxColumnCount / dynamicTyping; bundled @types can lag — keep a narrow typed surface. */
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: "greedy",
    delimiter: delim,
    transformHeader: (h) => String(h ?? "").trim() || "Column",
    quoteChar: '"',
    escapeChar: '"',
    relaxColumnCount: true,
    dynamicTyping: false,
  } as Parameters<typeof Papa.parse>[1]);
  return result as PapaResult;
}

function isFatalPapaErrors(errors: Papa.ParseError[]): boolean {
  return errors.some((e) => {
    const code = String(e.code ?? "");
    return code === "TooFewFields" || code === "TooManyFields";
  });
}

function scoreParse(r: PapaResult): number {
  const fields = r.meta.fields?.filter(Boolean) ?? [];
  const nFields = fields.length;
  const nRows = r.data?.length ?? 0;
  if (nFields < 1 || nRows < 1) return -1;
  return nFields * 10000 + nRows;
}

/**
 * Read CSV as plain text and parse with tolerant settings.
 * Tries Papa auto-detect, then explicit delimiters, and keeps the best-scoring result.
 */
export function parseCsvTextRobust(text: string): {
  headers: string[];
  rows: Record<string, unknown>[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const raw = stripBom(text);
  const trimmed = raw.trim();
  if (!trimmed) {
    return { headers: [], rows: [], warnings: ["Empty file"] };
  }

  const candidates: { label: string; result: PapaResult }[] = [];

  const auto = parseWithDelimiter(trimmed, "");
  candidates.push({ label: "auto", result: auto });

  for (const d of [",", ";", "\t", "|"]) {
    candidates.push({ label: d === "\t" ? "TAB" : d, result: parseWithDelimiter(trimmed, d) });
  }

  let best: { label: string; result: PapaResult } | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    const { result } = c;
    if (result.errors?.length && isFatalPapaErrors(result.errors)) continue;
    const s = scoreParse(result);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }

  if (!best || bestScore < 0) {
    const fallback = auto;
    if (fallback.errors?.length) {
      warnings.push(
        ...fallback.errors.slice(0, 3).map((e) => e.message || String(e)),
      );
    }
    return normalizePapaOutput(fallback, warnings);
  }

  if (best.result.errors?.length) {
    const nonQuotes = best.result.errors.filter((e) => e.code !== "MissingQuotes");
    if (nonQuotes.length) {
      warnings.push(
        ...nonQuotes.slice(0, 2).map((e) => e.message || e.code || "parse warning"),
      );
    }
  }
  warnings.push(`Parsed using delimiter: ${best.label}`);

  return normalizePapaOutput(best.result, warnings);
}

function normalizePapaOutput(
  result: PapaResult,
  warnings: string[],
): { headers: string[]; rows: Record<string, unknown>[]; warnings: string[] } {
  let rawFields = (result.meta.fields ?? []).map((f) => String(f ?? "").trim());
  const data = result.data ?? [];

  if (!rawFields.length && data[0] && typeof data[0] === "object") {
    rawFields = Object.keys(data[0] as object);
  }

  if (!rawFields.length) {
    return { headers: [], rows: [], warnings };
  }

  const headers = dedupeHeaders(rawFields);
  const rows: Record<string, unknown>[] = [];

  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const src = row as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    let any = false;
    for (let i = 0; i < rawFields.length; i++) {
      const orig = rawFields[i];
      const hk = headers[i] ?? `Column ${i + 1}`;
      const v = src[orig];
      if (v != null && String(v).trim() !== "") any = true;
      out[hk] = v ?? "";
    }
    if (any) rows.push(out);
  }

  return { headers, rows, warnings };
}

/** Score 0–1: how much values look like phone numbers. */
export function scorePhoneColumn(values: string[]): number {
  let sum = 0;
  let n = 0;
  for (const raw of values) {
    const s = raw.trim();
    if (!s) continue;
    n++;
    sum += valueLooksLikePhone(s);
  }
  return n ? sum / n : 0;
}

/** Score 0–1: URL / domain-like. */
export function scoreWebsiteColumn(values: string[]): number {
  let sum = 0;
  let n = 0;
  for (const raw of values) {
    const s = raw.trim();
    if (!s) continue;
    n++;
    sum += valueLooksLikeWebsite(s);
  }
  return n ? sum / n : 0;
}

/** Score 0–1: business / company name-like (not phone, not URL). */
export function scoreCompanyColumn(values: string[]): number {
  let sum = 0;
  let n = 0;
  for (const raw of values) {
    const s = raw.trim();
    if (!s) continue;
    n++;
    sum += valueLooksLikeCompanyName(s);
  }
  return n ? sum / n : 0;
}

function valueLooksLikePhone(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 15) {
    if (/^\+?[\d\s().\-]+$/.test(t) || digits.length >= 10) return 1;
  }
  if (digits.length === 7 && /^[\d().\s\-]+$/.test(t)) return 0.75;
  if (digits.length >= 10) return 0.85;
  return 0;
}

function valueLooksLikeWebsite(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  if (/^https?:\/\//i.test(t)) return 1;
  if (/^www\./i.test(t)) return 0.95;
  if (/\b[a-z0-9][-a-z0-9.]*\.[a-z]{2,}\b/i.test(t)) return 0.9;
  if (/\.(com|net|org|io|co|us|biz|info)\b/i.test(t)) return 0.85;
  return 0;
}

function valueLooksLikeCompanyName(s: string): number {
  const t = s.trim();
  if (!t || t.length < 2) return 0;
  const p = valueLooksLikePhone(t);
  const w = valueLooksLikeWebsite(t);
  if (p >= 0.75 || w >= 0.75) return 0.05;
  if (t.length > 120) return 0.35;
  if (/^\d+$/.test(t.replace(/\s/g, ""))) return 0.1;
  let score = 0.55;
  if (t.length >= 3 && t.length <= 80) score += 0.25;
  if (/[A-Za-z]/.test(t)) score += 0.15;
  return Math.min(1, score);
}

const SAMPLE_ROWS = 80;

type ColScore = { header: string; phone: number; website: number; company: number };

function scoreAllColumns(headers: string[], rows: Record<string, unknown>[]): ColScore[] {
  const sample = rows.slice(0, SAMPLE_ROWS);
  return headers.map((header) => {
    const values: string[] = [];
    for (const row of sample) {
      const v = row[header];
      values.push(v == null ? "" : String(v));
    }
    return {
      header,
      phone: scorePhoneColumn(values),
      website: scoreWebsiteColumn(values),
      company: scoreCompanyColumn(values),
    };
  });
}

function pickBest(
  scores: ColScore[],
  field: "phone" | "website" | "company",
  used: Set<string>,
): string | undefined {
  let best: ColScore | undefined;
  for (const s of scores) {
    if (used.has(s.header)) continue;
    if (!best || s[field] > best[field]) best = s;
  }
  if (!best) return undefined;
  const min = field === "phone" ? 0.35 : field === "website" ? 0.3 : 0.25;
  return best[field] >= min ? best.header : undefined;
}

/**
 * Merge header alias matching with content-based inference for any missing or weak fields.
 */
export function resolveCsvColumnsWithInference(
  headers: string[],
  rows: Record<string, unknown>[],
): CsvColumnResolution {
  const base = resolveCsvColumns(headers);
  const scores = scoreAllColumns(headers, rows);
  const columnByField = { ...base.columnByField };
  const summaryLines = [...base.summaryLines];
  const used = new Set<string>(
    Object.values(columnByField).filter((x): x is string => Boolean(x)),
  );

  const addLine = (line: string) => {
    if (!summaryLines.includes(line)) summaryLines.push(line);
  };

  if (!columnByField.website) {
    const col = pickBest(scores, "website", used);
    if (col) {
      columnByField.website = col;
      used.add(col);
      addLine(`${col} → website (auto-detected from values)`);
    }
  }

  if (!columnByField.phone) {
    const col = pickBest(scores, "phone", used);
    if (col) {
      columnByField.phone = col;
      used.add(col);
      addLine(`${col} → phone (auto-detected from values)`);
    }
  }

  if (!columnByField.company_name) {
    let col = pickBest(scores, "company", used);
    if (col) {
      columnByField.company_name = col;
      used.add(col);
      addLine(`${col} → company_name (auto-detected from values)`);
    } else {
      for (const h of headers) {
        if (!used.has(h)) {
          columnByField.company_name = h;
          used.add(h);
          addLine(`${h} → company_name (fallback: first unused column)`);
          break;
        }
      }
    }
  }

  if (!columnByField.company_name && headers.length === 1) {
    columnByField.company_name = headers[0];
    addLine(`${headers[0]} → company_name (single-column file)`);
  }

  const ok = Boolean(columnByField.company_name);
  return { columnByField, summaryLines, ok };
}

function cell(row: Record<string, unknown>, header: string | undefined): string | null {
  if (!header) return null;
  const v = row[header];
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/** Returns null if row should be skipped (no company name). */
export function csvRowToLeadPayload(
  row: Record<string, unknown>,
  columnByField: CsvColumnResolution["columnByField"],
): LeadInsertPayload | null {
  const company = cell(row, columnByField.company_name);
  if (!company) return null;
  const rawPhone = cell(row, columnByField.phone);
  return {
    company_name: company,
    phone: normalizeLeadPhoneForStorage(rawPhone),
    website: cell(row, columnByField.website),
    status: DEFAULT_STATUS,
  };
}

export function mapParsedRowsToPayloads(
  data: Record<string, unknown>[],
  columnByField: CsvColumnResolution["columnByField"],
): LeadInsertPayload[] {
  const out: LeadInsertPayload[] = [];
  for (const row of data) {
    const p = csvRowToLeadPayload(row, columnByField);
    if (p) out.push(p);
  }
  return out;
}

export const CSV_IMPORT_BATCH_SIZE = 500;
