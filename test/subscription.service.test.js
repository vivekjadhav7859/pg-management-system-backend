const test = require('node:test');
const assert = require('node:assert/strict');
const {
    computeAccess,
    getEffectivePropertyLimit,
    getPrepaidPeriod,
    buildPrepaidOrderPayload
} = require('../src/services/subscription.service');
const { getPlan, getPublicPlans } = require('../src/config/subscriptionPlans');

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

test('a prepaid plan preserves the remaining free-trial window', () => {
    const result = computeAccess({
        status: 'active',
        planKey: 'basic',
        trialEndsAt: '2026-07-08T00:00:00.000Z',
        currentPeriodStart: '2026-07-08T00:00:00.000Z',
        currentPeriodEnd: '2027-07-08T00:00:00.000Z'
    }, 1, new Date('2026-07-01T00:00:00.000Z'));
    assert.equal(result.access, 'trialing');
    assert.equal(result.canWrite, true);
    assert.equal(result.daysRemaining, 7);
});

test('even an active paid plan does not apply before the free trial ends', () => {
    const result = computeAccess({
        status: 'active',
        planKey: 'gold',
        trialEndsAt: '2026-07-08T00:00:00.000Z',
        currentPeriodStart: '2026-07-08T00:00:00.000Z',
        currentPeriodEnd: '2027-07-08T00:00:00.000Z'
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
    const now = new Date('2026-07-01T00:00:00.000Z');
    const result = computeAccess({
        status: 'active',
        planKey: 'silver',
        currentPeriodStart: '2026-06-01T00:00:00.000Z',
        currentPeriodEnd: '2027-06-01T00:00:00.000Z'
    }, 3, now);
    assert.equal(result.access, 'locked');
    assert.equal(result.canWrite, false);
    assert.equal(result.lockReason, 'property_limit');
});

test('platinum accepts up to ten managed properties', () => {
    const now = new Date('2026-07-01T00:00:00.000Z');
    const result = computeAccess({
        status: 'active',
        planKey: 'platinum',
        currentPeriodStart: '2026-06-01T00:00:00.000Z',
        currentPeriodEnd: '2027-06-01T00:00:00.000Z'
    }, 10, now);
    assert.equal(result.access, 'active');
    assert.equal(result.canWrite, true);
});

test('platinum becomes read-only above ten managed properties', () => {
    const now = new Date('2026-07-01T00:00:00.000Z');
    const result = computeAccess({
        status: 'active',
        planKey: 'platinum',
        currentPeriodStart: '2026-06-01T00:00:00.000Z',
        currentPeriodEnd: '2027-06-01T00:00:00.000Z'
    }, 11, now);
    assert.equal(result.access, 'locked');
    assert.equal(result.canWrite, false);
    assert.equal(result.lockReason, 'property_limit');
});

test('a plan bought during trial starts after the trial and lasts one year', () => {
    const period = getPrepaidPeriod({
        status: 'trialing',
        trialEndsAt: '2026-08-01T00:00:00.000Z'
    }, getPlan('basic'), new Date('2026-07-01T00:00:00.000Z'));
    assert.equal(period.target, 'current');
    assert.equal(period.start.toISOString(), '2026-08-01T00:00:00.000Z');
    assert.equal(period.end.toISOString(), '2027-08-01T00:00:00.000Z');
});

test('Razorpay order requests the entire prepaid annual plan amount', () => {
    const order = buildPrepaidOrderPayload('owner-123', getPlan('silver'), 1782864000000);
    assert.equal(order.amount, 499900);
    assert.equal(order.currency, 'INR');
    assert.equal(order.notes.billing_model, 'prepaid_annual');
    assert.equal(order.notes.plan_key, 'silver');
    assert.equal('subscription_id' in order, false);
});

test('a manual renewal starts after the already-paid period', () => {
    const period = getPrepaidPeriod({
        status: 'active',
        planKey: 'basic',
        currentPeriodStart: '2026-06-01T00:00:00.000Z',
        currentPeriodEnd: '2027-06-01T00:00:00.000Z'
    }, getPlan('basic'), new Date('2026-07-01T00:00:00.000Z'));
    assert.equal(period.target, 'scheduled');
    assert.equal(period.start.toISOString(), '2027-06-01T00:00:00.000Z');
    assert.equal(period.end.toISOString(), '2028-06-01T00:00:00.000Z');
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
