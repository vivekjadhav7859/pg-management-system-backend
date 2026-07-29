const { verifyToken } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        console.log('Get profile request received');

        // Extract access token from Authorization header
        const authHeader = event.headers.Authorization || event.headers.authorization;

        if (!authHeader) {
            return response.error('Authorization header is required', 401);
        }

        const accessToken = authHeader.replace('Bearer ', '');

        // Verify token and get user info from Cognito
        const cognitoUser = await verifyToken(accessToken);

        console.log('Token verified for user:', cognitoUser.email);

        // Get complete user details from DynamoDB
        const dbUser = await dynamoService.getUserByEmail(cognitoUser.email);

        if (!dbUser) {
            return response.error('User not found in database', 404);
        }

        // Check if user is active
        if (dbUser.status === 'deleted' || dbUser.status === 'suspended') {
            return response.error('Account is not active', 403);
        }

        const { evaluatePolicyCompliance } = require('../../config/legalPolicies.config');
        const compliance = evaluatePolicyCompliance(dbUser.policyConsent);

        return response.success({
            message: 'Profile retrieved successfully',
            user: {
                userId: dbUser.userId,
                cognitoUserId: dbUser.cognitoUserId,
                email: dbUser.email,
                name: dbUser.name,
                phoneNumber: dbUser.phoneNumber,
                userType: dbUser.userType,
                status: dbUser.status,
                emailVerified: dbUser.emailVerified,
                profileCompleted: dbUser.profileCompleted,
                requiresPolicyAcceptance: !compliance.compliant,
                policyConsent: dbUser.policyConsent || null,
                marketingPreferences: dbUser.marketingPreferences || null,
                lastLoginAt: dbUser.lastLoginAt,
                createdAt: dbUser.createdAt,
                updatedAt: dbUser.updatedAt,
                linkedPropertyId: dbUser.linkedPropertyId || null,
                linkedOwnerId: dbUser.linkedOwnerId || null
            }
        });

    } catch (err) {
        console.error('Get profile error:', err);
        
        if (err.message && err.message.includes('expired')) {
            return response.error('Token expired', 401);
        }
        
        return response.error('Failed to retrieve profile', 500);
    }
};