import { defineMiddleware, sequence } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { getRequestContext } from 'emdash';
import { catalogWriteMiddleware } from './lib/cms/write-middleware.ts';
import { runWithDrafts } from './lib/draft-scope.ts';
import { previewRedirect } from './lib/preview-routing.ts';
import { stagingAccess } from './lib/staging-access.ts';
import { canPreviewDrafts, draftsVisible, siteMode } from './lib/site-mode.ts';

const previewMiddleware = defineMiddleware(async (context, next) => {
  const mode = siteMode(import.meta.env.DEV, import.meta.env.SITE_MODE);
  if (mode === 'public') return next();
  const vars = env as unknown as { PUBLIC_SITE_URL?: string; CMS_ORIGIN?: string; FOUNDATION_ACCESS_TOKEN?: string };
  const editor = canPreviewDrafts(context.locals.user?.role);
  // Staging: production editors (via "View site") and the shared reviewer credential see drafts.
  if (mode === 'preview' && vars.CMS_ORIGIN) {
    const access = stagingAccess(context.request, { CMS_ORIGIN: vars.CMS_ORIGIN, FOUNDATION_ACCESS_TOKEN: vars.FOUNDATION_ACCESS_TOKEN }, editor);
    if (access instanceof Response) return access;
    const response = await runWithDrafts(access.drafts, next);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  }
  const access = { editor, previewToken: !!getRequestContext()?.preview };
  if (mode === 'preview') {
    const target = previewRedirect(context.url, access, vars.PUBLIC_SITE_URL);
    if (target) return new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  }
  return runWithDrafts(draftsVisible(mode, access), next);
});

export const onRequest = sequence(defineMiddleware(catalogWriteMiddleware), previewMiddleware);
