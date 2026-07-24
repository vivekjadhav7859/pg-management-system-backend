const { CURRENT_POLICY_VERSIONS, POLICY_METADATA, MANDATORY_POLICY_KEYS } = require('../../config/legalPolicies.config');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);

        return response.success({
            message: 'Latest legal policies retrieved successfully',
            currentVersions: CURRENT_POLICY_VERSIONS,
            mandatoryPolicies: MANDATORY_POLICY_KEYS,
            policies: POLICY_METADATA
        });
    } catch (err) {
        console.error('Error fetching latest policies:', err);
        return response.error('Failed to retrieve legal policies', 500);
    }
};
