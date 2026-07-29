const { verifyToken } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const response = require('../../utils/response');
const { sanitizeInput, validatePhoneNumber } = require('../../utils/validator');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
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
        const { name, phoneNumber, profileCompleted, userType } = body;

        // Get current user from database
        let dbUser = await dynamoService.getUserByEmail(cognitoUser.email);

        if (!dbUser) {
            // User does not exist in DB (likely from Google Auth). Create them.
            if (!userType) {
                return response.error('userType is required to create a new profile', 400);
            }

            dbUser = await dynamoService.createUser({
                cognitoUserId: cognitoUser.userId || cognitoUser.sub,
                email: cognitoUser.email,
                name: name ? sanitizeInput(name) : (cognitoUser.name || 'Unknown'),
                phoneNumber: phoneNumber ? sanitizeInput(phoneNumber) : null,
                userType: sanitizeInput(userType),
                emailVerified: true
            });
            
            return response.success({
                message: 'Profile created successfully',
                user: {
                    userId: dbUser.userId,
                    email: dbUser.email,
                    name: dbUser.name,
                    phoneNumber: dbUser.phoneNumber,
                    userType: dbUser.userType,
                    status: dbUser.status,
                    emailVerified: dbUser.emailVerified,
                    profileCompleted: true,
                    lastLoginAt: dbUser.lastLoginAt,
                    createdAt: dbUser.createdAt,
                    updatedAt: dbUser.updatedAt
                }
            });
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