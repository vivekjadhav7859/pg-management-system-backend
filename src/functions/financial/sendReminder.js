const AWS = require('aws-sdk');
const nodemailer = require('nodemailer');
const { verifyToken } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const financialService = require('../../services/financial.service');
const { decryptSecret } = require('../../utils/crypto');
const response = require('../../utils/response');

/**
 * POST /financial/send-reminder
 * 
 * Sends rent reminder/receipt emails to tenants using the owner's
 * BYO-SMTP configuration (stored encrypted in DynamoDB).
 * 
 * Replaces the previous AWS SES implementation.
 */
exports.handler = async (event) => {
    try {
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
            return response.error('Only owners can send reminders', 403);
        }

        const body = JSON.parse(event.body);
        const { tenantId, paymentId, type } = body;

        console.log('sendReminder requested for tenantId:', tenantId, 'paymentId:', paymentId);

        if (!tenantId) {
            console.log('Failed: tenantId is missing');
            return response.error('tenantId is required', 400);
        }

        // Get tenant details
        const tenant = await tenantService.getTenantById(tenantId);
        if (!tenant) {
            console.log('Failed: tenant not found', tenantId);
            return response.error('Tenant not found', 404);
        }

        // Verify property ownership
        const property = await propertyService.getPropertyById(tenant.propertyId);
        if (!property) {
            console.log('Failed: property not found', tenant.propertyId);
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            console.log('Failed: not owner of property', property.propertyId);
            return response.error('You can only send reminders to your tenants', 403);
        }

        // ===== BYO-SMTP: Fetch owner's email configuration =====
        const reminderSettings = await financialService.getReminderSettings(property.propertyId);
        
        if (!reminderSettings || !reminderSettings.emailConfig) {
            console.log('Failed: emailConfig not found for property', property.propertyId);
            return response.error(
                'Email is not configured. Please set up your SMTP credentials in the Reminders page first.',
                400
            );
        }

        const emailConfig = reminderSettings.emailConfig;

        // Decrypt the SMTP password
        let smtpPassword;
        try {
            smtpPassword = await decryptSecret(emailConfig.encryptedPassword);
        } catch (decryptErr) {
            console.error('Failed to decrypt SMTP password:', decryptErr.message);
            return response.error('Failed to decrypt email credentials. Please reconfigure your SMTP settings.', 500);
        }

        // Build nodemailer transport
        let transportConfig;
        if (emailConfig.provider === 'gmail') {
            transportConfig = {
                service: 'gmail',
                auth: { user: emailConfig.user, pass: smtpPassword }
            };
        } else if (emailConfig.provider === 'outlook') {
            transportConfig = {
                service: 'hotmail',
                auth: { user: emailConfig.user, pass: smtpPassword }
            };
        } else {
            // Custom SMTP
            const smtpPort = emailConfig.port || 587;
            transportConfig = {
                host: emailConfig.host,
                port: smtpPort,
                secure: smtpPort === 465,
                auth: { user: emailConfig.user, pass: smtpPassword }
            };
        }

        const transporter = nodemailer.createTransport(transportConfig);

        // Get payment details if paymentId provided
        let payment = null;
        if (paymentId) {
            payment = await financialService.getRentPaymentById(paymentId);
        }

        // Build email content
        const tenantName = tenant.name || 'Tenant';
        
        let roomNo = tenant.roomId || 'N/A';
        try {
            if (tenant.roomId) {
                const roomParams = {
                    TableName: process.env.ROOM_TABLE,
                    Key: { roomId: tenant.roomId }
                };
                const dynamodb = new AWS.DynamoDB.DocumentClient();
                const roomResult = await dynamodb.get(roomParams).promise();
                if (roomResult.Item && roomResult.Item.roomNumber) {
                    roomNo = roomResult.Item.roomNumber;
                }
            }
        } catch (err) {
            console.error('Error fetching room:', err);
        }

        const amount = payment ? payment.amount : tenant.rentAmount || 0;
        const dueDate = payment && payment.dueDate 
            ? new Date(payment.dueDate).toLocaleDateString('en-IN')
            : 'upcoming';

        const reminderType = type || 'payment';
        const paymentMode = body.paymentMode || 'cash';
        const receiptNumber = payment ? payment.receiptNumber : `RCP-${Date.now()}`;
        const paymentDateStr = new Date().toLocaleDateString('en-IN');
        const monthStr = payment ? payment.paymentMonth : new Date().toISOString().slice(0, 7);
        
        let subject, htmlBody;
        
        if (reminderType === 'receipt') {
            subject = `Payment Receipt - ${property.propertyName} (${monthStr})`;
            htmlBody = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">✅ Payment Received</h1>
                        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Thank you for your payment</p>
                    </div>
                    <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
                        <p style="font-size: 16px; color: #333;">Dear <strong>${tenantName}</strong>,</p>
                        <p style="font-size: 15px; color: #555;">Your rent payment has been successfully received. Here are the details:</p>
                        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; margin: 20px 0; border-radius: 8px;">
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr><td style="padding: 8px 0; color: #666; font-size: 14px;">Receipt No.</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #333;">${receiptNumber}</td></tr>
                                <tr><td style="padding: 8px 0; color: #666; font-size: 14px;">Month</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #333;">${monthStr}</td></tr>
                                <tr><td style="padding: 8px 0; color: #666; font-size: 14px;">Room</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #333;">${roomNo}</td></tr>
                                <tr><td style="padding: 8px 0; color: #666; font-size: 14px;">Property</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #333;">${property.propertyName}</td></tr>
                                <tr style="border-top: 1px solid #d1fae5;"><td style="padding: 12px 0; color: #666; font-size: 14px;">Payment Method</td><td style="padding: 12px 0; text-align: right; font-weight: 600; color: #333; text-transform: capitalize;">${paymentMode}</td></tr>
                                <tr><td style="padding: 8px 0; color: #666; font-size: 14px;">Payment Date</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #333;">${paymentDateStr}</td></tr>
                                <tr style="border-top: 2px solid #10b981;"><td style="padding: 12px 0; color: #333; font-size: 16px; font-weight: 600;">Amount Paid</td><td style="padding: 12px 0; text-align: right; font-weight: 700; color: #10b981; font-size: 20px;">₹${amount.toLocaleString('en-IN')}</td></tr>
                            </table>
                        </div>
                        <p style="font-size: 13px; color: #999; text-align: center; margin-top: 20px;">This is an auto-generated receipt. Please keep it for your records.</p>
                        <p style="font-size: 14px; color: #333; margin-top: 20px;">Thank you,<br/><strong>${property.propertyName} Management</strong></p>
                    </div>
                </div>
            `;
        } else if (reminderType === 'overdue') {
            subject = `Overdue Payment Reminder - ${property.propertyName}`;
            htmlBody = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #dc3545, #c82333); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">⚠️ Overdue Payment Reminder</h1>
                    </div>
                    <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
                        <p style="font-size: 16px; color: #333;">Dear <strong>${tenantName}</strong>,</p>
                        <p style="font-size: 15px; color: #555;">Your rent payment is <span style="color: #dc3545; font-weight: bold;">overdue</span>. Please clear the outstanding amount at the earliest.</p>
                        <div style="background: #fff3f3; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; border-radius: 4px;">
                            <p style="margin: 5px 0;"><strong>Amount Due:</strong> ₹${amount.toLocaleString('en-IN')}</p>
                            <p style="margin: 5px 0;"><strong>Due Date:</strong> ${dueDate}</p>
                            <p style="margin: 5px 0;"><strong>Room:</strong> ${roomNo}</p>
                            <p style="margin: 5px 0;"><strong>Property:</strong> ${property.propertyName}</p>
                        </div>
                        <p style="font-size: 14px; color: #777;">Please make the payment immediately to avoid any inconvenience.</p>
                        <p style="font-size: 14px; color: #333; margin-top: 20px;">Regards,<br/><strong>${property.propertyName} Management</strong></p>
                    </div>
                </div>
            `;
        } else {
            subject = `Rent Payment Reminder - ${property.propertyName}`;
            htmlBody = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">🔔 Rent Payment Reminder</h1>
                    </div>
                    <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
                        <p style="font-size: 16px; color: #333;">Dear <strong>${tenantName}</strong>,</p>
                        <p style="font-size: 15px; color: #555;">This is a friendly reminder that your rent payment is due soon.</p>
                        <div style="background: #f0f0ff; border-left: 4px solid #4f46e5; padding: 15px; margin: 20px 0; border-radius: 4px;">
                            <p style="margin: 5px 0;"><strong>Amount:</strong> ₹${amount.toLocaleString('en-IN')}</p>
                            <p style="margin: 5px 0;"><strong>Due Date:</strong> ${dueDate}</p>
                            <p style="margin: 5px 0;"><strong>Room:</strong> ${roomNo}</p>
                            <p style="margin: 5px 0;"><strong>Property:</strong> ${property.propertyName}</p>
                        </div>
                        <p style="font-size: 14px; color: #777;">Please ensure timely payment to avoid any late fees.</p>
                        <p style="font-size: 14px; color: #333; margin-top: 20px;">Thank you,<br/><strong>${property.propertyName} Management</strong></p>
                    </div>
                </div>
            `;
        }

        // Send email via nodemailer (BYO-SMTP)
        const emailResult = { sent: false, error: null };
        
        if (tenant.email) {
            try {
                await transporter.sendMail({
                    from: `"${property.propertyName}" <${emailConfig.user}>`,
                    to: tenant.email,
                    subject: subject,
                    html: htmlBody,
                    text: `Dear ${tenantName}, your rent of ₹${amount.toLocaleString('en-IN')} for Room ${roomNo} at ${property.propertyName} is ${reminderType === 'overdue' ? 'overdue' : 'due on ' + dueDate}. Please pay on time.`
                });
                emailResult.sent = true;
                console.log(`Email reminder sent to ${tenant.email} via ${emailConfig.provider} SMTP`);
            } catch (smtpError) {
                console.error('SMTP send error:', smtpError.message);
                emailResult.error = smtpError.message;
            }
        } else {
            emailResult.error = 'No email address on file for tenant';
        }

        return response.success({
            message: 'Reminder processed',
            tenantId: tenantId,
            tenantName: tenantName,
            email: emailResult,
            reminderType: reminderType
        });

    } catch (err) {
        console.error('Send reminder error:', err);
        return response.error('Failed to send reminder', 500);
    }
};
