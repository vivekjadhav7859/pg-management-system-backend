#!/usr/bin/env node

const AWS = require('aws-sdk');

const SERVICE_NAME = 'pg-management-backend';

const usage = () => {
    console.log(`Grant a one-time free trial to existing active owners with managed properties.

Dry-run (default):
  node scripts/grant-existing-owner-trials.js --stage dev

Apply:
  node scripts/grant-existing-owner-trials.js --stage dev --apply

Production requires an extra acknowledgement:
  node scripts/grant-existing-owner-trials.js --stage prod --apply --confirm-prod

Options:
  --stage <name>             Required deployment stage (dev, qa, prod, etc.)
  --region <region>          AWS region (default: ap-south-1)
  --profile <profile>        Optional shared AWS credentials profile
  --trial-days <days>        Trial duration (default: 30)
  --starts-at <ISO date>     Common trial start time (default: now)
  --created-before <ISO>     Only owners created on/before this time (default: starts-at)
  --include-discovery-only   Include active owners with no managed properties
  --verbose                  Print eligible owner IDs
  --apply                    Write trials; without this flag no data is changed
  --confirm-prod             Required together with --stage prod --apply
  --help                     Show this help
`);
};

const readValue = (argv, index, option) => {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
    return value;
};

const parseArgs = (argv) => {
    const options = {
        stage: '',
        region: 'ap-south-1',
        profile: '',
        trialDays: 30,
        startsAt: new Date(),
        createdBefore: null,
        includeDiscoveryOnly: false,
        verbose: false,
        apply: false,
        confirmProd: false,
        help: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const option = argv[index];
        if (option === '--stage') options.stage = readValue(argv, index++, option);
        else if (option === '--region') options.region = readValue(argv, index++, option);
        else if (option === '--profile') options.profile = readValue(argv, index++, option);
        else if (option === '--trial-days') options.trialDays = Number(readValue(argv, index++, option));
        else if (option === '--starts-at') options.startsAt = new Date(readValue(argv, index++, option));
        else if (option === '--created-before') options.createdBefore = new Date(readValue(argv, index++, option));
        else if (option === '--include-discovery-only') options.includeDiscoveryOnly = true;
        else if (option === '--verbose') options.verbose = true;
        else if (option === '--apply') options.apply = true;
        else if (option === '--confirm-prod') options.confirmProd = true;
        else if (option === '--help' || option === '-h') options.help = true;
        else throw new Error(`Unknown option: ${option}`);
    }

    if (options.help) return options;
    if (!options.stage || !/^[a-zA-Z0-9-]+$/.test(options.stage)) {
        throw new Error('--stage is required and may contain only letters, numbers, and hyphens');
    }
    if (!Number.isInteger(options.trialDays) || options.trialDays < 1 || options.trialDays > 365) {
        throw new Error('--trial-days must be an integer between 1 and 365');
    }
    if (Number.isNaN(options.startsAt.getTime())) throw new Error('--starts-at must be a valid ISO date');
    if (options.createdBefore && Number.isNaN(options.createdBefore.getTime())) {
        throw new Error('--created-before must be a valid ISO date');
    }
    options.createdBefore ||= options.startsAt;
    if (options.stage === 'prod' && options.apply && !options.confirmProd) {
        throw new Error('Production writes require --confirm-prod');
    }
    return options;
};

const addDays = (date, days) => {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
};

const collectPages = async (requestPage) => {
    const items = [];
    let exclusiveStartKey;
    do {
        const page = await requestPage(exclusiveStartKey);
        items.push(...(page.Items || []));
        exclusiveStartKey = page.LastEvaluatedKey;
    } while (exclusiveStartKey);
    return items;
};

const loadExistingSubscriptionIds = async (documentClient, tableName, ownerIds) => {
    const existing = new Set();
    for (let offset = 0; offset < ownerIds.length; offset += 100) {
        let requestItems = {
            [tableName]: {
                Keys: ownerIds.slice(offset, offset + 100).map(ownerId => ({ ownerId })),
                ProjectionExpression: 'ownerId'
            }
        };
        do {
            const result = await documentClient.batchGet({ RequestItems: requestItems }).promise();
            for (const item of result.Responses?.[tableName] || []) existing.add(item.ownerId);
            requestItems = result.UnprocessedKeys || {};
        } while (requestItems[tableName]?.Keys?.length);
    }
    return existing;
};

