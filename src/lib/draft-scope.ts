/** The current request's draft decision, set once by src/middleware.ts and read by the content helpers. */
import { AsyncLocalStorage } from 'node:async_hooks';

const scope = new AsyncLocalStorage<boolean>();

export function runWithDrafts<T>(visible: boolean, next: () => T): T {
  return scope.run(visible, next);
}

/** False outside a request scope; dev mode forces drafts on separately. */
export function includeDrafts(): boolean {
  return scope.getStore() ?? false;
}
