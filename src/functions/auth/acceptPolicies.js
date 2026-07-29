const { verifyToken } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const { CURRENT_POLICY_VERSIONS, MANDATORY_POLICY_KEYS, evaluatePolicyCompliance } = require('../../config/legalPolicies.config');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);

        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return response.error('Authorization header is required', 401);
        }

        const accessToken = authHeader.replace('Bearer ', '');
        const cognitoUser = await verifyToken(accessToken);
        const dbUser = await dynamoService.getUserByEmail(cognitoUser.email);

        if (!dbUser) {
            return response.error('User not found', 404);
        }

        const body = JSON.parse(event.body || '{}');
        const { acceptedPolicies, marketingPreferences, acceptanceMethod } = body;

        if (!acceptedPolicies || typeof acceptedPolicies !== 'object') {
            return response.error('acceptedPolicies object is required', 400);
        }

        // Validate that user is accepting current mandatory policy versions
        const missingOrInvalid = [];
        for (const key of MANDATORY_POLICY_KEYS) {
            if (acceptedPolicies[key] !== CURRENT_POLICY_VERSIONS[key]) {
                missingOrInvalid.push(`${key} (Expected: ${CURRENT_POLICY_VERSIONS[key]}, Provided: ${acceptedPolicies[key] || 'None'})`);
            }
        }

        if (missingOrInvalid.length > 0) {
            return response.error(`All mandatory policies must be explicitly accepted with latest version. Invalid: ${missingOrInvalid.join(', ')}`, 400);
        }

        const clientIp = event.requestContext?.identity?.sourceIp || event.headers['X-Forwarded-For'] || 'N/A';
        const userAgent = event.headers['User-Agent'] || event.headers['user-agent'] || 'N/A';
        const timestamp = new Date().toISOString();

        // Construct policy consent payload
        const policyConsentPayload = {
            ...CURRENT_POLICY_VERSIONS,
            ...acceptedPolicies,
            lastAcceptedAt: timestamp,
            acceptedIp: clientIp,
            acceptanceMethod: acceptanceMethod || 'WEB_ONBOARDING'
        };

        const mktPreferences = {
            emailMarketing: Boolean(marketingPreferences?.emailMarketing),
            smsMarketing: Boolean(marketingPreferences?.smsMarketing),
            whatsappMarketing: Boolean(marketingPreferences?.whatsappMarketing),
            pushMarketing: Boolean(marketingPreferences?.pushMarketing),
            updatedAt: timestamp
        };

        // 1. Update user record in DynamoDB
        const updatedUser = await dynamoService.updateUserPolicyConsent(dbUser.userId, policyConsentPayload, mktPreferences);

        // 2. Write immutable compliance log entry
        await dynamoService.logPolicyAcceptance({
            userId: dbUser.userId,
            userEmail: dbUser.email,
            userType: dbUser.userType,
            acceptedPolicies: policyConsentPayload,
            marketingPreferences: mktPreferences,
            acceptedIp: clientIp,
            userAgent: userAgent,
            acceptanceMethod: acceptanceMethod || 'WEB_ONBOARDING'
        });

        const compliance = evaluatePolicyCompliance(policyConsentPayload);

        return response.success({
            message: 'Policy acceptances stored successfully',
            compliant: compliance.compliant,
            requiresPolicyAcceptance: !compliance.compliant,
            policyConsent: updatedUser.policyConsent,
            marketingPreferences: updatedUser.marketingPreferences
        });

    } catch (err) {
        console.error('Error saving policy acceptances:', err);
        if (err.message && err.message.includes('expired')) {
            return response.error('Token expired', 401);
        }
        return response.error('Failed to store policy acceptances', 500);
    }
};
