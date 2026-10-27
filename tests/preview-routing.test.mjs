import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewRedirect } from '../src/lib/preview-routing.ts';
import { includeDrafts, runWithDrafts } from '../src/lib/draft-scope.ts';

const anon = { editor: false, previewToken: false };
const pub = 'https://pub.example';

test('redirects anonymous visitors to the same path and query on the public site', () => {
  assert.equal(previewRedirect(new URL('https://p.example/products/marea?x=1'), anon, pub), 'https://pub.example/products/marea?x=1');
});
test('lets CMS and asset prefixes through', () => {
  for (const path of ['/_emdash/admin', '/_astro/a.js', '/_image', '/_server-islands/x']) {
    assert.equal(previewRedirect(new URL(`https://p.example${path}`), anon, pub), null, path);
  }
});
test('lets editors and token holders through', () => {
  const url = new URL('https://p.example/products/marea');
  assert.equal(previewRedirect(url, { editor: true, previewToken: false }, pub), null);
  assert.equal(previewRedirect(url, { editor: false, previewToken: true }, pub), null);
});
test('does not redirect without a public site url', () => {
  assert.equal(previewRedirect(new URL('https://p.example/'), anon, undefined), null);
});
test('draft scope is request-local and false outside a scope', () => {
  assert.equal(includeDrafts(), false);
  assert.equal(runWithDrafts(true, () => includeDrafts()), true);
  assert.equal(runWithDrafts(false, () => includeDrafts()), false);
});
