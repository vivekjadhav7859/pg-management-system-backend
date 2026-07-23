/**
 * Modular enterprise email templates for GoBanqo transactional notifications.
 * Supports all 25 required system events across Auth, Tenant, Rent, Payment, Maintenance, Property, and Subscription modules.
 */

const { renderLayout } = require('./templateRenderer');

const escapeHtml = (value = '') => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatCurrency = (amount = 0) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

// ==========================================
// AUTHENTICATION TEMPLATES
// ==========================================

exports.getAccountCreatedTemplate = ({ name, email, dashboardUrl }) => {
    const subject = `Welcome to GoBanqo — Account Created`;
    const preheader = `Your GoBanqo property management account is ready.`;
    const contentHtml = `
      <h2 style="font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0;">Welcome ${escapeHtml(name || 'User')},</h2>
      <p style="font-size: 15px; color: #334155; line-height: 1.6;">Your account with <strong>${escapeHtml(email)}</strong> has been created successfully.</p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 24px 0;">
        <p style="margin: 0; font-size: 14px; color: #475569;">You can now log in to manage your properties, tenants, rent collections, and maintenance requests in one place.</p>
      </div>
      <p style="font-size: 14px; color: #64748b;">If you did not perform this action, please contact support immediately.</p>
    `;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, actionUrl: dashboardUrl, actionText: 'Go to Dashboard', footerText: 'GoBanqo Security Services' }) };
};

exports.getEmailVerifiedTemplate = ({ name }) => {
    const subject = `✅ Email Verified — GoBanqo`;
    const preheader = `Your email address has been verified successfully.`;
    const contentHtml = `
      <h2 style="font-size: 18px; font-weight: 600; color: #166534; margin-top: 0;">Email Verification Successful</h2>
      <p style="font-size: 15px; color: #334155; line-height: 1.6;">Hello ${escapeHtml(name || 'User')},</p>
      <p style="font-size: 15px; color: #334155; line-height: 1.6;">Your email address has been verified. You now have full access to all GoBanqo features.</p>
    `;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText: 'GoBanqo Account Services' }) };
};

exports.getLoginOtpTemplate = ({ otpCode }) => {
    const subject = `🔑 Your GoBanqo Verification Code: ${otpCode}`;
    const preheader = `Use security code ${otpCode} to log in. Code expires in 10 minutes.`;
    const contentHtml = `
      <h2 style="font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0;">Login Verification Code</h2>
      <p style="font-size: 15px; color: #334155; line-height: 1.6;">Please use the single-use code below to complete your authentication:</p>
      <div style="background-color: #f1f5f9; border: 2px dashed #cbd5e1; padding: 24px; text-align: center; border-radius: 8px; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: 800; color: #0f172a; letter-spacing: 6px; font-family: monospace;">${escapeHtml(otpCode)}</span>
      </div>
      <p style="font-size: 13px; color: #64748b;">This code is valid for 10 minutes. Never share your OTP code with anyone.</p>
    `;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText: 'GoBanqo Security Services' }) };
};

exports.getPasswordResetTemplate = ({ name, resetCode, resetUrl }) => {
    const subject = `🔒 Reset Your Password — GoBanqo`;
    const preheader = `Use code ${resetCode} or click below to reset your GoBanqo password.`;
    const contentHtml = `
      <h2 style="font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0;">Password Reset Request</h2>
      <p style="font-size: 15px; color: #334155; line-height: 1.6;">Hello ${escapeHtml(name || 'User')},</p>
      <p style="font-size: 15px; color: #334155; line-height: 1.6;">We received a request to reset the password for your GoBanqo account.</p>
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin: 20px 0;">
        <p style="margin: 0; font-size: 14px; color: #991b1b;">Verification Code: <strong>${escapeHtml(resetCode)}</strong></p>
      </div>
      <p style="font-size: 13px; color: #64748b;">If you didn't request a password reset, you can safely ignore this email.</p>
    `;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, actionUrl: resetUrl, actionText: 'Reset Password', footerText: 'GoBanqo Security Services' }) };
};

exports.getPasswordChangedTemplate = ({ name }) => {
    const subject = `⚠️ Security Notice: Password Changed — GoBanqo`;
    const preheader = `Your GoBanqo password was changed successfully.`;
    const contentHtml = `
      <h2 style="font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0;">Password Changed</h2>
      <p style="font-size: 15px; color: #334155; line-height: 1.6;">Hello ${escapeHtml(name || 'User')},</p>
      <p style="font-size: 15px; color: #334155; line-height: 1.6;">The password for your GoBanqo account was updated recently.</p>
      <p style="font-size: 14px; color: #dc2626;">If you did not initiate this security change, please contact support immediately.</p>
    `;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText: 'GoBanqo Security Services' }) };
};

