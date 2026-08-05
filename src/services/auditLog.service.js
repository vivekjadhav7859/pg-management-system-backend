const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const AUDIT_LOG_TABLE = process.env.AUDIT_LOG_TABLE;

/**
 * Record a security audit log entry.
 */
exports.recordAuditLog = async ({
    userId,
    action,
    actorId = null,
    ipAddress = 'UNKNOWN',
    userAgent = 'UNKNOWN',
    status = 'SUCCESS',
    metadata = {}
}) => {
    try {
        if (!AUDIT_LOG_TABLE) {
            console.warn('AUDIT_LOG_TABLE environment variable not configured. Skipping audit log write.');
            return null;
        }

        const timestamp = new Date().toISOString();
        const auditId = uuidv4();

        const item = {
            auditId,
            userId: userId || actorId || 'SYSTEM',
            actorId: actorId || userId || 'SYSTEM',
            action, // e.g. LOGIN, PASSWORD_CHANGE, DATA_EXPORT, DELETE_REQUEST, CONSENT_UPDATE, PII_ACCESS
            status,
            ipAddress,
            userAgent,
            metadata,
            timestamp,
            ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year retention
        };

        await dynamodb.put({
            TableName: AUDIT_LOG_TABLE,
            Item: item
        }).promise();

        return item;
    } catch (error) {
        console.error('Error recording audit log:', error);
        // Do not throw to avoid failing primary business operations if audit write fails
        return null;
    }
};

/**
 * Get security audit logs for a specific user.
 */
exports.getUserAuditLogs = async (userId, limit = 50) => {
    try {
        if (!AUDIT_LOG_TABLE || !userId) return [];

        const params = {
            TableName: AUDIT_LOG_TABLE,
            IndexName: 'UserIdTimestampIndex',
            KeyConditionExpression: 'userId = :uid',
            ExpressionAttributeValues: {
                ':uid': userId
            },
            ScanIndexForward: false, // Descending order (newest first)
            Limit: limit
        };

        const result = await dynamodb.query(params).promise();
        return result.Items || [];
    } catch (error) {
        console.error('Error fetching audit logs for user:', error);
        throw error;
    }
};
