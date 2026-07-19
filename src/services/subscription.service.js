const AWS = require('aws-sdk');
const crypto = require('crypto');
const { getPlan, getPlanByRazorpayId, getPublicPlans } = require('../config/subscriptionPlans');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const SUBSCRIPTION_TABLE = process.env.SUBSCRIPTION_TABLE;
const WEBHOOK_EVENT_TABLE = process.env.WEBHOOK_EVENT_TABLE;
const PROPERTY_TABLE = process.env.PROPERTY_TABLE;
const TRIAL_DAYS = Number(process.env.SUBSCRIPTION_TRIAL_DAYS || 30);
const TRIAL_PROPERTY_LIMIT = Number(process.env.SUBSCRIPTION_TRIAL_PROPERTY_LIMIT || 1);
const ACTIVE_RAZORPAY_STATUSES = new Set(['active', 'authenticated']);

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
const nowEpoch = () => Math.floor(Date.now() / 1000);

const addDays = (date, days) => {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
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
    // A paid plan can be authorized during the trial, but it must not change
    // trial access or limits until the common trial end time.
    const trialActive = hasActiveTrial(subscription, now);
    const daysRemaining = trialActive
        ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86400000))
        : 0;

    if (trialActive) {
        return { access: 'trialing', canWrite: true, lockReason: null, daysRemaining };
    }

    if (ACTIVE_RAZORPAY_STATUSES.has(subscription.status)) {
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
        getSubscription(ownerId),
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
        paidPlanScheduled: Boolean(access.access === 'trialing' && plan && ACTIVE_RAZORPAY_STATUSES.has(subscription?.status)),
        propertyLimit,
        managedPropertyCount,
        trialStartedAt: subscription?.trialStartedAt || null,
        trialEndsAt: subscription?.trialEndsAt || null,
        currentPeriodStart: subscription?.currentPeriodStart || null,
        currentPeriodEnd: subscription?.currentPeriodEnd || null,
        cancelAtCycleEnd: Boolean(subscription?.cancelAtCycleEnd),
        pendingPlanKey: subscription?.pendingPlanKey || null,
        razorpaySubscriptionId: subscription?.razorpaySubscriptionId || null,
        plans: getPublicPlans(),
        razorpayKeyId: process.env.RAZORPAY_KEY_ID || null
    };
};

