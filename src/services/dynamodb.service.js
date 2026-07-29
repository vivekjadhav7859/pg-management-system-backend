const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const USER_TABLE = process.env.USER_TABLE;
const POLICY_ACCEPTANCE_LOG_TABLE = process.env.POLICY_ACCEPTANCE_LOG_TABLE || `${process.env.USER_TABLE?.replace('-users-', '-policy-logs-')}`;

/**
 * Create user entry in DynamoDB
 */
exports.createUser = async (userData) => {
    try {
        const userId = uuidv4();
        const timestamp = new Date().toISOString();

        const item = {
            userId: userId,
            cognitoUserId: userData.cognitoUserId,
            email: userData.email,
            name: userData.name || null,
            phoneNumber: userData.phoneNumber || null,
            userType: userData.userType || 'tenant', // tenant, owner, admin
            status: 'active',
            emailVerified: userData.emailVerified !== undefined ? userData.emailVerified : true,
            createdAt: timestamp,
            updatedAt: timestamp,
            
            // Additional metadata
            lastLoginAt: null,
            profileCompleted: false,
            
            // GSI attributes for querying
            emailLowerCase: userData.email.toLowerCase(),
            userTypeIndex: userData.userType || 'tenant'
        };

        const params = {
            TableName: USER_TABLE,
            Item: item,
            ConditionExpression: 'attribute_not_exists(email)'
        };

        await dynamodb.put(params).promise();

        return item;

    } catch (error) {
        console.error('Error creating user in DynamoDB:', error);
        
        if (error.code === 'ConditionalCheckFailedException') {
            throw new Error('User with this email already exists in database');
        }
        
        throw error;
    }
};

/**
 * Mark user email as verified (called after OTP confirmation)
 */
exports.updateEmailVerified = async (userId) => {
    try {
        const timestamp = new Date().toISOString();
        const params = {
            TableName: USER_TABLE,
            Key: { userId },
            UpdateExpression: 'SET emailVerified = :v, updatedAt = :t',
            ExpressionAttributeValues: { ':v': true, ':t': timestamp }
        };
        await dynamodb.update(params).promise();
    } catch (error) {
        console.error('Error updating emailVerified:', error);
        throw error;
    }
};

exports.getUserById = async (userId) => {
    try {
        const params = {
            TableName: USER_TABLE,
            Key: {
                userId: userId
            }
        };

        const result = await dynamodb.get(params).promise();
        
        return result.Item || null;

    } catch (error) {
        console.error('Error getting user by ID:', error);
        throw error;
    }
};

/**
 * Get user by email
 */
exports.getUserByEmail = async (email) => {
    try {
        const params = {
            TableName: USER_TABLE,
            IndexName: 'EmailIndex',
            KeyConditionExpression: 'emailLowerCase = :email',
            ExpressionAttributeValues: {
                ':email': email.toLowerCase()
            }
        };

        const result = await dynamodb.query(params).promise();
        
        return result.Items && result.Items.length > 0 ? result.Items[0] : null;

    } catch (error) {
        console.error('Error getting user by email:', error);
        throw error;
    }
};

/**
 * Get user by Cognito User ID
 */
exports.getUserByCognitoId = async (cognitoUserId) => {
    try {
        const params = {
            TableName: USER_TABLE,
            IndexName: 'CognitoUserIdIndex',
            KeyConditionExpression: 'cognitoUserId = :cognitoUserId',
            ExpressionAttributeValues: {
                ':cognitoUserId': cognitoUserId
            }
        };

        const result = await dynamodb.query(params).promise();
        
        return result.Items && result.Items.length > 0 ? result.Items[0] : null;

    } catch (error) {
        console.error('Error getting user by Cognito ID:', error);
        throw error;
    }
};

/**
 * Update user details
 */
exports.updateUser = async (userId, updates) => {
    try {
        const timestamp = new Date().toISOString();
        
        // Build update expression dynamically
        let updateExpression = 'SET updatedAt = :updatedAt';
        const expressionAttributeValues = {
            ':updatedAt': timestamp
        };
        const expressionAttributeNames = {};

        // Add fields to update
        if (updates.name !== undefined) {
            updateExpression += ', #name = :name';
            expressionAttributeValues[':name'] = updates.name;
            expressionAttributeNames['#name'] = 'name';
        }

        if (updates.phoneNumber !== undefined) {
            updateExpression += ', phoneNumber = :phoneNumber';
            expressionAttributeValues[':phoneNumber'] = updates.phoneNumber;
        }

        if (updates.status !== undefined) {
            updateExpression += ', #status = :status';
            expressionAttributeValues[':status'] = updates.status;
            expressionAttributeNames['#status'] = 'status';
        }

        if (updates.profileCompleted !== undefined) {
            updateExpression += ', profileCompleted = :profileCompleted';
            expressionAttributeValues[':profileCompleted'] = updates.profileCompleted;
        }

        if (updates.lastLoginAt !== undefined) {
            updateExpression += ', lastLoginAt = :lastLoginAt';
            expressionAttributeValues[':lastLoginAt'] = updates.lastLoginAt;
        }

        const params = {
            TableName: USER_TABLE,
            Key: {
                userId: userId
            },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        };

        if (Object.keys(expressionAttributeNames).length > 0) {
            params.ExpressionAttributeNames = expressionAttributeNames;
        }

        const result = await dynamodb.update(params).promise();
        
        return result.Attributes;

    } catch (error) {
        console.error('Error updating user:', error);
        throw error;
    }
};

