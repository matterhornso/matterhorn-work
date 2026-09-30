import assert from 'node:assert/strict';
import { createSubnetCache } from './subnet-cache.mjs';

const live = block => ({ freshness: 'live', block, fetchedAt: '2026-09-29T00:00:00Z', subnets: [{ netuid: 1, freshness: 'live' }] });
const unavailable = () => ({ freshness: 'unavailable', block: null });
let calls = 0;
let time = 0;
let fetchResult = () => live(1);
const cache = createSubnetCache({ fetchSubnets: async () => { calls++; return fetchResult(); }, unavailable, ttlMs: 100, now: () => time, waitMs: 20 });
const first = await Promise.all([cache(1), cache(1), cache(1)]);
assert.equal(calls, 1, 'cold requests share a refresh');
assert.ok(first.every(result => result.freshness === 'live' && result.block === 1));
await cache(1);
assert.equal(calls, 1, 'fresh requests reuse cache');
time = 101;
fetchResult = () => { throw new Error('upstream private diagnostic'); };
const stale = await cache(1);
assert.equal(stale.freshness, 'stale');
assert.equal(stale.subnets[0].freshness, 'stale');
assert.equal(stale.block, 1);
assert.ok(!JSON.stringify(stale).includes('private diagnostic'));
fetchResult = () => live(2);
assert.equal((await cache(1)).block, 2, 'failure does not suppress next retry');

let finish;
let slowCalls = 0;
const slow = createSubnetCache({ fetchSubnets: () => { slowCalls++; return new Promise(resolve => { finish = resolve; }); }, unavailable, ttlMs: 100, waitMs: 5 });
assert.equal((await slow(1)).freshness, 'unavailable', 'cold timeout never pretends to be live');
assert.equal((await slow(1)).freshness, 'unavailable');
assert.equal(slowCalls, 1, 'bounded waits do not start duplicate SDK requests');
finish(live(3));
assert.equal((await slow(1)).block, 3, 'next request receives completed refresh');

let attempts = 0;
const empty = createSubnetCache({ fetchSubnets: async () => { attempts++; return { freshness: 'unavailable', subnets: [] }; }, unavailable, ttlMs: 100, waitMs: 5 });
assert.equal((await empty(1)).freshness, 'unavailable');
assert.equal((await empty(1)).freshness, 'unavailable');
assert.equal(attempts, 2, 'unavailable payloads are not cached as live');
console.log('subnet cache: cold/coalescing/deadline/stale/failure/recovery passed');
