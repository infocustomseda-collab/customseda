import { defineMiddleware, sequence } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { getRequestContext } from 'emdash';
import { catalogWriteMiddleware } from './lib/cms/write-middleware.ts';
import { runWithDrafts } from './lib/draft-scope.ts';
import { previewRedirect } from './lib/preview-routing.ts';
import { canPreviewDrafts, draftsVisible, siteMode } from './lib/site-mode.ts';

const previewMiddleware = defineMiddleware(async (context, next) => {
  const mode = siteMode(import.meta.env.DEV, import.meta.env.SITE_MODE);
  if (mode === 'public') return next();
  const access = { editor: canPreviewDrafts(context.locals.user?.role), previewToken: !!getRequestContext()?.preview };
  const vars = env as unknown as { PUBLIC_SITE_URL?: string; PRIVATE_SITE?: string; CMS_ORIGIN?: string };
  const privateSite = mode === 'preview' && vars.PRIVATE_SITE === 'true';
  if (mode === 'preview') {
    if (vars.CMS_ORIGIN && context.url.pathname === '/preview/access') return next();
    const target = previewRedirect(context.url, access, vars.PUBLIC_SITE_URL, privateSite);
    const destination = target && vars.CMS_ORIGIN ? new URL('/_emdash/admin/login',vars.CMS_ORIGIN).toString() : target;
    if (destination) return new Response(null, { status: 302, headers: { Location: destination, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  }
  const response = await runWithDrafts(draftsVisible(mode, access), next);
  if (privateSite) {
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return response;
});

export const onRequest = sequence(defineMiddleware(catalogWriteMiddleware), previewMiddleware);
