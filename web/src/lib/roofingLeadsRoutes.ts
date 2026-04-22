import {
  COMPANY_SEARCH_MAX_LEN,
  parseLeadStatusFilterParam,
} from "@/lib/leadTypes";

/** List/search URL builder for `/roofing-leads` (mirrors home `buildListPath` semantics). */
export function buildRoofingLeadsListPath(
  pageNum: number,
  favoritesOnly: boolean,
  q: string,
  status: string,
): string {
  const p = new URLSearchParams();
  p.set("page", String(pageNum));
  if (favoritesOnly) p.set("favorites", "1");
  const trimmed = q.trim().slice(0, COMPANY_SEARCH_MAX_LEN);
  if (trimmed) p.set("q", trimmed);
  const st = status.trim();
  if (st && parseLeadStatusFilterParam(st)) p.set("status", st);
  const qs = p.toString();
  return qs ? `/roofing-leads?${qs}` : "/roofing-leads";
}