const assertOwnerWriteAccess = async (ownerId, options = {}) => {
    let subscription = await getSubscription(ownerId);
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
            ? 'The free trial supports 1 managed property. You can choose an annual plan now; its property limit and billing begin after the trial ends.'
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

const updateFromRazorpayEntity = async (ownerId, entity, extra = {}) => {
    const plan = getPlanByRazorpayId(entity.plan_id);
    const timestamp = nowIso();
    const updateParts = [
        '#status = :status',
        'razorpaySubscriptionId = :subscriptionId',
        'planKey = :planKey',
        'propertyLimit = :propertyLimit',
        'currentPeriodStart = :currentStart',
        'currentPeriodEnd = :currentEnd',
        'updatedAt = :updatedAt',
        'createdAt = if_not_exists(createdAt, :createdAt)'
    ];
    const expressionValues = {
        ':status': entity.status,
        ':subscriptionId': entity.id,
        ':planKey': plan?.key || extra.planKey || null,
        ':propertyLimit': plan?.propertyLimit ?? null,
        ':currentStart': entity.current_start ? new Date(entity.current_start * 1000).toISOString() : null,
        ':currentEnd': entity.current_end ? new Date(entity.current_end * 1000).toISOString() : null,
        ':updatedAt': timestamp,
        ':createdAt': timestamp
    };

    if (extra.cancelAtCycleEnd !== undefined || entity.status === 'cancelled') {
        updateParts.push('cancelAtCycleEnd = :cancelAtCycleEnd');
        expressionValues[':cancelAtCycleEnd'] = entity.status === 'cancelled'
            ? false
            : Boolean(extra.cancelAtCycleEnd);
    }

    if (extra.eventCreatedAt) {
        updateParts.push('lastRazorpayEventAt = :eventCreatedAt');
        expressionValues[':eventCreatedAt'] = Number(extra.eventCreatedAt);
    }

    const params = {
        TableName: SUBSCRIPTION_TABLE,
        Key: { ownerId },
        UpdateExpression: `SET ${updateParts.join(', ')}`,
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: expressionValues,
        ReturnValues: 'ALL_NEW'
    };
    if (extra.eventCreatedAt) {
        params.ConditionExpression = 'attribute_not_exists(lastRazorpayEventAt) OR lastRazorpayEventAt <= :eventCreatedAt';
    }

    try {
        const result = await dynamodb.update(params).promise();
        return result.Attributes;
    } catch (error) {
        if (error.code === 'ConditionalCheckFailedException' && extra.eventCreatedAt) {
            return getSubscription(ownerId);
        }
        throw error;
    }
};

const createCheckout = async (owner, planKey) => {
    const plan = getPlan(planKey);
    if (!plan) {
        const error = new Error('Invalid subscription plan');
        error.code = 'INVALID_PLAN';
        throw error;
    }
    if (!plan.razorpayPlanId || plan.annualAmount <= 0) {
        const error = new Error(`${plan.name} checkout is not configured yet`);
        error.code = 'PLAN_NOT_CONFIGURED';
        throw error;
    }

    let local = await getSubscription(owner.userId);
    if (!local) local = await startTrial(owner.userId);
    const remotePlan = await razorpayRequest('GET', `/plans/${encodeURIComponent(plan.razorpayPlanId)}`);
    if (
        remotePlan.item?.amount !== plan.annualAmount ||
        remotePlan.item?.currency !== 'INR' ||
        remotePlan.period !== 'yearly' ||
        Number(remotePlan.interval) !== 1
    ) {
        const error = new Error(`${plan.name} plan configuration does not match its Razorpay annual amount`);
        error.code = 'PLAN_CONFIGURATION_MISMATCH';
        throw error;
    }

    if (local.razorpaySubscriptionId && ACTIVE_RAZORPAY_STATUSES.has(local.status)) {
        const currentPlan = getPlan(local.planKey);
        if (currentPlan?.key === plan.key) {
            const error = new Error(`You are already on the ${plan.name} plan`);
            error.code = 'ALREADY_SUBSCRIBED';
            throw error;
        }

        const trialStillActive = hasActiveTrial(local);
        const isUpgrade = !currentPlan || plan.rank > currentPlan.rank;
        const updated = await razorpayRequest('PATCH', `/subscriptions/${encodeURIComponent(local.razorpaySubscriptionId)}`, {
            plan_id: plan.razorpayPlanId,
            // Before paid service starts, changing the selected plan only changes
            // what will begin at trial end; it never expands trial access.
            schedule_change_at: trialStillActive || isUpgrade ? 'now' : 'cycle_end',
            customer_notify: true
        });

        if (trialStillActive || isUpgrade) {
            await updateFromRazorpayEntity(owner.userId, updated, { planKey: plan.key, eventCreatedAt: nowEpoch() });
        } else {
            await dynamodb.update({
                TableName: SUBSCRIPTION_TABLE,
                Key: { ownerId: owner.userId },
                UpdateExpression: 'SET pendingPlanKey = :planKey, updatedAt = :updatedAt',
                ExpressionAttributeValues: { ':planKey': plan.key, ':updatedAt': nowIso() }
            }).promise();
        }

        return {
            mode: trialStillActive ? 'trial_plan_scheduled' : isUpgrade ? 'upgraded' : 'downgrade_scheduled',
            subscription: updated
        };
    }

    const subscriptionPayload = {
        plan_id: plan.razorpayPlanId,
        // Ten yearly billing cycles provide a long-lived renewable subscription
        // without accidentally creating the 120-year schedule used by monthly plans.
        total_count: 10,
        quantity: 1,
        customer_notify: true,
        notes: {
            owner_id: owner.userId,
            plan_key: plan.key,
            source: 'gobanqo_web'
        }
    };
    const trialEndEpoch = local.trialEndsAt ? Math.floor(new Date(local.trialEndsAt).getTime() / 1000) : 0;
    if (trialEndEpoch > nowEpoch() + 60) subscriptionPayload.start_at = trialEndEpoch;

    const created = await razorpayRequest('POST', '/subscriptions', subscriptionPayload);

    await updateFromRazorpayEntity(owner.userId, created, { planKey: plan.key, eventCreatedAt: nowEpoch() });
    return {
        mode: 'checkout',
        subscriptionId: created.id,
        keyId: process.env.RAZORPAY_KEY_ID,
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
    };
};

const safeEqualHex = (expected, received) => {
    if (!expected || !received || expected.length !== received.length) return false;
    if (!/^[a-f0-9]+$/i.test(expected) || !/^[a-f0-9]+$/i.test(received)) return false;
    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(received, 'hex');
    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

const verifyCheckout = async (ownerId, payload) => {
    const local = await getSubscription(ownerId);
    if (!local?.razorpaySubscriptionId) throw new Error('No pending subscription found');
    if (payload.razorpay_subscription_id !== local.razorpaySubscriptionId) {
        throw new Error('Subscription does not match this account');
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) throw new Error('Razorpay is not configured');
    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${payload.razorpay_payment_id}|${local.razorpaySubscriptionId}`)
        .digest('hex');
    if (!safeEqualHex(expected, payload.razorpay_signature)) {
        const error = new Error('Invalid Razorpay payment signature');
        error.code = 'INVALID_SIGNATURE';
        throw error;
    }

    const entity = await razorpayRequest('GET', `/subscriptions/${encodeURIComponent(local.razorpaySubscriptionId)}`);
    await updateFromRazorpayEntity(ownerId, entity, { eventCreatedAt: nowEpoch() });
    return getStatus(ownerId);
};

const cancelSubscription = async (ownerId) => {
    const local = await getSubscription(ownerId);
    if (!local?.razorpaySubscriptionId || !ACTIVE_RAZORPAY_STATUSES.has(local.status)) {
        const error = new Error('There is no active subscription to cancel');
        error.code = 'NO_ACTIVE_SUBSCRIPTION';
        throw error;
    }
    const entity = await razorpayRequest('POST', `/subscriptions/${encodeURIComponent(local.razorpaySubscriptionId)}/cancel`, {
        cancel_at_cycle_end: true
    });
    await updateFromRazorpayEntity(ownerId, entity, { cancelAtCycleEnd: true, eventCreatedAt: nowEpoch() });
    return getStatus(ownerId);
};

const findOwnerByRazorpaySubscriptionId = async (subscriptionId) => {
    const result = await dynamodb.query({
        TableName: SUBSCRIPTION_TABLE,
        IndexName: 'RazorpaySubscriptionIdIndex',
        KeyConditionExpression: 'razorpaySubscriptionId = :subscriptionId',
        ExpressionAttributeValues: { ':subscriptionId': subscriptionId },
        Limit: 1
    }).promise();
    return result.Items?.[0]?.ownerId || null;
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
    const entity = event.payload?.subscription?.entity;
    if (!entity?.id || !event.event?.startsWith('subscription.')) return { ignored: true };

    const ownerId = entity.notes?.owner_id || await findOwnerByRazorpaySubscriptionId(entity.id);
    if (!ownerId) return { ignored: true, reason: 'owner_not_found' };

    // Webhooks can arrive out of order. Fetch the authoritative current entity
    // instead of trusting the possibly stale event payload.
    const currentEntity = await razorpayRequest('GET', `/subscriptions/${encodeURIComponent(entity.id)}`);
    await updateFromRazorpayEntity(ownerId, currentEntity, { eventCreatedAt: event.created_at });

    if (eventId && WEBHOOK_EVENT_TABLE) {
        try {
            await dynamodb.put({
                TableName: WEBHOOK_EVENT_TABLE,
                Item: {
                    eventId,
                    eventType: event.event,
                    processedAt: nowIso(),
                    expiresAt: Math.floor(Date.now() / 1000) + (90 * 86400)
                },
                ConditionExpression: 'attribute_not_exists(eventId)'
            }).promise();
        } catch (error) {
            if (error.code !== 'ConditionalCheckFailedException') throw error;
            return { duplicate: true };
        }
    }
    return { processed: true, ownerId, status: currentEntity.status };
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
    createCheckout,
    verifyCheckout,
    cancelSubscription,
    processWebhook
};
