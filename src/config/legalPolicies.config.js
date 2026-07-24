/**
 * Centralized Legal & Policy Version Configuration
 * Current active policy versions for GoBanqo Enterprise SaaS.
 */
const CURRENT_POLICY_VERSIONS = {
    privacyVersion: '1.0',
    termsVersion: '1.0',
    userAgreementVersion: '1.0',
    kycConsentVersion: '1.0',
    dataProcessingVersion: '1.0'
};

const MANDATORY_POLICY_KEYS = [
    'privacyVersion',
    'termsVersion',
    'userAgreementVersion',
    'dataProcessingVersion'
];

const POLICY_METADATA = {
    privacy: {
        id: 'privacy',
        versionKey: 'privacyVersion',
        title: 'Privacy Policy',
        version: CURRENT_POLICY_VERSIONS.privacyVersion,
        isMandatory: true,
        path: '/privacy',
        lastUpdated: '2026-07-24'
    },
    terms: {
        id: 'terms',
        versionKey: 'termsVersion',
        title: 'Terms of Service',
        version: CURRENT_POLICY_VERSIONS.termsVersion,
        isMandatory: true,
        path: '/terms',
        lastUpdated: '2026-07-24'
    },
    user_agreement: {
        id: 'user_agreement',
        versionKey: 'userAgreementVersion',
        title: 'User Agreement',
        version: CURRENT_POLICY_VERSIONS.userAgreementVersion,
        isMandatory: true,
        path: '/user-agreement',
        lastUpdated: '2026-07-24'
    },
    kyc_consent: {
        id: 'kyc_consent',
        versionKey: 'kycConsentVersion',
        title: 'KYC & Identity Verification Consent',
        version: CURRENT_POLICY_VERSIONS.kycConsentVersion,
        isMandatory: true, // Mandatory when onboarding or submitting identity documents
        path: '/kyc-consent',
        lastUpdated: '2026-07-24'
    },
    data_processing: {
        id: 'data_processing',
        versionKey: 'dataProcessingVersion',
        title: 'Data Processing Consent (DPDP Act & GDPR)',
        version: CURRENT_POLICY_VERSIONS.dataProcessingVersion,
        isMandatory: true,
        path: '/data-processing',
        lastUpdated: '2026-07-24'
    },
    cookie_policy: {
        id: 'cookie_policy',
        versionKey: 'cookiePolicyVersion',
        title: 'Cookie & Storage Policy',
        version: '1.0',
        isMandatory: false,
        path: '/cookie-policy',
        lastUpdated: '2026-07-24'
    },
    communication_policy: {
        id: 'communication_policy',
        versionKey: 'communicationPolicyVersion',
        title: 'Communication & Marketing Preferences Policy',
        version: '1.0',
        isMandatory: false,
        path: '/communication-policy',
        lastUpdated: '2026-07-24'
    }
};

/**
 * Checks whether user's policy consent satisfies the current mandatory policy versions.
 * @param {Object} userPolicyConsent User's stored policyConsent object
 * @returns {{ compliant: boolean, missingPolicies: string[] }}
 */
function evaluatePolicyCompliance(userPolicyConsent) {
    if (!userPolicyConsent) {
        return {
            compliant: false,
            missingPolicies: MANDATORY_POLICY_KEYS
        };
    }

    const missingPolicies = [];
    for (const key of MANDATORY_POLICY_KEYS) {
        const requiredVersion = CURRENT_POLICY_VERSIONS[key];
        const userVersion = userPolicyConsent[key];
        if (!userVersion || userVersion !== requiredVersion) {
            missingPolicies.push(key);
        }
    }

    return {
        compliant: missingPolicies.length === 0,
        missingPolicies
    };
}

module.exports = {
    CURRENT_POLICY_VERSIONS,
    MANDATORY_POLICY_KEYS,
    POLICY_METADATA,
    evaluatePolicyCompliance
};
