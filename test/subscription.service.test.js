const test = require('node:test');
const assert = require('node:assert/strict');
const { computeAccess, getEffectivePropertyLimit } = require('../src/services/subscription.service');
const { getPublicPlans } = require('../src/config/subscriptionPlans');

test('an unstarted account remains writable until management activation', () => {
    assert.deepEqual(computeAccess(null, 0), {
        access: 'not_started',
        canWrite: true,
        lockReason: null,
        daysRemaining: null
    });
});

test('an active trial has full write access and a countdown', () => {
    const now = new Date('2026-07-01T00:00:00.000Z');
    const result = computeAccess({
        status: 'trialing',
        trialEndsAt: '2026-07-08T00:00:00.000Z'
    }, 4, now);
    assert.equal(result.access, 'trialing');
    assert.equal(result.canWrite, true);
    assert.equal(result.daysRemaining, 7);
});

test('an authorized plan preserves the remaining free-trial window', () => {
    const result = computeAccess({
        status: 'authenticated',
        planKey: 'basic',
        trialEndsAt: '2026-07-08T00:00:00.000Z'
    }, 1, new Date('2026-07-01T00:00:00.000Z'));
    assert.equal(result.access, 'trialing');
    assert.equal(result.canWrite, true);
    assert.equal(result.daysRemaining, 7);
});

test('even an active paid plan does not apply before the free trial ends', () => {
    const result = computeAccess({
        status: 'active',
        planKey: 'gold',
        trialEndsAt: '2026-07-08T00:00:00.000Z'
    }, 1, new Date('2026-07-01T00:00:00.000Z'));
    assert.equal(result.access, 'trialing');
    assert.equal(getEffectivePropertyLimit(result.access, 'gold'), 1);
});

test('the free trial permits only one managed property', () => {
    assert.equal(getEffectivePropertyLimit('trialing', null), 1);
    assert.equal(getEffectivePropertyLimit('trialing', 'platinum'), 1);
});

test('an expired trial becomes read-only without hiding data', () => {
    const result = computeAccess({
        status: 'trialing',
        trialEndsAt: '2026-06-30T00:00:00.000Z'
    }, 1, new Date('2026-07-01T00:00:00.000Z'));
    assert.equal(result.access, 'locked');
    assert.equal(result.canWrite, false);
    assert.equal(result.lockReason, 'trial_expired');
});

test('an active owner over the selected property limit becomes read-only', () => {
    const result = computeAccess({ status: 'active', planKey: 'silver' }, 3);
    assert.equal(result.access, 'locked');
    assert.equal(result.canWrite, false);
    assert.equal(result.lockReason, 'property_limit');
});

test('platinum accepts up to ten managed properties', () => {
    const result = computeAccess({ status: 'active', planKey: 'platinum' }, 10);
    assert.equal(result.access, 'active');
    assert.equal(result.canWrite, true);
});

test('platinum becomes read-only above ten managed properties', () => {
    const result = computeAccess({ status: 'active', planKey: 'platinum' }, 11);
    assert.equal(result.access, 'locked');
    assert.equal(result.canWrite, false);
    assert.equal(result.lockReason, 'property_limit');
});

test('public plans expose annual-only launch pricing', () => {
    const plans = getPublicPlans();
    assert.deepEqual(plans.map(plan => ({ key: plan.key, amount: plan.amount, interval: plan.interval, limit: plan.propertyLimit })), [
        { key: 'basic', amount: 299900, interval: 'yearly', limit: 1 },
        { key: 'silver', amount: 499900, interval: 'yearly', limit: 2 },
        { key: 'gold', amount: 799900, interval: 'yearly', limit: 5 },
        { key: 'platinum', amount: 1199900, interval: 'yearly', limit: 10 }
    ]);
});