// ==========================================
// TENANT MANAGEMENT TEMPLATES
// ==========================================

exports.getWelcomeTemplate = exports.getTenantCreatedTemplate = ({ tenantName, ownerName, propertyName, roomNumber, ownerContact, rentAmount, rentDueDay, leaseEndDate, rules }) => {
    const subject = `🎉 Welcome to ${propertyName} — GoBanqo`;
    const preheader = `Welcome aboard to ${propertyName}! Here are your tenancy details.`;

    const rulesHtml = rules && Array.isArray(rules) && rules.length > 0
        ? `<p style="margin: 12px 0 6px 0; font-weight: 600; color: #1e293b;">House Rules:</p><ul style="margin: 4px 0 0 20px; padding: 0; color: #475569;">${rules.map(r => `<li style="margin: 4px 0;">${escapeHtml(r)}</li>`).join('')}</ul>`
        : '';

    const contentHtml = `
    <h2 style="font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0;">Dear ${escapeHtml(tenantName)},</h2>
    <p style="font-size: 15px; color: #334155; line-height: 1.6;">We're excited to welcome you to <strong>${escapeHtml(propertyName)}</strong>! Here is a summary of your stay details:</p>
    
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 8px; margin: 24px 0;">
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Property:</strong> ${escapeHtml(propertyName)}</p>
      ${roomNumber ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Room / Bed:</strong> ${escapeHtml(roomNumber)}</p>` : ''}
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Monthly Rent:</strong> ${formatCurrency(rentAmount)}</p>
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Rent Due Day:</strong> ${rentDueDay ? `${rentDueDay}th of every month` : '1st of every month'}</p>
      ${leaseEndDate ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Lease End Date:</strong> ${escapeHtml(new Date(leaseEndDate).toLocaleDateString('en-IN'))}</p>` : ''}
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Property Owner / Manager:</strong> ${escapeHtml(ownerName)}</p>
      ${ownerContact ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Contact:</strong> ${escapeHtml(ownerContact)}</p>` : ''}
      ${rulesHtml}
    </div>

    <p style="font-size: 14px; color: #64748b; line-height: 1.5;">If you have any queries or maintenance needs, feel free to submit a request.</p>
    <p style="font-size: 14px; color: #334155; margin-top: 24px;">Welcome aboard,<br/><strong>${escapeHtml(propertyName)} Management</strong></p>
    `;

    const footerText = `Sent on behalf of ${escapeHtml(ownerName || propertyName)} via GoBanqo`;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText }) };
};

exports.getTenantAssignedTemplate = ({ tenantName, propertyName, roomNumber, bedNumber, moveInDate }) => {
    const subject = `🏠 Room Assigned — ${propertyName}`;
    const preheader = `You have been assigned Room ${roomNumber} at ${propertyName}.`;
    const contentHtml = `
      <h2 style="font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0;">Room Assignment Update</h2>
      <p style="font-size: 15px; color: #334155;">Dear <strong>${escapeHtml(tenantName)}</strong>,</p>
      <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 20px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Property:</strong> ${escapeHtml(propertyName)}</p>
        <p style="margin: 4px 0;"><strong>Room Number:</strong> ${escapeHtml(roomNumber)}</p>
        ${bedNumber ? `<p style="margin: 4px 0;"><strong>Bed Number:</strong> ${escapeHtml(bedNumber)}</p>` : ''}
        ${moveInDate ? `<p style="margin: 4px 0;"><strong>Move-in Date:</strong> ${escapeHtml(moveInDate)}</p>` : ''}
      </div>
    `;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText: `Sent via GoBanqo on behalf of ${escapeHtml(propertyName)}` }) };
};

exports.getTenantMovedTemplate = ({ tenantName, propertyName, oldRoom, newRoom }) => {
    const subject = `🔄 Room Relocation Notice — ${propertyName}`;
    const preheader = `Your room assignment has been updated from ${oldRoom} to ${newRoom}.`;
    const contentHtml = `
      <h2 style="font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0;">Room Transfer Details</h2>
      <p style="font-size: 15px; color: #334155;">Dear <strong>${escapeHtml(tenantName)}</strong>,</p>
      <p style="font-size: 15px; color: #334155;">Your room at <strong>${escapeHtml(propertyName)}</strong> has been updated:</p>
      <div style="background-color: #faf5ff; border: 1px solid #e9d5ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 4px 0; color: #6b21a8;"><strong>Previous Room:</strong> ${escapeHtml(oldRoom)}</p>
        <p style="margin: 4px 0; color: #6b21a8;"><strong>New Room:</strong> <span style="font-size: 16px; font-weight: 700;">${escapeHtml(newRoom)}</span></p>
      </div>
    `;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText: `Sent via GoBanqo` }) };
};

exports.getTenantCheckoutTemplate = ({ tenantName, propertyName, checkoutDate, refundStatus, pendingDues }) => {
    const subject = `📋 Checkout Summary — ${propertyName}`;
    const preheader = `Summary of your check-out from ${propertyName}.`;
    const contentHtml = `
      <h2 style="font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0;">Check-out Complete</h2>
      <p style="font-size: 15px; color: #334155;">Dear <strong>${escapeHtml(tenantName)}</strong>,</p>
      <p style="font-size: 15px; color: #334155;">Thank you for staying at <strong>${escapeHtml(propertyName)}</strong>. Here is your checkout summary:</p>
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Check-out Date:</strong> ${escapeHtml(checkoutDate)}</p>
        <p style="margin: 4px 0;"><strong>Pending Dues:</strong> ${formatCurrency(pendingDues || 0)}</p>
        ${refundStatus ? `<p style="margin: 4px 0;"><strong>Deposit Refund:</strong> ${escapeHtml(refundStatus)}</p>` : ''}
      </div>
    `;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText: `GoBanqo Tenancy Services` }) };
};

// ==========================================
// RENT REMINDERS & NOTICES
// ==========================================

exports.getRentReminderTemplate = ({ tenantName, ownerName, propertyName, roomNumber, rentAmount, dueDate }) => {
    const subject = `🔔 Rent Payment Reminder — ${propertyName}`;
    const preheader = `Your rent payment of ${formatCurrency(rentAmount)} for ${propertyName} is due.`;

    const contentHtml = `
    <h2 style="font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0;">Dear ${escapeHtml(tenantName)},</h2>
    <p style="font-size: 15px; color: #334155; line-height: 1.6;">This is a friendly reminder that your monthly rent payment is due soon.</p>
    
    <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 20px; border-radius: 6px; margin: 24px 0;">
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Property:</strong> ${escapeHtml(propertyName)}</p>
      ${roomNumber ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Room:</strong> ${escapeHtml(roomNumber)}</p>` : ''}
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Amount Due:</strong> <span style="font-size: 18px; font-weight: 700; color: #0284c7;">${formatCurrency(rentAmount)}</span></p>
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Due Date:</strong> ${escapeHtml(dueDate)}</p>
    </div>

    <p style="font-size: 14px; color: #64748b; line-height: 1.5;">Please make the payment on time to avoid any late fees.</p>
    <p style="font-size: 14px; color: #334155; margin-top: 24px;">Warm regards,<br/><strong>${escapeHtml(propertyName)} Management</strong></p>
    `;

    const footerText = `Sent on behalf of ${escapeHtml(ownerName || propertyName)} via GoBanqo`;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText }) };
};

