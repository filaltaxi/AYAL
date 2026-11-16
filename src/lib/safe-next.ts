/**
 * Safe internal redirect target (no open redirects).
 * Must be a path on this site: starts with one "/", and has no backslash or
 * control character (browsers read "/\evil.com" as "//evil.com").
 */
export function safeNext(next: string | null | undefined, fallback = "/") {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