/**
 * Update last login timestamp
 */
exports.updateLastLogin = async (userId) => {
    try {
        const timestamp = new Date().toISOString();

        const params = {
            TableName: USER_TABLE,
            Key: {
                userId: userId
            },
            UpdateExpression: 'SET lastLoginAt = :lastLoginAt, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':lastLoginAt': timestamp,
                ':updatedAt': timestamp
            },
            ReturnValues: 'NONE'
        };

        await dynamodb.update(params).promise();

    } catch (error) {
        console.error('Error updating last login:', error);
        throw error;
    }
};

/**
 * Get all users by user type
 */
exports.getUsersByType = async (userType, limit = 50, lastEvaluatedKey = null) => {
    try {
        const params = {
            TableName: USER_TABLE,
            IndexName: 'UserTypeIndex',
            KeyConditionExpression: 'userTypeIndex = :userType',
            ExpressionAttributeValues: {
                ':userType': userType
            },
            Limit: limit
        };

        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }

        const result = await dynamodb.query(params).promise();
        
        return {
            users: result.Items || [],
            lastEvaluatedKey: result.LastEvaluatedKey || null
        };

    } catch (error) {
        console.error('Error getting users by type:', error);
        throw error;
    }
};

/**
 * Delete user (soft delete by updating status)
 */
exports.deleteUser = async (userId) => {
    try {
        const timestamp = new Date().toISOString();

        const params = {
            TableName: USER_TABLE,
            Key: {
                userId: userId
            },
            UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':status': 'deleted',
                ':updatedAt': timestamp
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamodb.update(params).promise();
        
        return result.Attributes;

    } catch (error) {
        console.error('Error deleting user:', error);
        throw error;
    }
};

/**
 * Update user policy consent and marketing preferences in DynamoDB
 */
exports.updateUserPolicyConsent = async (userId, policyConsent, marketingPreferences = {}) => {
    try {
        const timestamp = new Date().toISOString();
        const params = {
            TableName: USER_TABLE,
            Key: { userId },
            UpdateExpression: 'SET policyConsent = :pc, marketingPreferences = :mp, updatedAt = :t',
            ExpressionAttributeValues: {
                ':pc': policyConsent,
                ':mp': marketingPreferences,
                ':t': timestamp
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamodb.update(params).promise();
        return result.Attributes;
    } catch (error) {
        console.error('Error updating user policy consent:', error);
        throw error;
    }
};

/**
 * Write an immutable policy acceptance log for audit trail & compliance
 */
exports.logPolicyAcceptance = async (logData) => {
    try {
        const crypto = require('crypto');
        const logId = `log_${uuidv4()}`;
        const timestamp = new Date().toISOString();

        const payload = JSON.stringify({
            userId: logData.userId,
            acceptedPolicies: logData.acceptedPolicies,
            acceptedAt: timestamp,
            acceptedIp: logData.acceptedIp || 'N/A'
        });

        const checksumHash = crypto.createHash('sha256').update(payload).digest('hex');

        const item = {
            logId,
            userId: logData.userId,
            userEmail: logData.userEmail || null,
            userType: logData.userType || null,
            acceptedPolicies: logData.acceptedPolicies,
            marketingPreferences: logData.marketingPreferences || {},
            acceptedAt: timestamp,
            acceptedIp: logData.acceptedIp || 'N/A',
            userAgent: logData.userAgent || 'N/A',
            acceptanceMethod: logData.acceptanceMethod || 'WEB_FORM',
            checksumHash
        };

        const params = {
            TableName: POLICY_ACCEPTANCE_LOG_TABLE,
            Item: item
        };

        await dynamodb.put(params).promise();
        return item;
    } catch (error) {
        console.error('Error logging policy acceptance:', error);
        throw error;
    }
};

/**
 * Fetch policy acceptance log history for a user
 */
exports.getPolicyLogsByUserId = async (userId) => {
    try {
        const params = {
            TableName: POLICY_ACCEPTANCE_LOG_TABLE,
            IndexName: 'UserIdIndex',
            KeyConditionExpression: 'userId = :u',
            ExpressionAttributeValues: {
                ':u': userId
            }
        };

        const result = await dynamodb.query(params).promise();
        return result.Items || [];
    } catch (error) {
        console.error('Error fetching policy logs by userId:', error);
        return [];
    }
};