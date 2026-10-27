import { timingSafeEqual } from 'node:crypto';

interface FoundationEnvironment {
  FOUNDATION_LOCKED?: string;
  FOUNDATION_ACCESS_TOKEN?: string;
}

/** Temporary deployment gate: protects the unclaimed setup wizard, not a CMS login. */
export function foundationAccess(request: Request, env: FoundationEnvironment): Response | null {
  if (env.FOUNDATION_LOCKED !== 'true') return null;
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  if (!env.FOUNDATION_ACCESS_TOKEN) return new Response('Foundation access is not configured.', { status: 503, headers });
  const expected = `Basic ${btoa(`seda:${env.FOUNDATION_ACCESS_TOKEN}`)}`;
  const encoder = new TextEncoder();
  const b = encoder.encode(expected);
  // Browsers send Authorization; CLI clients use X-Foundation-Access, keeping Authorization for their CMS token.
  for (const name of ['Authorization', 'X-Foundation-Access']) {
    const a = encoder.encode(request.headers.get(name) ?? '');
    if (a.byteLength === b.byteLength && timingSafeEqual(a, b)) return null;
  }
  return new Response('Private deployment verification.', {
    status: 401,
    headers: { ...headers, 'WWW-Authenticate': 'Basic realm="Custom Seda foundation", charset="UTF-8"' },
  });
}
