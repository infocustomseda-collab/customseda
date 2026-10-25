import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('@view-transition sits outside any @layer so browsers apply it',async()=>{
 const css=await readFile('src/styles/global/global.css','utf8');
 const at=css.indexOf('@view-transition {');
 assert.ok(at>0);
 // Brace depth before the rule: only the enclosing @media may be open.
 let depth=0;for(const c of css.slice(0,at)) depth+=c==='{'?1:c==='}'?-1:0;
 assert.equal(depth,1);
 assert.match(css.slice(0,at),/@media \(prefers-reduced-motion: no-preference\) \{\s*$/);
});