exports.getRentDueTemplate = ({ tenantName, ownerName, propertyName, roomNumber, rentAmount, dueDate }) => {
    const subject = `🚨 Rent Payment Due Today — ${propertyName}`;
    const preheader = `Your rent payment of ${formatCurrency(rentAmount)} for ${propertyName} is due today.`;
    return exports.getRentReminderTemplate({ tenantName, ownerName, propertyName, roomNumber, rentAmount, dueDate });
};

exports.getOverdueReminderTemplate = ({ tenantName, ownerName, propertyName, roomNumber, rentAmount, dueDate }) => {
    const subject = `⚠️ Overdue Rent Notice — ${propertyName}`;
    const preheader = `Your rent payment of ${formatCurrency(rentAmount)} for ${propertyName} is overdue.`;

    const contentHtml = `
    <h2 style="font-size: 18px; font-weight: 600; color: #991b1b; margin-top: 0;">Dear ${escapeHtml(tenantName)},</h2>
    <p style="font-size: 15px; color: #334155; line-height: 1.6;">Our records show that your rent payment for <strong style="color: #dc2626;">${escapeHtml(propertyName)}</strong> is currently overdue.</p>
    
    <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 20px; border-radius: 6px; margin: 24px 0;">
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Property:</strong> ${escapeHtml(propertyName)}</p>
      ${roomNumber ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Room:</strong> ${escapeHtml(roomNumber)}</p>` : ''}
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Outstanding Amount:</strong> <span style="font-size: 18px; font-weight: 700; color: #dc2626;">${formatCurrency(rentAmount)}</span></p>
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Original Due Date:</strong> ${escapeHtml(dueDate)}</p>
    </div>

    <p style="font-size: 14px; color: #475569; line-height: 1.5;">Please clear this payment immediately to keep your account in good standing.</p>
    <p style="font-size: 14px; color: #334155; margin-top: 24px;">Regards,<br/><strong>${escapeHtml(propertyName)} Management</strong></p>
    `;

    const footerText = `Sent on behalf of ${escapeHtml(ownerName || propertyName)} via GoBanqo`;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText }) };
};

// ==========================================
// PAYMENT & RECEIPT TEMPLATES
// ==========================================

exports.getPaymentReceiptTemplate = exports.getPaymentReceivedTemplate = ({ tenantName, ownerName, propertyName, roomNumber, rentAmount, receiptNumber, paymentDate, paymentMode, monthStr }) => {
    const subject = `✅ Payment Receipt #${receiptNumber} — ${propertyName}`;
    const preheader = `Payment of ${formatCurrency(rentAmount)} received for ${propertyName}.`;

    const contentHtml = `
    <h2 style="font-size: 18px; font-weight: 600; color: #166534; margin-top: 0;">Payment Receipt</h2>
    <p style="font-size: 15px; color: #334155; line-height: 1.6;">Dear <strong>${escapeHtml(tenantName)}</strong>,</p>
    <p style="font-size: 15px; color: #334155; line-height: 1.6;">We have successfully received your rent payment. Details are below:</p>
    
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 8px; margin: 24px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #64748b;">Receipt No.</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${escapeHtml(receiptNumber)}</td></tr>
        ${monthStr ? `<tr><td style="padding: 6px 0; color: #64748b;">Period/Month</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${escapeHtml(monthStr)}</td></tr>` : ''}
        ${roomNumber ? `<tr><td style="padding: 6px 0; color: #64748b;">Room</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${escapeHtml(roomNumber)}</td></tr>` : ''}
        <tr><td style="padding: 6px 0; color: #64748b;">Property</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${escapeHtml(propertyName)}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Payment Mode</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b; text-transform: capitalize;">${escapeHtml(paymentMode)}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Payment Date</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${escapeHtml(paymentDate)}</td></tr>
        <tr style="border-top: 2px solid #bbf7d0;"><td style="padding: 12px 0; color: #0f172a; font-weight: 700; font-size: 16px;">Amount Paid</td><td style="padding: 12px 0; text-align: right; font-weight: 700; color: #166534; font-size: 20px;">${formatCurrency(rentAmount)}</td></tr>
      </table>
    </div>

    <p style="font-size: 13px; color: #94a3b8; text-align: center;">Keep this receipt for your financial records.</p>
    <p style="font-size: 14px; color: #334155; margin-top: 24px;">Thank you,<br/><strong>${escapeHtml(propertyName)} Management</strong></p>
    `;

    const footerText = `Sent on behalf of ${escapeHtml(ownerName || propertyName)} via GoBanqo`;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText }) };
};

