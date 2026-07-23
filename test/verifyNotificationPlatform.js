const { NOTIFICATION_EVENTS } = require('../src/constants/notificationEvents');
const notificationService = require('../src/services/notification.service');
const emailTemplates = require('../src/templates/emailTemplates');
const { renderLayout } = require('../src/templates/templateRenderer');

async function testNotificationPlatform() {
    console.log('--- TESTING GOBANQO NOTIFICATION PLATFORM ---');
    console.log('1. Verifying Notification Events Catalog:');
    console.log('Total event definitions:', Object.keys(NOTIFICATION_EVENTS).length);
    if (Object.keys(NOTIFICATION_EVENTS).length < 25) {
        throw new Error('Notification catalog missing required events');
    }

    console.log('\n2. Testing Template Rendering for Core Events:');
    const testCases = [
        { type: NOTIFICATION_EVENTS.ACCOUNT_CREATED, fn: () => emailTemplates.getAccountCreatedTemplate({ name: 'Shoukat Mulla', email: 'owner@gobanqo.com', dashboardUrl: 'https://gobanqo.com' }) },
        { type: NOTIFICATION_EVENTS.LOGIN_OTP, fn: () => emailTemplates.getLoginOtpTemplate({ otpCode: '849201' }) },
        { type: NOTIFICATION_EVENTS.PASSWORD_RESET, fn: () => emailTemplates.getPasswordResetTemplate({ name: 'Shoukat', resetCode: '123456', resetUrl: 'https://gobanqo.com/reset' }) },
        { type: NOTIFICATION_EVENTS.TENANT_CREATED, fn: () => emailTemplates.getWelcomeTemplate({ tenantName: 'Rahul Sharma', ownerName: 'Shoukat Mulla', propertyName: 'Meta PG', roomNumber: '101', rentAmount: 8500 }) },
        { type: NOTIFICATION_EVENTS.RENT_REMINDER, fn: () => emailTemplates.getRentReminderTemplate({ tenantName: 'Rahul Sharma', ownerName: 'Shoukat Mulla', propertyName: 'Meta PG', roomNumber: '101', rentAmount: 8500, dueDate: '01 Aug 2026' }) },
        { type: NOTIFICATION_EVENTS.RENT_OVERDUE, fn: () => emailTemplates.getOverdueReminderTemplate({ tenantName: 'Rahul Sharma', ownerName: 'Shoukat Mulla', propertyName: 'Meta PG', roomNumber: '101', rentAmount: 8500, dueDate: '01 Jul 2026' }) },
        { type: NOTIFICATION_EVENTS.RECEIPT_GENERATED, fn: () => emailTemplates.getPaymentReceiptTemplate({ tenantName: 'Rahul Sharma', ownerName: 'Shoukat Mulla', propertyName: 'Meta PG', roomNumber: '101', rentAmount: 8500, receiptNumber: 'RCP-2026-001', paymentDate: '23 Jul 2026', paymentMode: 'UPI' }) },
        { type: NOTIFICATION_EVENTS.COMPLAINT_CREATED, fn: () => emailTemplates.getComplaintCreatedTemplate({ ownerName: 'Shoukat Mulla', tenantName: 'Rahul Sharma', propertyName: 'Meta PG', roomNumber: '101', requestTitle: 'AC Not Cooling' }) },
        { type: NOTIFICATION_EVENTS.TRIAL_ENDING, fn: () => emailTemplates.getTrialEndingTemplate({ ownerName: 'Shoukat Mulla', daysRemaining: 5, upgradeUrl: 'https://gobanqo.com/billing' }) }
    ];

    for (const test of testCases) {
        const result = test.fn();
        if (!result.subject || !result.html) {
            throw new Error(`Template for ${test.type} failed to output subject or html`);
        }
        if (!result.html.includes('GoBanqo')) {
            throw new Error(`Template for ${test.type} missing GoBanqo brand identity`);
        }
        console.log(`  ✓ Event [${test.type}] rendered successfully (Subject: ${result.subject})`);
    }

    console.log('\n3. Testing NotificationService Dispatch (Simulated Mode):');
    const dispatchResult = await notificationService.sendNotification({
        type: NOTIFICATION_EVENTS.RENT_REMINDER,
        ownerId: 'owner-123',
        tenantId: 'tenant-456',
        tenantEmail: 'tenant@example.com',
        propertyId: 'prop-789',
        data: {
            tenantName: 'Test Tenant',
            ownerName: 'Test Owner',
            propertyName: 'GoBanqo Residency',
            roomNumber: '202',
            rentAmount: 12000,
            dueDate: '01 Aug 2026'
        }
    });

    console.log('Dispatch output:', dispatchResult);
    if (!dispatchResult.sent) {
        throw new Error(`Dispatch failed: ${dispatchResult.reason}`);
    }

    console.log('\n✅ ALL NOTIFICATION PLATFORM UNIT TESTS PASSED SUCCESSFULLY!');
}

testNotificationPlatform().catch((err) => {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
});
