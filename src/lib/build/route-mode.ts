/** Preview builds render every page route on request; the public build keeps each route's own setting. */
export function routePrerender(mode: 'preview' | 'public', current: boolean | undefined): boolean | undefined {
  return mode === 'preview' ? false : current;
}
