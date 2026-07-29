const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const COMPLAINTS_TABLE = process.env.COMPLAINTS_TABLE;

exports.createComplaint = async (data) => {
    try {
        const timestamp = new Date().toISOString();
        const complaintId = uuidv4();

        const item = {
            complaintId,
            propertyIdIndex: data.propertyId,
            tenantIdIndex: data.tenantId,
            statusIndex: 'open',
            title: data.title,
            description: data.description,
            category: data.category,
            priority: data.priority || 'medium',
            resolvedAt: null,
            createdAt: timestamp,
            updatedAt: timestamp
        };

        const params = {
            TableName: COMPLAINTS_TABLE,
            Item: item
        };

        await dynamodb.put(params).promise();
        return item;
    } catch (error) {
        console.error('Error creating complaint:', error);
        throw error;
    }
};

exports.getComplaintsByProperty = async (propertyId) => {
    try {
        const params = {
            TableName: COMPLAINTS_TABLE,
            IndexName: 'PropertyIdIndex',
            KeyConditionExpression: 'propertyIdIndex = :propertyId',
            ExpressionAttributeValues: {
                ':propertyId': propertyId
            }
        };

        const result = await dynamodb.query(params).promise();
        let complaints = result.Items || [];

        if (complaints.length === 0) {
            const scanParams = {
                TableName: COMPLAINTS_TABLE,
                FilterExpression: 'propertyId = :propertyId OR propertyIdIndex = :propertyId',
                ExpressionAttributeValues: {
                    ':propertyId': propertyId
                }
            };
            const scanResult = await dynamodb.scan(scanParams).promise();
            complaints = scanResult.Items || [];
        }

        return complaints;
    } catch (error) {
        console.error('Error getting complaints by property:', error);
        throw error;
    }
};

exports.getComplaintById = async (complaintId) => {
    try {
        const params = {
            TableName: COMPLAINTS_TABLE,
            Key: { complaintId }
        };

        const result = await dynamodb.get(params).promise();
        return result.Item || null;
    } catch (error) {
        console.error('Error getting complaint:', error);
        throw error;
    }
};

exports.updateComplaintStatus = async (complaintId, status, notes = null) => {
    try {
        const timestamp = new Date().toISOString();
        let updateExp = 'SET statusIndex = :status, updatedAt = :updatedAt';
        let expValues = {
            ':status': status,
            ':updatedAt': timestamp
        };

        if (notes) {
            updateExp += ', resolutionNotes = :notes';
            expValues[':notes'] = notes;
        }

        if (status === 'resolved' || status === 'closed') {
            updateExp += ', resolvedAt = :resolvedAt';
            expValues[':resolvedAt'] = timestamp;
        }

        const params = {
            TableName: COMPLAINTS_TABLE,
            Key: { complaintId },
            UpdateExpression: updateExp,
            ExpressionAttributeValues: expValues,
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamodb.update(params).promise();
        return result.Attributes;
    } catch (error) {
        console.error('Error updating complaint status:', error);
        throw error;
    }
};
