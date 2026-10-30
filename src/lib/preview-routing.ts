const PASS_THROUGH = ['/_emdash', '/_astro', '/_image', '/_server-islands'];

/** Where to send a visitor who may not see the preview Worker, or null to serve the page. */
export function previewRedirect(
  url: URL,
  access: { editor: boolean; previewToken: boolean },
  publicSiteUrl: string | undefined,
  privateSite = false,
): string | null {
  if (privateSite) {
    if (access.editor) return null;
    // EmDash protects its own admin/API routes; anonymous users need its login assets.
    if (['/_emdash', '/_astro'].some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) return null;
    return new URL('/_emdash/admin/login', url.origin).toString();
  }
  if (!publicSiteUrl || access.editor || access.previewToken) return null;
  if (PASS_THROUGH.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) return null;
  return new URL(url.pathname + url.search, publicSiteUrl).toString();
}