exports.getPaymentFailedTemplate = ({ tenantName, propertyName, rentAmount, reason }) => {
    const subject = `❌ Payment Failed — ${propertyName}`;
    const preheader = `Transaction of ${formatCurrency(rentAmount)} failed for ${propertyName}.`;
    const contentHtml = `
      <h2 style="font-size: 18px; font-weight: 600; color: #991b1b; margin-top: 0;">Payment Transaction Failed</h2>
      <p style="font-size: 15px; color: #334155;">Dear <strong>${escapeHtml(tenantName)}</strong>,</p>
      <p style="font-size: 15px; color: #334155;">Your payment attempt of <strong>${formatCurrency(rentAmount)}</strong> for ${escapeHtml(propertyName)} could not be processed.</p>
      ${reason ? `<div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 6px; margin: 20px 0;"><p style="margin: 0; color: #991b1b; font-size: 14px;"><strong>Reason:</strong> ${escapeHtml(reason)}</p></div>` : ''}
      <p style="font-size: 14px; color: #475569;">Please try again or contact management for alternative payment methods.</p>
    `;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText: 'GoBanqo Billing Services' }) };
};

exports.getPaymentPendingTemplate = ({ tenantName, propertyName, rentAmount, paymentReference }) => {
    const subject = `⏳ Payment Processing — ${propertyName}`;
    const preheader = `Your payment of ${formatCurrency(rentAmount)} is currently processing.`;
    const contentHtml = `
      <h2 style="font-size: 18px; font-weight: 600; color: #d97706; margin-top: 0;">Payment Pending Verification</h2>
      <p style="font-size: 15px; color: #334155;">Dear <strong>${escapeHtml(tenantName)}</strong>,</p>
      <p style="font-size: 15px; color: #334155;">We have received your payment initiation of <strong>${formatCurrency(rentAmount)}</strong> for ${escapeHtml(propertyName)}.</p>
      ${paymentReference ? `<p style="font-size: 14px; color: #64748b;">Reference No: <strong>${escapeHtml(paymentReference)}</strong></p>` : ''}
    `;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText: 'GoBanqo Billing Services' }) };
};

// ==========================================
// MAINTENANCE / COMPLAINT TEMPLATES
// ==========================================

exports.getComplaintCreatedTemplate = exports.getTenantRequestAlertTemplate = ({ ownerName, tenantName, tenantEmail, tenantPhone, propertyName, roomNumber, requestTitle, requestType, visitDate, message }) => {
    const subject = `📥 New Complaint Alert: ${requestTitle || 'Tenant Request'} — ${propertyName}`;
    const preheader = `Tenant ${tenantName || 'Tenant'} submitted a maintenance request for ${propertyName}.`;

    const contentHtml = `
    <h2 style="font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0;">Hello ${escapeHtml(ownerName || 'Property Owner')},</h2>
    <p style="font-size: 15px; color: #334155; line-height: 1.6;">A new maintenance ticket has been registered for <strong>${escapeHtml(propertyName)}</strong>:</p>
    
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 24px 0;">
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Issue:</strong> ${escapeHtml(requestTitle)}</p>
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Category:</strong> ${escapeHtml(requestType || 'Maintenance')}</p>
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Tenant:</strong> ${escapeHtml(tenantName || tenantEmail || 'Tenant')}</p>
      ${roomNumber ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Room:</strong> ${escapeHtml(roomNumber)}</p>` : ''}
      ${tenantPhone ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Phone:</strong> ${escapeHtml(tenantPhone)}</p>` : ''}
      ${visitDate ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Preferred Visit:</strong> ${escapeHtml(visitDate)}</p>` : ''}
      ${message ? `<div style="margin-top: 14px; padding: 12px; background: #eff6ff; border-left: 3px solid #2563eb; border-radius: 4px;"><strong>Details:</strong><br/>${escapeHtml(message)}</div>` : ''}
    </div>

    <p style="font-size: 14px; color: #64748b;">Please log in to your GoBanqo owner dashboard to review and update this ticket.</p>
    `;

    const footerText = `GoBanqo Maintenance Ticket System`;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText }) };
};

