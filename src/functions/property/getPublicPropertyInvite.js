const AWS = require('aws-sdk');
const response = require('../../utils/response');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const { code } = event.pathParameters || {};

        if (!code || code.trim().length === 0) {
            return response.error('Invite code is required', 400);
        }

        const sanitizedCode = code.trim().toUpperCase();

        // 1. Query CodeIndex in INVITE_CODE_TABLE
        const inviteResult = await dynamodb.query({
            TableName: process.env.INVITE_CODE_TABLE,
            IndexName: 'CodeIndex',
            KeyConditionExpression: 'code = :c',
            ExpressionAttributeValues: { ':c': sanitizedCode },
        }).promise();

        if (!inviteResult.Items || inviteResult.Items.length === 0) {
            return response.error('Invalid or expired invitation link', 404);
        }

        const invite = inviteResult.Items[0];
        if (invite.status === 'revoked') {
            return response.error('This invitation link has been regenerated or revoked by the property owner', 410);
        }

        // 2. Query PROPERTY_TABLE for property details
        const propertyResult = await dynamodb.get({
            TableName: process.env.PROPERTY_TABLE,
            Key: { propertyId: invite.propertyId },
        }).promise();

        const property = propertyResult.Item;
        if (!property) {
            return response.error('Property not found', 404);
        }

        // 3. Return sanitized public metadata
        return response.success({
            valid: true,
            code: invite.code,
            propertyId: property.propertyId,
            propertyName: property.propertyName,
            address: property.address || '',
            city: property.city || '',
            state: property.state || '',
            pincode: property.pincode || '',
            propertyType: property.propertyType || property.type || 'Co-live', // Boys / Girls / Co-live
            amenities: property.amenities || [],
            rules: property.rules || [],
            images: property.images || [],
            description: property.description || '',
            availableBeds: property.availableBeds ?? 0,
            totalBeds: property.totalBeds ?? 0,
        });

    } catch (err) {
        console.error('[getPublicPropertyInvite]', err);
        return response.error(err.message || 'Internal server error', 500);
    }
};