const run = async () => {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        usage();
        return;
    }

    if (options.profile) {
        AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile: options.profile });
    }
    AWS.config.update({ region: options.region });
    const documentClient = new AWS.DynamoDB.DocumentClient();
    const userTable = `${SERVICE_NAME}-users-${options.stage}`;
    const propertyTable = `${SERVICE_NAME}-properties-${options.stage}`;
    const subscriptionTable = `${SERVICE_NAME}-subscriptions-${options.stage}`;

    const owners = await collectPages(exclusiveStartKey => documentClient.query({
        TableName: userTable,
        IndexName: 'UserTypeIndex',
        KeyConditionExpression: 'userTypeIndex = :owner',
        FilterExpression: '#status = :active',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':owner': 'owner', ':active': 'active' },
        ProjectionExpression: 'userId, createdAt',
        ExclusiveStartKey: exclusiveStartKey
    }).promise());

    const managedProperties = options.includeDiscoveryOnly ? [] : await collectPages(exclusiveStartKey => documentClient.scan({
        TableName: propertyTable,
        FilterExpression: '(attribute_not_exists(#status) OR #status <> :deleted) AND (attribute_not_exists(managementEnabled) OR managementEnabled = :enabled)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':deleted': 'deleted', ':enabled': true },
        ProjectionExpression: 'ownerId, ownerIdIndex',
        ExclusiveStartKey: exclusiveStartKey
    }).promise());

    const managedOwnerIds = new Set(managedProperties.map(property => property.ownerId || property.ownerIdIndex).filter(Boolean));
    const cutoffMs = options.createdBefore.getTime();
    const eligibleOwnerIds = owners
        .filter(owner => !owner.createdAt || new Date(owner.createdAt).getTime() <= cutoffMs)
        .filter(owner => options.includeDiscoveryOnly || managedOwnerIds.has(owner.userId))
        .map(owner => owner.userId);
    const existingSubscriptionIds = await loadExistingSubscriptionIds(documentClient, subscriptionTable, eligibleOwnerIds);
    const ownerIdsToGrant = eligibleOwnerIds.filter(ownerId => !existingSubscriptionIds.has(ownerId));

    const startedAt = options.startsAt.toISOString();
    const endsAt = addDays(options.startsAt, options.trialDays).toISOString();
    console.log(JSON.stringify({
        mode: options.apply ? 'apply' : 'dry-run',
        stage: options.stage,
        region: options.region,
        trialStartedAt: startedAt,
        trialEndsAt: endsAt,
        activeOwnersFound: owners.length,
        managedPropertyOwnersFound: options.includeDiscoveryOnly ? 'not-filtered' : managedOwnerIds.size,
        eligibleExistingOwners: eligibleOwnerIds.length,
        skippedWithSubscription: existingSubscriptionIds.size,
        trialsToGrant: ownerIdsToGrant.length
    }, null, 2));

    if (options.verbose && ownerIdsToGrant.length) {
        console.log(`Eligible owner IDs:\n${ownerIdsToGrant.join('\n')}`);
    }
    if (!options.apply) {
        console.log('Dry-run complete. Re-run with --apply to create these trial records.');
        return;
    }

    let granted = 0;
    let skippedConcurrent = 0;
    for (const ownerId of ownerIdsToGrant) {
        const now = new Date().toISOString();
        try {
            await documentClient.put({
                TableName: subscriptionTable,
                Item: {
                    ownerId,
                    status: 'trialing',
                    planKey: null,
                    propertyLimit: 1,
                    trialStartedAt: startedAt,
                    trialEndsAt: endsAt,
                    trialConsumed: true,
                    migrationSource: 'existing_owner_launch_trial',
                    createdAt: now,
                    updatedAt: now
                },
                ConditionExpression: 'attribute_not_exists(ownerId)'
            }).promise();
            granted += 1;
        } catch (error) {
            if (error.code === 'ConditionalCheckFailedException') skippedConcurrent += 1;
            else throw error;
        }
    }

    console.log(JSON.stringify({ granted, skippedConcurrent }, null, 2));
};

run().catch(error => {
    console.error(`Trial migration failed: ${error.message}`);
    process.exitCode = 1;
});