exports.getComplaintUpdatedTemplate = ({ tenantName, propertyName, requestTitle, status, resolutionNotes }) => {
    const subject = `🔧 Maintenance Update: ${requestTitle} — ${status}`;
    const preheader = `Status updated to ${status} for your request at ${propertyName}.`;
    const contentHtml = `
      <h2 style="font-size: 18px; font-weight: 600; color: #0284c7; margin-top: 0;">Maintenance Status Update</h2>
      <p style="font-size: 15px; color: #334155;">Dear <strong>${escapeHtml(tenantName)}</strong>,</p>
      <p style="font-size: 15px; color: #334155;">The status of your maintenance request <strong>"${escapeHtml(requestTitle)}"</strong> has changed to <span style="font-weight: 700; color: #0284c7; text-transform: uppercase;">${escapeHtml(status)}</span>.</p>
      ${resolutionNotes ? `<div style="background-color: #f0f9ff; border: 1px solid #bae6fd; padding: 16px; border-radius: 6px; margin: 20px 0;"><p style="margin: 0; color: #0369a1; font-size: 14px;"><strong>Manager Notes:</strong> ${escapeHtml(resolutionNotes)}</p></div>` : ''}
    `;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText: `Sent on behalf of ${escapeHtml(propertyName)}` }) };
};

