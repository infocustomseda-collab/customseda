const ADMIN_PREFIX = '/_emdash';
const ORIGINAL_MEDIA_PREFIX = '/_emdash/api/media/file/';

/** Where the public Worker sends admin and content-API traffic, or null to serve the request here. */
export function publicAdminRedirect(url: URL, role: string | undefined, previewSiteUrl: string | undefined): string | null {
  if (role !== 'public' || !previewSiteUrl) return null;
  const isAdmin = url.pathname === ADMIN_PREFIX || url.pathname.startsWith(`${ADMIN_PREFIX}/`);
  if (!isAdmin || url.pathname.startsWith(ORIGINAL_MEDIA_PREFIX)) return null;
  return new URL(url.pathname + url.search, previewSiteUrl).toString();
}
