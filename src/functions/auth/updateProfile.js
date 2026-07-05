const { verifyToken } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const response = require('../../utils/response');
const { sanitizeInput, validatePhoneNumber } = require('../../utils/validator');

exports.handler = async (event) => {
    try {
        console.log('Update profile request received');

        // Extract access token from Authorization header
        const authHeader = event.headers.Authorization || event.headers.authorization;

        if (!authHeader) {
            return response.error('Authorization header is required', 401);
        }

        const accessToken = authHeader.replace('Bearer ', '');

        // Verify token and get user info from Cognito
        const cognitoUser = await verifyToken(accessToken);

        console.log('Token verified for user:', cognitoUser.email);

        // Parse request body
        const body = JSON.parse(event.body);
        const { name, phoneNumber, profileCompleted } = body;

        // Get current user from database
        const dbUser = await dynamoService.getUserByEmail(cognitoUser.email);

        if (!dbUser) {
            return response.error('User not found in database', 404);
        }

        // Check if user is active
        if (dbUser.status === 'deleted' || dbUser.status === 'suspended') {
            return response.error('Account is not active', 403);
        }

        // Validate phone number if provided
        if (phoneNumber) {
            const phoneValidation = validatePhoneNumber(phoneNumber);
            if (!phoneValidation.valid) {
                return response.error(phoneValidation.message, 400);
            }
        }

        // Prepare updates
        const updates = {};

        if (name !== undefined) {
            updates.name = sanitizeInput(name);
        }

        if (phoneNumber !== undefined) {
            updates.phoneNumber = sanitizeInput(phoneNumber);
        }

        if (profileCompleted !== undefined) {
            updates.profileCompleted = Boolean(profileCompleted);
        }

        // Check if there are any updates
        if (Object.keys(updates).length === 0) {
            return response.error('No valid fields to update', 400);
        }

        // Update user in database
        const updatedUser = await dynamoService.updateUser(dbUser.userId, updates);

        console.log('Profile updated successfully for user:', dbUser.userId);

        return response.success({
            message: 'Profile updated successfully',
            user: {
                userId: updatedUser.userId,
                email: updatedUser.email,
                name: updatedUser.name,
                phoneNumber: updatedUser.phoneNumber,
                userType: updatedUser.userType,
                status: updatedUser.status,
                emailVerified: updatedUser.emailVerified,
                profileCompleted: updatedUser.profileCompleted,
                lastLoginAt: updatedUser.lastLoginAt,
                createdAt: updatedUser.createdAt,
                updatedAt: updatedUser.updatedAt
            }
        });

    } catch (err) {
        console.error('Update profile error:', err);
        
        if (err.message && err.message.includes('expired')) {
            return response.error('Token expired', 401);
        }
        
        return response.error('Failed to update profile', 500);
    }
};