exports.getComplaintResolvedTemplate = ({ tenantName, propertyName, requestTitle }) => {
    const subject = `✅ Complaint Resolved: ${requestTitle}`;
    const preheader = `Your complaint at ${propertyName} has been marked as resolved.`;
    return exports.getComplaintUpdatedTemplate({ tenantName, propertyName, requestTitle, status: 'RESOLVED' });
};

// ==========================================
// SUBSCRIPTION & SYSTEM ALERTS
// ==========================================

exports.getPlanChangedTemplate = ({ ownerName, planName, propertyLimit }) => {
    const subject = `🚀 GoBanqo Subscription Plan Updated: ${planName}`;
    const preheader = `Your subscription has been updated to ${planName}.`;
    const contentHtml = `
      <h2 style="font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0;">Subscription Plan Updated</h2>
      <p style="font-size: 15px; color: #334155;">Hello <strong>${escapeHtml(ownerName)}</strong>,</p>
      <p style="font-size: 15px; color: #334155;">Your GoBanqo subscription has been updated to <strong>${escapeHtml(planName)}</strong>.</p>
      <p style="font-size: 14px; color: #475569;">Property Limit: <strong>${propertyLimit || 'Unlimited'}</strong></p>
    `;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText: 'GoBanqo Subscription Services' }) };
};

exports.getTrialEndingTemplate = ({ ownerName, daysRemaining, upgradeUrl }) => {
    const subject = `⏳ Your GoBanqo Free Trial Ends in ${daysRemaining} Days`;
    const preheader = `Upgrade to keep uninterrupted property management features.`;
    const contentHtml = `
      <h2 style="font-size: 18px; font-weight: 600; color: #d97706; margin-top: 0;">Free Trial Expiration Reminder</h2>
      <p style="font-size: 15px; color: #334155;">Hello <strong>${escapeHtml(ownerName)}</strong>,</p>
      <p style="font-size: 15px; color: #334155;">Your 30-day GoBanqo free trial will end in <strong style="color: #d97706;">${daysRemaining} days</strong>.</p>
      <p style="font-size: 14px; color: #475569;">Upgrade now to ensure zero disruption to your tenant reminders, billing receipts, and analytics.</p>
    `;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, actionUrl: upgradeUrl, actionText: 'Upgrade Plan Now', footerText: 'GoBanqo Subscription Services' }) };
};

exports.getBroadcastTemplate = exports.getSystemAlertTemplate = ({ ownerName, propertyName, customSubject, message }) => {
    const subject = customSubject ? `📢 Notice from ${propertyName}: ${customSubject}` : `📢 System Alert — ${propertyName}`;
    const preheader = `Important notice from ${propertyName} management.`;

    const contentHtml = `
    <h2 style="font-size: 18px; font-weight: 600; color: #0369a1; margin-top: 0;">Notice from ${escapeHtml(propertyName || 'Management')}</h2>
    <div style="font-size: 15px; color: #334155; line-height: 1.7; white-space: pre-wrap; margin: 20px 0; padding: 16px; background-color: #f0f9ff; border-radius: 8px;">${escapeHtml(message)}</div>
    <p style="font-size: 14px; color: #334155; margin-top: 24px;">Regards,<br/><strong>${escapeHtml(ownerName || 'Property Management')}</strong><br/>${escapeHtml(propertyName || '')}</p>
    `;

    const footerText = `Sent on behalf of ${escapeHtml(ownerName || propertyName)} via GoBanqo`;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText }) };
};

exports.getOwnerDailySummaryTemplate = ({ ownerName, totalProperties, activeTenants, collectedRentMonth, pendingComplaints }) => {
    const subject = `📊 GoBanqo Daily Summary Report`;
    const preheader = `Daily snapshot: ${activeTenants} active tenants across ${totalProperties} properties.`;
    const contentHtml = `
      <h2 style="font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0;">Daily Portfolio Summary</h2>
      <p style="font-size: 15px; color: #334155;">Good morning <strong>${escapeHtml(ownerName)}</strong>,</p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 6px 0;">Active Properties</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${totalProperties}</td></tr>
          <tr><td style="padding: 6px 0;">Active Tenants</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${activeTenants}</td></tr>
          <tr><td style="padding: 6px 0;">Rent Collected This Month</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #166534;">${formatCurrency(collectedRentMonth)}</td></tr>
          <tr><td style="padding: 6px 0;">Open Complaints</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #dc2626;">${pendingComplaints}</td></tr>
        </table>
      </div>
    `;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText: 'GoBanqo Owner Digest' }) };
};
