import { hasFoundationCredentials } from './foundation-access.ts';

interface StagingEnvironment {
  FOUNDATION_ACCESS_TOKEN?: string;
  CMS_ORIGIN: string;
}

/** Staging's production CMS origin, or null. Worker and middleware share it, so neither gate is skipped alone. */
export function stagingCmsOrigin(vars: { CMS_ORIGIN?: unknown }): string | null {
  return typeof vars.CMS_ORIGIN === 'string' && vars.CMS_ORIGIN.trim() ? vars.CMS_ORIGIN : null;
}

// Reached without credentials: the CMS handoff, Stripe's signed webhook, build assets and media.
const EXEMPT = ['/preview/access', '/api/stripe/webhook'];
const EXEMPT_PREFIXES = ['/_astro/', '/_emdash/api/media/file/'];

/**
 * Staging shows drafts to production CMS editors (session from "View site") and to holders of the
 * shared reviewer credential. Everyone else gets a Basic challenge that points editors to the CMS.
 */
export function stagingAccess(request: Request, env: StagingEnvironment, editor: boolean): { drafts: boolean } | Response {
  if (editor || hasFoundationCredentials(request, env.FOUNDATION_ACCESS_TOKEN)) return { drafts: true };
  const { pathname } = new URL(request.url);
  if (EXEMPT.includes(pathname) || EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return { drafts: false };
  const login = new URL('/_emdash/admin/login', env.CMS_ORIGIN).toString();
  return new Response(
    `<!doctype html><html lang="es"><meta charset="utf-8"><title>Vista previa privada</title><p>Vista previa privada de Custom Seda.</p><p>Editores: <a href="${login}">inicia sesión en el CMS</a> y usa «Ver sitio».</p></html>`,
    {
      status: 401,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'WWW-Authenticate': 'Basic realm="Custom Seda preview", charset="UTF-8"',
      },
    },
  );
}
