import { defineMiddleware, sequence } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { getRequestContext } from 'emdash';
import { catalogWriteMiddleware } from './lib/cms/write-middleware.ts';
import { runWithDrafts } from './lib/draft-scope.ts';
import { stagingAccess, stagingCmsOrigin } from './lib/staging-access.ts';
import { canPreviewDrafts, draftsVisible, siteMode } from './lib/site-mode.ts';

const previewMiddleware = defineMiddleware(async (context, next) => {
  const mode = siteMode(import.meta.env.DEV, import.meta.env.SITE_MODE);
  if (mode === 'public') return next();
  const vars = env as unknown as { CMS_ORIGIN?: string; FOUNDATION_ACCESS_TOKEN?: string };
  const editor = canPreviewDrafts(context.locals.user?.role);
  // Staging: production editors (via "View site") and the shared reviewer credential see drafts.
  const cmsOrigin = stagingCmsOrigin(vars);
  if (mode === 'preview' && cmsOrigin) {
    const access = stagingAccess(context.request, { CMS_ORIGIN: cmsOrigin, FOUNDATION_ACCESS_TOKEN: vars.FOUNDATION_ACCESS_TOKEN }, editor);
    if (access instanceof Response) return access;
    const response = await runWithDrafts(access.drafts, next);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  }
  return runWithDrafts(draftsVisible(mode, { editor, previewToken: !!getRequestContext()?.preview }), next);
});

export const onRequest = sequence(defineMiddleware(catalogWriteMiddleware), previewMiddleware);
