    const AWS = require('aws-sdk');
    const config = require('../config/env');
    
    const dynamoDB = new AWS.DynamoDB.DocumentClient({
        region: config.AWS_REGION
    });
    
    const TABLE_NAME = config.DYNAMODB_TABLE;
    
    /**
     * Save user data to DynamoDB
     */
    module.exports.saveUserToDB = async (userData) => {
        const params = {
            TableName: TABLE_NAME,
            Item: {
                ...userData,
                pk: `USER#${userData.userId}`,
                sk: `PROFILE#${userData.userId}`,
            }
        };
    
        try {
            await dynamoDB.put(params).promise();
            return userData;
        } catch (error) {
            console.error('Error saving user to DynamoDB:', error);
            throw new Error('Failed to save user data');
        }
    };
    
    /**
     * Get user by userId
     */
    module.exports.getUserById = async (userId) => {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                pk: `USER#${userId}`,
                sk: `PROFILE#${userId}`,
            }
        };
    
        try {
            const result = await dynamoDB.get(params).promise();
            return result.Item || null;
        } catch (error) {
            console.error('Error getting user from DynamoDB:', error);
            throw new Error('Failed to retrieve user data');
        }
    };
    
    /**
     * Get user by email
     */
    module.exports.getUserByEmail = async (email) => {
        const params = {
            TableName: TABLE_NAME,
            IndexName: 'email-index', // You'll need to create this GSI
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': email
            }
        };
    
        try {
            const result = await dynamoDB.query(params).promise();
            return result.Items?.[0] || null;
        } catch (error) {
            console.error('Error querying user by email:', error);
            throw new Error('Failed to retrieve user data');
        }
    };
    
    /**
     * Update user data
     */
    module.exports.updateUser = async (userId, updates) => {
        const updateExpression = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
    
        Object.keys(updates).forEach((key, index) => {
            updateExpression.push(`#attr${index} = :val${index}`);
            expressionAttributeNames[`#attr${index}`] = key;
            expressionAttributeValues[`:val${index}`] = updates[key];
        });
    
        // Add updatedAt timestamp
        updateExpression.push(`#updatedAt = :updatedAt`);
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    
        const params = {
            TableName: TABLE_NAME,
            Key: {
                pk: `USER#${userId}`,
                sk: `PROFILE#${userId}`,
            },
            UpdateExpression: `SET ${updateExpression.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        };
    
        try {
            const result = await dynamoDB.update(params).promise();
            return result.Attributes;
        } catch (error) {
            console.error('Error updating user in DynamoDB:', error);
            throw new Error('Failed to update user data');
        }
    };
    
    /**
     * Delete user
     */
    module.exports.deleteUser = async (userId) => {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                pk: `USER#${userId}`,
                sk: `PROFILE#${userId}`,
            }
        };
    
        try {
            await dynamoDB.delete(params).promise();
            return { message: 'User deleted successfully' };
        } catch (error) {
            console.error('Error deleting user from DynamoDB:', error);
            throw new Error('Failed to delete user');
        }
    };
    