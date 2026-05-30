const nodemailer = require('nodemailer');
const { verifyToken } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');

/**
 * POST /properties/{propertyId}/reminder-settings/test
 * 
 * Tests SMTP credentials by:
 * 1. Verifying the connection with transporter.verify()
 * 2. Sending a test email to the owner's own email address
 * 
 * The plaintext password is NEVER stored — it lives only in Lambda memory.
 */
exports.handler = async (event) => {
    try {
        // Auth check
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return response.error('Authorization header is required', 401);
        }

        const accessToken = authHeader.replace('Bearer ', '');
        const cognitoUser = await verifyToken(accessToken);
        const dbUser = await dynamoService.getUserByEmail(cognitoUser.email);

        if (!dbUser || dbUser.status !== 'active') {
            return response.error('User not found or not active', 403);
        }

        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can test SMTP credentials', 403);
        }

        // Verify property ownership
        const propertyId = event.pathParameters.propertyId;
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only configure settings for your properties', 403);
        }

        // Parse SMTP config from body
        const body = JSON.parse(event.body);
        const { provider, user, password, host, port } = body;

        if (!provider || !user || !password) {
            return response.error('provider, user, and password are required', 400);
        }

        // Build nodemailer transport config based on provider
        let transportConfig;
        if (provider === 'gmail') {
            transportConfig = {
                service: 'gmail',
                auth: { user, pass: password }
            };
        } else if (provider === 'outlook') {
            transportConfig = {
                service: 'hotmail',
                auth: { user, pass: password }
            };
        } else {
            // Custom SMTP
            if (!host) {
                return response.error('SMTP host is required for custom providers', 400);
            }
            const smtpPort = parseInt(port) || 587;
            transportConfig = {
                host,
                port: smtpPort,
                secure: smtpPort === 465,
                auth: { user, pass: password }
            };
        }

        // Create transporter and verify connection
        const transporter = nodemailer.createTransport(transportConfig);

        try {
            await transporter.verify();
        } catch (verifyError) {
            console.error('SMTP verification failed:', verifyError.message);
            return response.error(
                `SMTP connection failed: ${verifyError.message}. Check your credentials and ensure App Passwords are enabled.`,
                400
            );
        }

        // Send test email to the owner's own email
        const ownerEmail = dbUser.email || cognitoUser.email;
        try {
            await transporter.sendMail({
                from: `"${property.propertyName}" <${user}>`,
                to: ownerEmail,
                subject: '✅ PG Management — SMTP Test Successful',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 24px;">✅ SMTP Test Successful</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Your email configuration is working correctly</p>
                        </div>
                        <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
                            <p style="font-size: 16px; color: #333;">Hello,</p>
                            <p style="font-size: 15px; color: #555;">Your SMTP configuration for <strong>${property.propertyName}</strong> has been verified successfully.</p>
                            <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px;">
                                <p style="margin: 5px 0;"><strong>Provider:</strong> ${provider}</p>
                                <p style="margin: 5px 0;"><strong>Email:</strong> ${user}</p>
                                <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #10b981; font-weight: bold;">Connected</span></p>
                            </div>
                            <p style="font-size: 14px; color: #777;">You can now save this configuration and start sending rent reminders to your tenants.</p>
                            <p style="font-size: 14px; color: #333; margin-top: 20px;">Thank you,<br/><strong>${property.propertyName} Management</strong></p>
                        </div>
                    </div>
                `
            });
        } catch (sendError) {
            console.error('Test email send failed:', sendError.message);
            return response.error(
                `SMTP verified but test email failed to send: ${sendError.message}`,
                400
            );
        }

        return response.success({
            message: 'SMTP connection verified and test email sent successfully',
            sentTo: ownerEmail
        });

    } catch (err) {
        console.error('Test credentials error:', err);
        return response.error('Failed to test SMTP credentials', 500);
    }
};
