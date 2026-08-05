const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const USER_CONSENT_TABLE = process.env.USER_CONSENT_TABLE;
const DATA_REQUEST_TABLE = process.env.DATA_REQUEST_TABLE;
const USER_TABLE = process.env.USER_TABLE;
const RENT_PAYMENT_TABLE = process.env.RENT_PAYMENT_TABLE;
const COMPLAINTS_TABLE = process.env.COMPLAINTS_TABLE;
const TENANT_TABLE = process.env.TENANT_TABLE;

/**
 * Get user consent preferences
 */
exports.getUserConsent = async (userId) => {
    try {
        if (!USER_CONSENT_TABLE) return null;
        const result = await dynamodb.get({
            TableName: USER_CONSENT_TABLE,
            Key: { userId }
        }).promise();

        return result.Item || {
            userId,
            mandatoryConsent: true,
            marketingEmail: false,
            whatsappAlerts: true,
            smsAlerts: true,
            analyticsConsent: false,
            updatedAt: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error fetching user consent:', error);
        throw error;
    }
};

/**
 * Update user consent preferences
 */
exports.updateUserConsent = async (userId, consentData, ipAddress = 'UNKNOWN') => {
    try {
        const timestamp = new Date().toISOString();
        const item = {
            userId,
            mandatoryConsent: true,
            marketingEmail: Boolean(consentData.marketingEmail),
            whatsappAlerts: consentData.whatsappAlerts !== undefined ? Boolean(consentData.whatsappAlerts) : true,
            smsAlerts: consentData.smsAlerts !== undefined ? Boolean(consentData.smsAlerts) : true,
            analyticsConsent: Boolean(consentData.analyticsConsent),
            updatedAt: timestamp,
            ipAddress
        };

        await dynamodb.put({
            TableName: USER_CONSENT_TABLE,
            Item: item
        }).promise();

        return item;
    } catch (error) {
        console.error('Error updating user consent:', error);
        throw error;
    }
};

/**
 * Gather complete user personal data export package (DPDP Right to Data Portability)
 */
exports.generateUserDataExport = async (userId) => {
    try {
        const POLICY_ACCEPTANCE_LOG_TABLE = process.env.POLICY_ACCEPTANCE_LOG_TABLE;
        const [userResult, tenantResult, consentResult, policyLogsResult] = await Promise.all([
            dynamodb.get({ TableName: USER_TABLE, Key: { userId } }).promise(),
            TENANT_TABLE ? dynamodb.query({
                TableName: TENANT_TABLE,
                IndexName: 'UserIdIndex',
                KeyConditionExpression: 'userId = :uid',
                ExpressionAttributeValues: { ':uid': userId }
            }).promise().catch(() => ({ Items: [] })) : Promise.resolve({ Items: [] }),
            USER_CONSENT_TABLE ? dynamodb.get({
                TableName: USER_CONSENT_TABLE,
                Key: { userId }
            }).promise().catch(() => ({ Item: null })) : Promise.resolve({ Item: null }),
            POLICY_ACCEPTANCE_LOG_TABLE ? dynamodb.query({
                TableName: POLICY_ACCEPTANCE_LOG_TABLE,
                IndexName: 'UserIdIndex',
                KeyConditionExpression: 'userId = :uid',
                ExpressionAttributeValues: { ':uid': userId }
            }).promise().catch(() => ({ Items: [] })) : Promise.resolve({ Items: [] })
        ]);

        const userData = userResult.Item || {};
        
        // Remove internal system attributes from export
        delete userData.cognitoUserId;

        return {
            exportTimestamp: new Date().toISOString(),
            platform: 'GoBanqo PG & Property Management SaaS',
            dpdpNotice: 'This document contains a complete export of your personal data processed by GoBanqo under the Digital Personal Data Protection Act 2023.',
            userProfile: userData,
            tenantRecord: tenantResult.Items ? tenantResult.Items[0] : null,
            privacyPreferences: consentResult?.Item || null,
            policyAcceptanceHistory: policyLogsResult?.Items || []
        };
    } catch (error) {
        console.error('Error generating user data export:', error);
        throw error;
    }
};

/**
 * Create a data erasure request (DPDP Right to Erasure)
 */
exports.createDataErasureRequest = async (userId, reason = 'User requested account deletion') => {
    try {
        const requestId = uuidv4();
        const createdAt = new Date().toISOString();

        // Check if user has active obligations (e.g. active tenancy)
        let activeTenancy = false;
        if (TENANT_TABLE) {
            const tenantRes = await dynamodb.query({
                TableName: TENANT_TABLE,
                IndexName: 'UserIdIndex',
                KeyConditionExpression: 'userId = :uid',
                ExpressionAttributeValues: { ':uid': userId }
            }).promise().catch(() => ({ Items: [] }));
            
            if (tenantRes.Items && tenantRes.Items.some(t => t.status === 'active')) {
                activeTenancy = true;
            }
        }

        const item = {
            requestId,
            userId,
            requestType: 'ERASURE',
            status: activeTenancy ? 'REJECTED' : 'PENDING',
            rejectionReason: activeTenancy ? 'User has an active property lease/tenancy contract. Complete or terminate tenancy before requesting account erasure.' : null,
            reason,
            createdAt,
            scheduledExecutionDate: activeTenancy ? null : new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString() // 30 day grace period
        };

        await dynamodb.put({
            TableName: DATA_REQUEST_TABLE,
            Item: item
        }).promise();

        // Mark user deletion status in UserTable if pending
        if (!activeTenancy) {
            await dynamodb.update({
                TableName: USER_TABLE,
                Key: { userId },
                UpdateExpression: 'SET deletionStatus = :ds, scheduledDeletionDate = :sdd',
                ExpressionAttributeValues: {
                    ':ds': 'REQUESTED',
                    ':sdd': item.scheduledExecutionDate
                }
            }).promise().catch(err => console.warn('Could not update deletion status in user table:', err));
        }

        return item;
    } catch (error) {
        console.error('Error creating data erasure request:', error);
        throw error;
    }
};
