import assert from 'node:assert/strict';
import { test } from 'node:test';
import { domainRedirect } from '../src/lib/domain-redirect.ts';

const vars = { SITE_ROLE: 'public', EMDASH_SITE_URL: 'https://customseda.com' };
const old = 'https://customseda.customseda.workers.dev';

test('the old public hostname permanently redirects pages, media, CMS and queries to the real domain', () => {
 for (const path of ['/', '/products/top-brisa?talla=M', '/_emdash/admin/login?redirect=%2F_emdash%2Fadmin%2F', '/_emdash/api/media/file/photo.webp', '/_astro/site.js', '//external.example/path']) {
  const result = domainRedirect(new Request(old + path), vars);
  assert.equal(result.status, 301);
  assert.equal(result.headers.get('Location'), 'https://customseda.com' + path);
 }
});

test('domain redirects leave staging, localhost and the canonical hostname alone', () => {
 for (const origin of ['https://customseda.com', 'https://customseda-staging.customseda.workers.dev', 'http://localhost:4321']) {
  assert.equal(domainRedirect(new Request(origin + '/products/top-brisa'), vars), null);
 }
 for (const bindings of [{}, {...vars,SITE_ROLE:'preview'}, {...vars,CMS_ORIGIN:'https://customseda.com'}, {...vars,EMDASH_SITE_URL:old}]) {
  assert.equal(domainRedirect(new Request(old), bindings), null);
 }
});
