const AWS = require('aws-sdk');
const crypto = require('crypto');
const { getPlan, getPublicPlans } = require('../config/subscriptionPlans');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const SUBSCRIPTION_TABLE = process.env.SUBSCRIPTION_TABLE;
const WEBHOOK_EVENT_TABLE = process.env.WEBHOOK_EVENT_TABLE;
const PROPERTY_TABLE = process.env.PROPERTY_TABLE;
const TRIAL_DAYS = Number(process.env.SUBSCRIPTION_TRIAL_DAYS || 30);
const TRIAL_PROPERTY_LIMIT = Number(process.env.SUBSCRIPTION_TRIAL_PROPERTY_LIMIT || 1);

class SubscriptionAccessError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'SubscriptionAccessError';
        this.statusCode = 402;
        this.details = {
            code: 'SUBSCRIPTION_REQUIRED',
            ...details
        };
    }
}

const requireTable = () => {
    if (!SUBSCRIPTION_TABLE) throw new Error('SUBSCRIPTION_TABLE is not configured');
};

const getRazorpayCredentials = () => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
        const error = new Error('Razorpay is not configured');
        error.code = 'RAZORPAY_NOT_CONFIGURED';
        throw error;
    }
    return { keyId, keySecret };
};

const razorpayRequest = async (method, path, body) => {
    const { keyId, keySecret } = getRazorpayCredentials();
    const result = await fetch(`https://api.razorpay.com/v1${path}`, {
        method,
        headers: {
            'Authorization': `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
            'Content-Type': 'application/json'
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000)
    });
    const raw = await result.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = {}; }
    if (!result.ok) {
        const error = new Error(data.error?.description || data.error?.reason || 'Razorpay request failed');
        error.code = 'RAZORPAY_API_ERROR';
        error.statusCode = result.status;
        throw error;
    }
    return data;
};

const nowIso = () => new Date().toISOString();

const addDays = (date, days) => {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
};

const addYears = (date, years = 1) => {
    const result = new Date(date);
    result.setUTCFullYear(result.getUTCFullYear() + years);
    return result;
};

const isValidDate = date => date instanceof Date && !Number.isNaN(date.getTime());

const hasPaidPeriod = (subscription, now = new Date()) => {
    const start = subscription?.currentPeriodStart ? new Date(subscription.currentPeriodStart) : null;
    const end = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
    return Boolean(
        subscription?.status === 'active' &&
        subscription?.planKey &&
        isValidDate(start) &&
        isValidDate(end) &&
        start <= now &&
        end > now
    );
};

const hasFuturePaidPeriod = (subscription, now = new Date()) => {
    const start = subscription?.currentPeriodStart ? new Date(subscription.currentPeriodStart) : null;
    const end = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
    return Boolean(
        subscription?.status === 'active' &&
        subscription?.planKey &&
        isValidDate(start) &&
        isValidDate(end) &&
        start > now &&
        end > start
    );
};

const getSubscription = async (ownerId) => {
    requireTable();
    const result = await dynamodb.get({
        TableName: SUBSCRIPTION_TABLE,
        Key: { ownerId },
        ConsistentRead: true
    }).promise();
    return result.Item || null;
};

const promoteScheduledPaidPeriod = async (ownerId, subscription, now = new Date()) => {
    const scheduledStart = subscription?.scheduledPeriodStart
        ? new Date(subscription.scheduledPeriodStart)
        : null;
    if (!isValidDate(scheduledStart) || scheduledStart > now || !subscription.scheduledPlanKey) {
        return subscription;
    }

    const timestamp = nowIso();
    try {
        const result = await dynamodb.update({
            TableName: SUBSCRIPTION_TABLE,
            Key: { ownerId },
            UpdateExpression: [
                'SET #status = :status, planKey = :planKey, propertyLimit = :propertyLimit,',
                'currentPeriodStart = :periodStart, currentPeriodEnd = :periodEnd,',
                'razorpayOrderId = :orderId, razorpayPaymentId = :paymentId,',
                'amountPaid = :amountPaid, paidAt = :paidAt, updatedAt = :updatedAt',
                'REMOVE scheduledPlanKey, scheduledPropertyLimit, scheduledPeriodStart,',
                'scheduledPeriodEnd, scheduledRazorpayOrderId, scheduledRazorpayPaymentId,',
                'scheduledAmountPaid, scheduledPaidAt'
            ].join(' '),
            ConditionExpression: 'scheduledRazorpayOrderId = :orderId',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':status': 'active',
                ':planKey': subscription.scheduledPlanKey,
                ':propertyLimit': subscription.scheduledPropertyLimit ?? null,
                ':periodStart': subscription.scheduledPeriodStart,
                ':periodEnd': subscription.scheduledPeriodEnd,
                ':orderId': subscription.scheduledRazorpayOrderId,
                ':paymentId': subscription.scheduledRazorpayPaymentId,
                ':amountPaid': subscription.scheduledAmountPaid,
                ':paidAt': subscription.scheduledPaidAt,
                ':updatedAt': timestamp
            },
            ReturnValues: 'ALL_NEW'
        }).promise();
        return result.Attributes;
    } catch (error) {
        if (error.code === 'ConditionalCheckFailedException') return getSubscription(ownerId);
        throw error;
    }
};

const getEffectiveSubscription = async (ownerId, now = new Date()) => {
    const subscription = await getSubscription(ownerId);
    return promoteScheduledPaidPeriod(ownerId, subscription, now);
};

const startTrial = async (ownerId) => {
    requireTable();
    const startedAt = new Date();
    const subscription = {
        ownerId,
        status: 'trialing',
        planKey: null,
        propertyLimit: TRIAL_PROPERTY_LIMIT,
        trialStartedAt: startedAt.toISOString(),
        trialEndsAt: addDays(startedAt, TRIAL_DAYS).toISOString(),
        trialConsumed: true,
        createdAt: startedAt.toISOString(),
        updatedAt: startedAt.toISOString()
    };

    try {
        await dynamodb.put({
            TableName: SUBSCRIPTION_TABLE,
            Item: subscription,
            ConditionExpression: 'attribute_not_exists(ownerId)'
        }).promise();
        return subscription;
    } catch (error) {
        if (error.code !== 'ConditionalCheckFailedException') throw error;
        return getSubscription(ownerId);
    }
};

const countManagedProperties = async (ownerId) => {
    let lastEvaluatedKey;
    let count = 0;
    do {
        const result = await dynamodb.query({
            TableName: PROPERTY_TABLE,
            IndexName: 'OwnerIdIndex',
            KeyConditionExpression: 'ownerIdIndex = :ownerId',
            FilterExpression: '#status <> :deleted AND (attribute_not_exists(managementEnabled) OR managementEnabled = :enabled)',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':ownerId': ownerId,
                ':deleted': 'deleted',
                ':enabled': true
            },
            ProjectionExpression: 'propertyId',
            ExclusiveStartKey: lastEvaluatedKey
        }).promise();
        count += result.Count || 0;
        lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    return count;
};

const hasActiveTrial = (subscription, now = new Date()) => {
    const trialEndsAt = subscription?.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
    return Boolean(trialEndsAt && trialEndsAt > now);
};

const computeAccess = (subscription, managedPropertyCount = 0, now = new Date()) => {
    if (!subscription) {
        return {
            access: 'not_started',
            canWrite: true,
            lockReason: null,
            daysRemaining: null
        };
    }

    const trialEndsAt = subscription.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
    // A prepaid plan can be purchased during the trial, but it must not change
    // trial access or limits until the common trial end time.
    const trialActive = hasActiveTrial(subscription, now);
    const daysRemaining = trialActive
        ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86400000))
        : 0;

    if (trialActive) {
        return { access: 'trialing', canWrite: true, lockReason: null, daysRemaining };
    }

    if (hasPaidPeriod(subscription, now)) {
        const plan = getPlan(subscription.planKey);
        if (plan && plan.propertyLimit !== null && managedPropertyCount > plan.propertyLimit) {
            return {
                access: 'locked',
                canWrite: false,
                lockReason: 'property_limit',
                daysRemaining: null
            };
        }
        return { access: 'active', canWrite: true, lockReason: null, daysRemaining: null };
    }

    return {
        access: 'locked',
        canWrite: false,
        lockReason: subscription.status === 'trialing' ? 'trial_expired' : 'subscription_inactive',
        daysRemaining: 0
    };
};

const getEffectivePropertyLimit = (access, planKey) => {
    if (access === 'trialing') return TRIAL_PROPERTY_LIMIT;
    if (access !== 'active') return null;
    return getPlan(planKey)?.propertyLimit ?? null;
};

const getStatus = async (ownerId) => {
    const [subscription, managedPropertyCount] = await Promise.all([
        getEffectiveSubscription(ownerId),
        countManagedProperties(ownerId)
    ]);
    const access = computeAccess(subscription, managedPropertyCount);
    const plan = subscription?.planKey ? getPlan(subscription.planKey) : null;
    const propertyLimit = getEffectivePropertyLimit(access.access, subscription?.planKey);

    return {
        ...access,
        status: subscription?.status || 'not_started',
        planKey: subscription?.planKey || null,
        planName: plan?.name || null,
        paidPlanScheduled: Boolean(
            (access.access === 'trialing' && plan && hasFuturePaidPeriod(subscription)) ||
            subscription?.scheduledPlanKey
        ),
        propertyLimit,
        managedPropertyCount,
        trialStartedAt: subscription?.trialStartedAt || null,
        trialEndsAt: subscription?.trialEndsAt || null,
        currentPeriodStart: subscription?.currentPeriodStart || null,
        currentPeriodEnd: subscription?.currentPeriodEnd || null,
        autoRenew: false,
        billingModel: 'prepaid',
        pendingPlanKey: subscription?.scheduledPlanKey || null,
        razorpayOrderId: subscription?.razorpayOrderId || null,
        plans: getPublicPlans(),
        razorpayKeyId: process.env.RAZORPAY_KEY_ID || null
    };
};

const assertOwnerWriteAccess = async (ownerId, options = {}) => {
    let subscription = await getEffectiveSubscription(ownerId);
    if (!subscription && options.startTrial !== false) {
        subscription = await startTrial(ownerId);
    }

    const managedPropertyCount = await countManagedProperties(ownerId);
    const access = computeAccess(subscription, managedPropertyCount);
    if (!access.canWrite && !options.allowWhenLocked) {
        throw new SubscriptionAccessError(
            access.lockReason === 'trial_expired'
                ? 'Your free trial has ended. Choose a plan to continue making changes.'
                : access.lockReason === 'property_limit'
                    ? 'Your current plan does not cover all managed properties.'
                    : 'Your subscription is inactive. Choose a plan to continue making changes.',
            { ...access, managedPropertyCount, planKey: subscription?.planKey || null }
        );
    }
    return { subscription, managedPropertyCount, ...access };
};

const assertCanAddManagedProperty = async (ownerId) => {
    const result = await assertOwnerWriteAccess(ownerId);
    const plan = getPlan(result.subscription?.planKey);
    const effectiveLimit = getEffectivePropertyLimit(result.access, result.subscription?.planKey);
    if (effectiveLimit !== null && result.managedPropertyCount >= effectiveLimit) {
        const isTrialLimit = result.access === 'trialing';
        const limitMessage = isTrialLimit
            ? 'The free trial supports 1 managed property. You can prepay for an annual plan now; its property limit begins after the trial ends.'
            : plan?.key === 'platinum'
                ? 'The Platinum plan supports up to 10 properties. Contact sales for an Enterprise plan before adding another managed property.'
                : `The ${plan.name} plan supports ${effectiveLimit} ${effectiveLimit === 1 ? 'property' : 'properties'}. Upgrade before adding another managed property.`;
        throw new SubscriptionAccessError(
            limitMessage,
            {
                code: isTrialLimit ? 'TRIAL_PROPERTY_LIMIT_REACHED' : 'PROPERTY_LIMIT_REACHED',
                lockReason: 'property_limit',
                planKey: plan?.key || null,
                propertyLimit: effectiveLimit,
                managedPropertyCount: result.managedPropertyCount
            }
        );
    }
    return result;
};

const safeEqualHex = (expected, received) => {
    if (!expected || !received || expected.length !== received.length) return false;
    if (!/^[a-f0-9]+$/i.test(expected) || !/^[a-f0-9]+$/i.test(received)) return false;
    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(received, 'hex');
    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

const getPrepaidPeriod = (subscription, selectedPlan, now = new Date()) => {
    const trialEnd = subscription?.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
    if (isValidDate(trialEnd) && trialEnd > now) {
        return { target: 'current', start: trialEnd, end: addYears(trialEnd) };
    }

    if (hasPaidPeriod(subscription, now)) {
        const currentEnd = new Date(subscription.currentPeriodEnd);
        const currentPlan = getPlan(subscription.planKey);
        if (currentPlan && selectedPlan.rank > currentPlan.rank) {
            // A full-price prepaid upgrade takes effect immediately and adds a
            // complete paid year without discarding the time already purchased.
            return { target: 'current', start: now, end: addYears(currentEnd) };
        }
        return { target: 'scheduled', start: currentEnd, end: addYears(currentEnd) };
    }

    return { target: 'current', start: now, end: addYears(now) };
};

const isOrderAlreadyApplied = (subscription, orderId) => Boolean(
    subscription?.razorpayOrderId === orderId ||
    subscription?.scheduledRazorpayOrderId === orderId
);

const findOrderPayment = async (orderId, requestedPaymentId) => {
    if (requestedPaymentId) {
        return razorpayRequest('GET', `/payments/${encodeURIComponent(requestedPaymentId)}`);
    }
    const payments = await razorpayRequest('GET', `/orders/${encodeURIComponent(orderId)}/payments`);
    return payments.items?.find(payment => payment.status === 'captured') ||
        payments.items?.find(payment => payment.status === 'authorized') || null;
};

const applyPrepaidPayment = async (ownerId, subscription, plan, order, payment, now = new Date()) => {
    const period = getPrepaidPeriod(subscription, plan, now);
    const timestamp = now.toISOString();
    const pendingFields = [
        'pendingRazorpayOrderId',
        'pendingCheckoutPlanKey',
        'pendingCheckoutAmount',
        'pendingOrderCreatedAt'
    ];
    const commonValues = {
        ':planKey': plan.key,
        ':propertyLimit': plan.propertyLimit,
        ':periodStart': period.start.toISOString(),
        ':periodEnd': period.end.toISOString(),
        ':orderId': order.id,
        ':paymentId': payment.id,
        ':amountPaid': payment.amount,
        ':paidAt': timestamp,
        ':updatedAt': timestamp,
        ':createdAt': timestamp
    };

    const params = period.target === 'scheduled'
        ? {
            UpdateExpression: [
                'SET scheduledPlanKey = :planKey, scheduledPropertyLimit = :propertyLimit,',
                'scheduledPeriodStart = :periodStart, scheduledPeriodEnd = :periodEnd,',
                'scheduledRazorpayOrderId = :orderId, scheduledRazorpayPaymentId = :paymentId,',
                'scheduledAmountPaid = :amountPaid, scheduledPaidAt = :paidAt, updatedAt = :updatedAt,',
                'createdAt = if_not_exists(createdAt, :createdAt)',
                `REMOVE ${pendingFields.join(', ')}`
            ].join(' '),
            ExpressionAttributeValues: commonValues
        }
        : {
            UpdateExpression: [
                'SET #status = :status, planKey = :planKey, propertyLimit = :propertyLimit,',
                'currentPeriodStart = :periodStart, currentPeriodEnd = :periodEnd,',
                'razorpayOrderId = :orderId, razorpayPaymentId = :paymentId,',
                'amountPaid = :amountPaid, paidAt = :paidAt, updatedAt = :updatedAt,',
                'createdAt = if_not_exists(createdAt, :createdAt)',
                `REMOVE ${pendingFields.join(', ')}`
            ].join(' '),
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ...commonValues, ':status': 'active' }
        };

    try {
        const result = await dynamodb.update({
            TableName: SUBSCRIPTION_TABLE,
            Key: { ownerId },
            ...params,
            ConditionExpression: 'pendingRazorpayOrderId = :orderId',
            ReturnValues: 'ALL_NEW'
        }).promise();
        return result.Attributes;
    } catch (error) {
        if (error.code !== 'ConditionalCheckFailedException') throw error;
        const current = await getSubscription(ownerId);
        if (isOrderAlreadyApplied(current, order.id)) return current;
        throw error;
    }
};

const finalizePrepaidOrder = async (ownerId, orderId, paymentId) => {
    let local = await getEffectiveSubscription(ownerId);
    if (isOrderAlreadyApplied(local, orderId)) return getStatus(ownerId);
    if (!local?.pendingRazorpayOrderId || local.pendingRazorpayOrderId !== orderId) {
        const error = new Error('Payment order does not match this account');
        error.code = 'ORDER_MISMATCH';
        throw error;
    }

    const plan = getPlan(local.pendingCheckoutPlanKey);
    if (!plan || local.pendingCheckoutAmount !== plan.annualAmount) {
        const error = new Error('Pending prepaid plan configuration is invalid');
        error.code = 'PLAN_CONFIGURATION_MISMATCH';
        throw error;
    }

    let [order, payment] = await Promise.all([
        razorpayRequest('GET', `/orders/${encodeURIComponent(orderId)}`),
        findOrderPayment(orderId, paymentId)
    ]);
    if (
        order.amount !== plan.annualAmount ||
        order.currency !== 'INR' ||
        order.notes?.owner_id !== ownerId ||
        order.notes?.plan_key !== plan.key ||
        !payment ||
        payment.order_id !== orderId ||
        payment.amount !== plan.annualAmount ||
        payment.currency !== 'INR'
    ) {
        const error = new Error('The full prepaid annual amount has not been captured');
        error.code = 'PAYMENT_NOT_CAPTURED';
        throw error;
    }

    // Accounts configured for manual capture return an authorized payment.
    // Capture the exact Order amount before granting any entitlement.
    if (payment.status === 'authorized') {
        payment = await razorpayRequest(
            'POST',
            `/payments/${encodeURIComponent(payment.id)}/capture`,
            { amount: plan.annualAmount, currency: 'INR' }
        );
        order = await razorpayRequest('GET', `/orders/${encodeURIComponent(orderId)}`);
    }

    if (
        payment.status !== 'captured' ||
        order.status !== 'paid' ||
        order.amount_paid !== plan.annualAmount
    ) {
        const error = new Error('The full prepaid annual amount has not been captured');
        error.code = 'PAYMENT_NOT_CAPTURED';
        throw error;
    }

    await applyPrepaidPayment(ownerId, local, plan, order, payment);
    return getStatus(ownerId);
};

const checkoutResponse = (order, owner, plan) => ({
    mode: 'checkout',
    orderId: order.id,
    keyId: process.env.RAZORPAY_KEY_ID,
    amount: plan.annualAmount,
    currency: 'INR',
    plan: {
        key: plan.key,
        name: plan.name,
        amount: plan.annualAmount,
        currency: 'INR',
        interval: 'yearly'
    },
    prefill: {
        name: owner.name || '',
        email: owner.email || '',
        contact: owner.phoneNumber || ''
    }
});

const retireLegacyRecurringSubscription = async (ownerId, subscription) => {
    const legacySubscriptionId = subscription?.razorpaySubscriptionId;
    if (!legacySubscriptionId) return subscription;

    const remote = await razorpayRequest(
        'GET',
        `/subscriptions/${encodeURIComponent(legacySubscriptionId)}`
    );
    if (!['cancelled', 'completed', 'expired'].includes(remote.status)) {
        await razorpayRequest(
            'POST',
            `/subscriptions/${encodeURIComponent(legacySubscriptionId)}/cancel`,
            { cancel_at_cycle_end: 0 }
        );
    }

    const timestamp = nowIso();
    try {
        const result = await dynamodb.update({
            TableName: SUBSCRIPTION_TABLE,
            Key: { ownerId },
            UpdateExpression: [
                'SET legacyRazorpaySubscriptionId = :legacyId,',
                'legacyRecurringCancelledAt = :cancelledAt, updatedAt = :updatedAt',
                'REMOVE razorpaySubscriptionId, razorpayCustomerId, cancelAtCycleEnd'
            ].join(' '),
            ConditionExpression: 'razorpaySubscriptionId = :legacyId',
            ExpressionAttributeValues: {
                ':legacyId': legacySubscriptionId,
                ':cancelledAt': timestamp,
                ':updatedAt': timestamp
            },
            ReturnValues: 'ALL_NEW'
        }).promise();
        return result.Attributes;
    } catch (error) {
        if (error.code === 'ConditionalCheckFailedException') return getSubscription(ownerId);
        throw error;
    }
};

const buildPrepaidOrderPayload = (ownerId, plan, createdAt = Date.now()) => {
    const receiptHash = crypto.createHash('sha256').update(ownerId).digest('hex').slice(0, 12);
    return {
        amount: plan.annualAmount,
        currency: 'INR',
        receipt: `gbq_${receiptHash}_${createdAt.toString(36)}`,
        notes: {
            owner_id: ownerId,
            plan_key: plan.key,
            billing_model: 'prepaid_annual',
            source: 'gobanqo_web'
        }
    };
};

const createCheckout = async (owner, planKey) => {
    getRazorpayCredentials();
    const plan = getPlan(planKey);
    if (!plan) {
        const error = new Error('Invalid subscription plan');
        error.code = 'INVALID_PLAN';
        throw error;
    }
    if (!Number.isFinite(plan.annualAmount) || plan.annualAmount <= 0) {
        const error = new Error(`${plan.name} checkout is not configured yet`);
        error.code = 'PLAN_NOT_CONFIGURED';
        throw error;
    }

    let local = await getEffectiveSubscription(owner.userId);
    if (!local) local = await startTrial(owner.userId);
    // Earlier builds created Razorpay recurring mandates. Retire any one still
    // linked to this owner before starting the new one-time prepaid checkout so
    // an old authorization can never cause a later automatic charge.
    local = await retireLegacyRecurringSubscription(owner.userId, local);
    if (hasFuturePaidPeriod(local)) {
        const error = new Error('You have already prepaid for a plan that starts after your trial');
        error.code = 'PREPAID_PLAN_ALREADY_PURCHASED';
        throw error;
    }
    if (local.scheduledPlanKey) {
        const error = new Error('Your next prepaid annual plan is already paid');
        error.code = 'PREPAID_PLAN_ALREADY_PURCHASED';
        throw error;
    }

    if (local.pendingRazorpayOrderId) {
        if (local.pendingCheckoutPlanKey !== plan.key) {
            const error = new Error(`Complete the pending ${getPlan(local.pendingCheckoutPlanKey)?.name || ''} payment before choosing another plan`);
            error.code = 'PAYMENT_ALREADY_PENDING';
            throw error;
        }
        const existingOrder = await razorpayRequest('GET', `/orders/${encodeURIComponent(local.pendingRazorpayOrderId)}`);
        if (existingOrder.status !== 'paid') return checkoutResponse(existingOrder, owner, plan);
        await finalizePrepaidOrder(owner.userId, existingOrder.id);
        return { mode: 'paid' };
    }

    const order = await razorpayRequest('POST', '/orders', buildPrepaidOrderPayload(owner.userId, plan));

    await dynamodb.update({
        TableName: SUBSCRIPTION_TABLE,
        Key: { ownerId: owner.userId },
        UpdateExpression: [
            'SET pendingRazorpayOrderId = :orderId, pendingCheckoutPlanKey = :planKey,',
            'pendingCheckoutAmount = :amount, pendingOrderCreatedAt = :createdAt, updatedAt = :updatedAt'
        ].join(' '),
        ConditionExpression: 'attribute_not_exists(pendingRazorpayOrderId)',
        ExpressionAttributeValues: {
            ':orderId': order.id,
            ':planKey': plan.key,
            ':amount': plan.annualAmount,
            ':createdAt': nowIso(),
            ':updatedAt': nowIso()
        }
    }).promise();

    return checkoutResponse(order, owner, plan);
};

const verifyCheckout = async (ownerId, payload) => {
    const { keySecret } = getRazorpayCredentials();
    const local = await getSubscription(ownerId);
    if (!local?.pendingRazorpayOrderId || payload.razorpay_order_id !== local.pendingRazorpayOrderId) {
        const error = new Error('Payment order does not match this account');
        error.code = 'ORDER_MISMATCH';
        throw error;
    }

    const expected = crypto
        .createHmac('sha256', keySecret)
        .update(`${local.pendingRazorpayOrderId}|${payload.razorpay_payment_id}`)
        .digest('hex');
    if (!safeEqualHex(expected, payload.razorpay_signature)) {
        const error = new Error('Invalid Razorpay payment signature');
        error.code = 'INVALID_SIGNATURE';
        throw error;
    }

    return finalizePrepaidOrder(ownerId, local.pendingRazorpayOrderId, payload.razorpay_payment_id);
};

const recordWebhookEvent = async (eventId, eventType) => {
    if (!eventId || !WEBHOOK_EVENT_TABLE) return;
    try {
        await dynamodb.put({
            TableName: WEBHOOK_EVENT_TABLE,
            Item: {
                eventId,
                eventType,
                processedAt: nowIso(),
                expiresAt: Math.floor(Date.now() / 1000) + (90 * 86400)
            },
            ConditionExpression: 'attribute_not_exists(eventId)'
        }).promise();
    } catch (error) {
        if (error.code !== 'ConditionalCheckFailedException') throw error;
    }
};

const processWebhook = async (rawBody, signature, eventId) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured');
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!safeEqualHex(expected, signature)) {
        const error = new Error('Invalid webhook signature');
        error.code = 'INVALID_SIGNATURE';
        throw error;
    }

    const event = JSON.parse(rawBody);
    if (!['order.paid', 'payment.captured'].includes(event.event)) return { ignored: true };

    const payment = event.payload?.payment?.entity;
    let order = event.payload?.order?.entity;
    const orderId = order?.id || payment?.order_id;
    if (!orderId) return { ignored: true, reason: 'order_not_found' };
    if (!order) order = await razorpayRequest('GET', `/orders/${encodeURIComponent(orderId)}`);

    const ownerId = order.notes?.owner_id || payment?.notes?.owner_id;
    if (!ownerId) return { ignored: true, reason: 'owner_not_found' };

    const status = await finalizePrepaidOrder(ownerId, orderId, payment?.id);
    await recordWebhookEvent(eventId, event.event);
    return { processed: true, ownerId, status: status.status };
};

module.exports = {
    SubscriptionAccessError,
    computeAccess,
    getEffectivePropertyLimit,
    getSubscription,
    getStatus,
    startTrial,
    assertOwnerWriteAccess,
    assertCanAddManagedProperty,
    getPrepaidPeriod,
    buildPrepaidOrderPayload,
    createCheckout,
    verifyCheckout,
    processWebhook
};
