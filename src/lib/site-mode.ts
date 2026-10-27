export type SiteMode = 'dev' | 'preview' | 'public';

/** Dev runtime always wins; otherwise only the exact "preview" value selects preview mode. */
export function siteMode(isDev: boolean, configured: string | undefined): SiteMode {
  if (isDev) return 'dev';
  return configured === 'preview' ? 'preview' : 'public';
}

/** Editors at role 20 or higher (Editor and above) may preview drafts. */
export function canPreviewDrafts(role: number | undefined): boolean {
  return role !== undefined && role >= 20;
}

/** Drafts show in dev, and in preview for editors or holders of the preview token. */
export function draftsVisible(mode: SiteMode, access: { editor: boolean; previewToken: boolean }): boolean {
  if (mode === 'dev') return true;
  if (mode === 'preview') return access.editor || access.previewToken;
  return false;
}

/** The service worker (and its update banner) ships only with deployed public builds, never preview. */
export function registersServiceWorker(mode: SiteMode, isProd: boolean): boolean {
  return isProd && mode !== 'preview';
}
