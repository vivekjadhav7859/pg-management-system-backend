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

        const { notifyOwnerLinkExpired } = require('../../utils/expiredLinkAlert');

        // Legacy code auto-heal: if expiresAt is missing, set to 90 days from now
        if (!invite.expiresAt) {
            const NinetyDaysMs = 90 * 24 * 60 * 60 * 1000;
            const newExpiry = new Date(Date.now() + NinetyDaysMs).toISOString();
            invite.expiresAt = newExpiry;
            dynamodb.update({
                TableName: process.env.INVITE_CODE_TABLE,
                Key: { propertyId: invite.propertyId },
                UpdateExpression: 'SET expiresAt = :exp, status = :st, updatedAt = :ts',
                ExpressionAttributeValues: {
                    ':exp': newExpiry,
                    ':st': 'active',
                    ':ts': new Date().toISOString(),
                },
            }).promise().catch((e) => console.warn('[getPublicPropertyInvite] legacy code update warning:', e.message));
        }

        if (invite.expiresAt && new Date() > new Date(invite.expiresAt)) {
            await notifyOwnerLinkExpired({
                ownerId: invite.ownerId,
                propertyId: invite.propertyId,
                propertyName: invite.propertyName,
                code: invite.code,
                linkType: 'property_invite',
            });
            return response.error('This property invitation link has expired (valid for 3 months). The property owner has been notified.', 410);
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

        let addressStr = '';
        let cityStr = typeof property.city === 'string' ? property.city : '';
        let stateStr = typeof property.state === 'string' ? property.state : '';
        let pincodeStr = typeof property.pincode === 'string' ? property.pincode : (typeof property.pincode === 'number' ? String(property.pincode) : '');

        if (typeof property.address === 'string') {
            addressStr = property.address;
        } else if (property.address && typeof property.address === 'object') {
            const parts = [
                property.address.street || property.address.addressLine1 || property.address.address || property.address.line1,
                property.address.addressLine2 || property.address.line2 || property.address.area,
            ].filter((p) => typeof p === 'string' && p.trim().length > 0);
            
            addressStr = parts.join(', ');
            if (!cityStr && property.address.city && typeof property.address.city === 'string') cityStr = property.address.city;
            if (!stateStr && property.address.state && typeof property.address.state === 'string') stateStr = property.address.state;
            if (!pincodeStr && (property.address.pincode || property.address.zip)) {
                const pVal = property.address.pincode || property.address.zip;
                pincodeStr = typeof pVal === 'string' ? pVal : String(pVal);
            }
        }

        // 3. Return sanitized public metadata
        return response.success({
            valid: true,
            code: invite.code,
            propertyId: property.propertyId,
            propertyName: property.propertyName,
            address: addressStr || '',
            city: cityStr || '',
            state: stateStr || '',
            pincode: pincodeStr || '',
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
