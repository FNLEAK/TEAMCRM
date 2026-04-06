/** Turn `jane.smith@co.com` into "Jane Smith" for display when no profile name exists. */
export function readableEmailLocalPart(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) return email.trim();
  return local
    .replace(/[.+_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
