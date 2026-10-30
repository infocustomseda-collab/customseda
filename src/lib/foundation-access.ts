import { timingSafeEqual } from 'node:crypto';

interface FoundationEnvironment {
  FOUNDATION_LOCKED?: string;
  FOUNDATION_ACCESS_TOKEN?: string;
}

/** True when the request carries `seda:<token>` Basic credentials; never without a token. */
export function hasFoundationCredentials(request: Request, token: string | undefined): boolean {
  if (!token) return false;
  const encoder = new TextEncoder();
  const b = encoder.encode(`Basic ${btoa(`seda:${token}`)}`);
  // Browsers send Authorization; CLI clients use X-Foundation-Access, keeping Authorization for their CMS token.
  return ['Authorization', 'X-Foundation-Access'].some((name) => {
    const a = encoder.encode(request.headers.get(name) ?? '');
    return a.byteLength === b.byteLength && timingSafeEqual(a, b);
  });
}

/** Temporary deployment gate: protects the unclaimed setup wizard, not a CMS login. */
export function foundationAccess(request: Request, env: FoundationEnvironment): Response | null {
  if (env.FOUNDATION_LOCKED !== 'true') return null;
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  if (!env.FOUNDATION_ACCESS_TOKEN) return new Response('Foundation access is not configured.', { status: 503, headers });
  if (hasFoundationCredentials(request, env.FOUNDATION_ACCESS_TOKEN)) return null;
  return new Response('Private deployment verification.', {
    status: 401,
    headers: { ...headers, 'WWW-Authenticate': 'Basic realm="Custom Seda foundation", charset="UTF-8"' },
  });
}
