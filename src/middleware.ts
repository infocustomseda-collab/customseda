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
  if (mode === 'preview') {
    const target = previewRedirect(context.url, access, (env as unknown as { PUBLIC_SITE_URL?: string }).PUBLIC_SITE_URL);
    if (target) return context.redirect(target, 302);
  }
  return runWithDrafts(draftsVisible(mode, access), next);
});

export const onRequest = sequence(defineMiddleware(catalogWriteMiddleware), previewMiddleware);
