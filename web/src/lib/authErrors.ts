import type { AuthError } from "@supabase/supabase-js";

/** Maps Supabase Auth errors to short, actionable copy for the login UI. */
export function formatAuthError(err: AuthError): string {
  const raw = err.message ?? "";
  const msg = raw.toLowerCase();

  if (msg.includes("invalid login credentials") || msg.includes("invalid_grant")) {
    return "Wrong email or password. Check your details and try again, or create an account below.";
  }

  if (
    msg.includes("already registered") ||
    msg.includes("user already registered") ||
    msg.includes("already been registered") ||
    msg.includes("email address is already registered")
  ) {
    return "This email is already registered. Sign in instead, or use a different email.";
  }

  if (msg.includes("password") && (msg.includes("at least") || msg.includes("least 6") || msg.includes("short"))) {
    return "Password is too short. Use at least 6 characters (Supabase minimum).";
  }

  if (msg.includes("signup") && msg.includes("disabled")) {
    return "New sign-ups are disabled in this project. Ask an admin to enable email sign-up in Supabase.";
  }

  if (msg.includes("email") && (msg.includes("invalid") || msg.includes("format"))) {
    return "Enter a valid email address.";
  }

  if (msg.includes("rate limit") || msg.includes("too many")) {
    return "Too many attempts. Wait a minute and try again.";
  }

  return raw || "Something went wrong. Try again.";
}
