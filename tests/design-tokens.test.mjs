import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fluid, typeScale, spaceScale, renderFluidCss, VIEWPORT } from '../scripts/design/fluid-scale.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const cssFiles = dir => readdirSync(dir).flatMap(name => {
 const path = join(dir, name);
 return statSync(path).isDirectory() ? cssFiles(path) : path.endsWith('.css') ? [path] : [];
});
// Evaluate a generated clamp(min, preferred, max) at a viewport width in px (1rem = 16px).
const at = (clamp, vw) => {
 const [, min, rem, slope, max] = clamp.match(/^clamp\(([\d.]+)rem, ([-\d.]+)rem \+ ([-\d.]+)vw, ([\d.]+)rem\)$/);
 return Math.min(Number(max), Math.max(Number(min), Number(rem) + Number(slope) * vw / 100 / 16)) * 16;
};

test('fluid values interpolate exactly between the viewport bounds', () => {
 const value = fluid(17, 18);
 assert.ok(Math.abs(at(value, VIEWPORT.min) - 17) < 0.02);
 assert.ok(Math.abs(at(value, VIEWPORT.max) - 18) < 0.02);
 assert.ok(Math.abs(at(value, 2560) - 18) < 0.02);
 assert.ok(Math.abs(at(value, 320) - 17) < 0.02);
});

test('type scale keeps the audited sizes of the current storefront', () => {
 const steps = Object.fromEntries(typeScale().map(s => [s.step, s]));
 assert.equal(Math.round(steps[0].min), 17); assert.equal(Math.round(steps[0].max), 18);
 // Audit: H1/product title ≈36px mobile and 48px desktop; page title 62px desktop.
 assert.ok(Math.abs(steps[4].min - 36) < 1.5 && Math.abs(steps[4].max - 48) < 2.5);
 assert.ok(Math.abs(steps[5].max - 62.4) < 2.5);
 // UI floor of about 14px at both ends, so thin Cormorant microcopy stays legible.
 assert.ok(typeScale().every(s => Math.min(s.min, s.max) >= 13.9));
});

test('space pairs cover the audited gutters, gaps and band padding', () => {
 const pairs = Object.fromEntries(spaceScale().pairs.map(p => [p.name, p]));
 assert.deepEqual([pairs['s-xl'].min, pairs['s-xl'].max].map(Math.round), [17, 54]); // gutter 16 → 55
 assert.deepEqual([pairs['m-xl'].min, pairs['m-xl'].max].map(Math.round), [26, 54]); // bands 27 → 52
 assert.deepEqual([pairs['s-l'].min, pairs['s-l'].max].map(Math.round), [17, 36]); // grid 20 → 40
});

test('generated fluid.css is current with the generator', () => {
 assert.equal(read('src/styles/global/fluid.css'), renderFluidCss());
});

const hex = value => value.match(/^#([\da-f]{6})$/i)?.[1].match(/../g).map(h => parseInt(h, 16));
const luminance = rgb => {
 const [r, g, b] = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
 return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const props = css => Object.fromEntries([...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
const resolve = (all, name) => { let v = all[name]; while (v?.startsWith('var(')) v = all[v.slice(4, -1)]; return v; };

test('semantic text and surface pairs meet WCAG AA', () => {
 const all = props(read('src/styles/global/tokens.css'));
 const pairs = [
  ['--color-text', '--color-surface', 4.5], ['--color-text-strong', '--color-surface', 4.5],
  ['--color-text', '--color-surface-tint', 4.5], ['--color-text', '--color-surface-butter', 4.5],
  ['--color-on-cacao', '--color-surface-cacao', 4.5], ['--color-on-butter', '--color-surface-butter', 4.5],
  ['--color-action', '--color-surface', 4.5], ['--color-on-selected', '--color-selected', 4.5],
  ['--color-text-subtle', '--color-surface', 4.5], ['--color-focus', '--color-surface', 3],
  ['--color-border-control', '--color-surface', 3],
  ['--color-danger', '--color-surface', 4.5], ['--color-danger', '--color-surface-tint', 4.5],
 ];
 for (const [fg, bg, min] of pairs) {
  const [a, b] = [resolve(all, fg), resolve(all, bg)].map(hex);
  assert.ok(a && b, `${fg} and ${bg} resolve to hex colors`);
  assert.ok(contrast(a, b) >= min, `${fg} on ${bg} is ${contrast(a, b).toFixed(2)}:1, needs ${min}:1`);
 }
});

test('stylesheets declare the CUBE layer order and resolve every custom property', () => {
 const dir = new URL('../src/styles/', import.meta.url).pathname;
 const files = cssFiles(dir);
 const index = read('src/styles/index.css');
 assert.match(index, /@layer reset, tokens, global, compositions, blocks, utilities, exceptions;/);
 const css = files.map(f => readFileSync(f, 'utf8')).join('\n')
;
 const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
 // Astro's Fonts API injects these at runtime from astro.config.mjs.
 for (const name of ['--font-cormorant', '--font-montserrat']) defined.add(name);
 const used = [...css.matchAll(/var\((--[\w-]+)\)/g)].map(m => m[1]);
 const missing = [...new Set(used.filter(name => !defined.has(name)))];
 assert.deepEqual(missing, []);
 assert.doesNotMatch(css, /tailwind/i);
});

test('root font size stays at the user default so rem-based Utopia clamps hold', () => {
 const global = read('src/styles/global/global.css');
 const htmlRules = [...global.matchAll(/(?:^|\n)\s*html\s*\{([^}]*)\}/g)].map(m => m[1]).join('');
 assert.doesNotMatch(htmlRules, /font-size/);
 assert.match(global, /body\s*\{[^}]*font-size:\s*var\(--step-0\)/);
});

test('only selected Open Props values are emitted, copied from the pinned package',async()=>{
 const {renderOpenPropsCss,SELECTED}=await import('../scripts/design/open-props.mjs');
 const {default:OpenProps}=await import('open-props');
 assert.deepEqual(SELECTED,['--ease-out-3']);
 assert.equal(read('src/styles/global/open-props.css'),renderOpenPropsCss());
 assert.match(renderOpenPropsCss(),new RegExp(`--ease-out-3: ${OpenProps['--ease-out-3'].replace(/[().]/g,'\\$&')};`));
 assert.doesNotMatch(read('src/styles/index.css'),/open-props\/easings/);
});
