import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicAdminRedirect } from '../src/lib/public-routing.ts';

const preview = 'https://preview.example';
const redirect = (path, role = 'public') => publicAdminRedirect(new URL(`https://pub.example${path}`), role, preview);

test('public role sends admin paths to the same path on the preview origin', () => {
  assert.equal(redirect('/_emdash/admin'), 'https://preview.example/_emdash/admin');
  assert.equal(redirect('/_emdash'), 'https://preview.example/_emdash');
});
test('public role keeps the query string on redirected admin and content API requests', () => {
  assert.equal(redirect('/_emdash/api/content/products?x=1'), 'https://preview.example/_emdash/api/content/products?x=1');
});
test('public role keeps original media files on the public origin', () => {
  assert.equal(redirect('/_emdash/api/media/file/A.jpg'), null);
});
test('public role serves storefront and checkout routes itself', () => {
  assert.equal(redirect('/products/marea'), null);
  assert.equal(redirect('/api/stripe/webhook'), null);
  assert.equal(redirect('/checkout/success'), null);
});
test('paths that only share the prefix text are not admin paths', () => {
  assert.equal(redirect('/_emdashx/admin'), null);
});
test('preview and unset roles never redirect', () => {
  assert.equal(redirect('/_emdash/admin', 'preview'), null);
  assert.equal(publicAdminRedirect(new URL('https://pub.example/_emdash/admin'), undefined, preview), null);
});
test('a public role without a preview origin never redirects', () => {
  assert.equal(publicAdminRedirect(new URL('https://pub.example/_emdash/admin'), 'public', undefined), null);
});
