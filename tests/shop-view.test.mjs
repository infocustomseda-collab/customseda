import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice, galleryImages, orderSizes, SIZE_ORDER, transitionNames, uniqueTransitions } from '../src/lib/shop/view.ts';

const row = (over = {}) => ({
 image: { id: 'm1', provider: 'local', width: 2792, height: 3490, dominantColor: 'rgb(131,113,101)', meta: { storageKey: '01ABC.jpg' } },
 alt: 'TOP TIERRA — Caoba, imagen 1',
 ...over,
});

test('prices format as Spanish euros from integer cents', () => {
 assert.equal(formatPrice(5000), '50,00 €');
 assert.equal(formatPrice(2650), '26,50 €');
 assert.equal(formatPrice(0), '0,00 €');
 assert.equal(formatPrice(123456), '1234,56 €');
 for (const bad of [-1, 1.5, NaN, '5000', null]) assert.throws(() => formatPrice(bad), /cents/);
});

test('gallery rows map to local media views in order, skipping unusable rows', () => {
 const views = galleryImages([
  row(),
  row({ image: null }),
  row({ alt: '', image: { ...row().image, id: 'm2', meta: { storageKey: '02.jpg' } }, focal_x: 0.25, focal_y: 1 }),
  row({ image: { id: 'm3', width: 10, height: 10, meta: {} } }),
 ]);
 assert.deepEqual(views, [
  { id: 'm1', src: '/_emdash/api/media/file/01ABC.jpg', alt: 'TOP TIERRA — Caoba, imagen 1', width: 2792, height: 3490, position: '50% 50%', placeholder: 'rgb(131,113,101)' },
  { id: 'm2', src: '/_emdash/api/media/file/02.jpg', alt: '', width: 2792, height: 3490, position: '25% 100%', placeholder: 'rgb(131,113,101)' },
 ]);
 assert.deepEqual(galleryImages(null), []);
 assert.deepEqual(galleryImages('[]'), []);
});

test('storage keys are URL-encoded and unsafe placeholders are dropped', () => {
 const [view] = galleryImages([row({ image: { ...row().image, dominantColor: 'red;}body{x', meta: { storageKey: 'a b/c.jpg' } } })]);
 assert.equal(view.src, '/_emdash/api/media/file/a%20b%2Fc.jpg');
 assert.equal(view.placeholder, undefined);
});

test('sizes follow XS–XL order regardless of source order and drop unknown codes', () => {
 assert.deepEqual(SIZE_ORDER, ['XS', 'S', 'M', 'L', 'XL']);
 assert.deepEqual(orderSizes(['M', 'S', 'XL', 'xs', 'XXL', 'S']), ['XS', 'S', 'M', 'XL']);
 assert.deepEqual(orderSizes(undefined), []);
});

test('transition names are stable and CSS-safe', () => {
	assert.deepEqual(transitionNames('product-01M5R1TTTRDVSFZVXQZSGEJCQQ'), {
		image: 'product-01m5r1tttrdvsfzvxqzsgejcqq-image',
		title: 'product-01m5r1tttrdvsfzvxqzsgejcqq-title',
	});
	assert.equal(transitionNames('Product x/1 ñ').image, 'product-x-1---image');
	assert.match(transitionNames('9 lives').title, /^[a-z_-]/);
});

test('duplicate cards on one page keep a single transition name', () => {
	const card = (id) => ({ href: `/products/${id}`, title: id, priceCents: 1, images: [], available: true, transitionName: `product-${id}` });
	const unique = uniqueTransitions([card('a'), card('b'), card('a')]);
	assert.deepEqual(unique.map((c) => c.transitionName), ['product-a', 'product-b', undefined]);
	assert.equal(unique[2].title, 'a');
});
