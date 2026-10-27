import test from 'node:test';
import assert from 'node:assert/strict';
import {routePrerender} from '../src/lib/build/route-mode.ts';

test('preview mode renders every page route on request',()=>{
 assert.equal(routePrerender('preview',true),false);
 assert.equal(routePrerender('preview',undefined),false);
 assert.equal(routePrerender('preview',false),false);
});

test('public mode keeps the route setting',()=>{
 assert.equal(routePrerender('public',true),true);
 assert.equal(routePrerender('public',false),false);
 assert.equal(routePrerender('public',undefined),undefined);
});
