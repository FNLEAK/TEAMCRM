const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

function formatServerError(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") {
    return fallback || "Request failed";
  }
  const err = (data as { error?: unknown }).error;
  if (typeof err === "string" && err.trim()) {
    return err;
  }
  if (err && typeof err === "object") {
    const o = err as { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
    if (o.fieldErrors && typeof o.fieldErrors === "object") {
      const lines = Object.entries(o.fieldErrors).flatMap(([field, msgs]) =>
        (msgs ?? []).map((m) => `${field}: ${m}`),
      );
      if (lines.length) return lines.join(" ");
    }
    if (Array.isArray(o.formErrors) && o.formErrors.length) {
      return o.formErrors.join(" ");
    }
  }
  return fallback || "Request failed";
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(
  path: string,
  token: string | null,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  let body = init?.body;
  if (init?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers, body });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg = formatServerError(data, res.statusText);
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}
