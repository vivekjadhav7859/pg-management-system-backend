const { AdminLinkProviderForUserCommand, CognitoIdentityProviderClient, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');

const cognito = new CognitoIdentityProviderClient();

exports.handler = async (event) => {
    console.log('PreSignUp trigger event:', JSON.stringify(event, null, 2));

    const { userPoolId, userName } = event;
    const email = event.request.userAttributes.email;

    // Check if the user is signing in via an external provider (like Google)
    if (event.triggerSource === 'PreSignUp_ExternalProvider') {
        const providerName = userName.split('_')[0]; // e.g., 'Google'
        const providerUserId = userName.split('_')[1]; // The unique ID from Google

        if (email) {
            try {
                // Check if a user with this email already exists
                const listUsersCommand = new ListUsersCommand({
                    UserPoolId: userPoolId,
                    Filter: `email = "${email}"`,
                });

                const { Users } = await cognito.send(listUsersCommand);

                if (Users && Users.length > 0) {
                    // Find a native user (not an external provider)
                    const nativeUser = Users.find(user => user.UserStatus !== 'EXTERNAL_PROVIDER');
                    
                    if (nativeUser) {
                        console.log(`Found existing native user for ${email}. Linking accounts...`);
                        
                        const linkCommand = new AdminLinkProviderForUserCommand({
                            UserPoolId: userPoolId,
                            DestinationUser: {
                                ProviderName: 'Cognito',
                                ProviderAttributeValue: nativeUser.Username
                            },
                            SourceUser: {
                                ProviderName: providerName,
                                ProviderAttributeName: 'Cognito_Subject',
                                ProviderAttributeValue: providerUserId
                            }
                        });

                        await cognito.send(linkCommand);
                        console.log('Account linked successfully');
                    }
                }
            } catch (error) {
                console.error('Error in PreSignUp external provider flow:', error);
            }
        }
        
        // Auto-verify email if coming from Google
        if (event.request.userAttributes.email_verified === 'true' || event.request.userAttributes.email_verified === true) {
            event.response.autoVerifyEmail = true;
        }
    }
    
    return event;
};
