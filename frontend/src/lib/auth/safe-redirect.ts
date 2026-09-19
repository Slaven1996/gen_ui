/** Only follow same-app paths after login — never `//evil.com` or absolute URLs (open redirect). */
export function safeRedirect(target: string | undefined, fallback = '/dashboard'): string {
  if (!target?.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return fallback;
  if (target.startsWith('/login')) return fallback;
  return target;
}
