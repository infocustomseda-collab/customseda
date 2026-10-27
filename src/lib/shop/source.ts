import { includeDrafts } from '../draft-scope.ts';
import type { SiteMode } from '../site-mode.ts';

/** Where shop content comes from: the build snapshot (public) or live D1 (dev, preview). */
export function shopSource(mode: SiteMode): { live: boolean; drafts: boolean } {
  if (mode === 'public') return { live: false, drafts: false };
  return { live: true, drafts: mode === 'dev' || includeDrafts() };
}
