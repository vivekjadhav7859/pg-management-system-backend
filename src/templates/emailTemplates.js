/**
 * Modular email templates for GoBanqo transactional notifications.
 */

const { renderLayout } = require('./templateRenderer');

const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatCurrency = (amount = 0) => `₹${Number(amount).toLocaleString('en-IN')}`;

/**
 * Rent Payment Reminder
 */
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

    <p style="font-size: 14px; color: #64748b; line-height: 1.5;">Please make the payment on time to avoid any late convenience fees.</p>
    <p style="font-size: 14px; color: #334155; margin-top: 24px;">Warm regards,<br/><strong>${escapeHtml(propertyName)} Management</strong></p>
    `;

    const footerText = `Sent on behalf of ${escapeHtml(ownerName || propertyName)} via GoBanqo`;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText }) };
};

/**
 * Overdue Rent Reminder
 */
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

/**
 * Payment Receipt
 */
exports.getPaymentReceiptTemplate = ({ tenantName, ownerName, propertyName, roomNumber, rentAmount, receiptNumber, paymentDate, paymentMode, monthStr }) => {
    const subject = `✅ Payment Receipt #${receiptNumber} — ${propertyName}`;
    const preheader = `Payment of ${formatCurrency(rentAmount)} received for ${propertyName}.`;

    const contentHtml = `
    <h2 style="font-size: 18px; font-weight: 600; color: #166534; margin-top: 0;">Payment Receipt</h2>
    <p style="font-size: 15px; color: #334155; line-height: 1.6;">Dear <strong>${escapeHtml(tenantName)}</strong>,</p>
    <p style="font-size: 15px; color: #334155; line-height: 1.6;">We have successfully received your rent payment. Details are below:</p>
    
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 8px; margin: 24px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #64748b;">Receipt No.</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${escapeHtml(receiptNumber)}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Period/Month</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${escapeHtml(monthStr)}</td></tr>
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

/**
 * Welcome Email
 */
exports.getWelcomeTemplate = ({ tenantName, ownerName, propertyName, ownerContact, rentAmount, rentDueDay, leaseEndDate, rules }) => {
    const subject = `🎉 Welcome to ${propertyName} — GoBanqo`;
    const preheader = `Welcome aboard to ${propertyName}! Here are your tenancy details.`;

    const rulesHtml = rules && rules.length
        ? `<p style="margin: 12px 0 6px 0; font-weight: 600; color: #1e293b;">House Rules:</p><ul style="margin: 4px 0 0 20px; padding: 0; color: #475569;">${rules.map(r => `<li style="margin: 4px 0;">${escapeHtml(r)}</li>`).join('')}</ul>`
        : '';

    const html = `
    <h2 style="font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0;">Dear ${escapeHtml(tenantName)},</h2>
    <p style="font-size: 15px; color: #334155; line-height: 1.6;">We're excited to welcome you to <strong>${escapeHtml(propertyName)}</strong>! Here is a summary of your stay details:</p>
    
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 8px; margin: 24px 0;">
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Property:</strong> ${escapeHtml(propertyName)}</p>
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Monthly Rent:</strong> ${formatCurrency(rentAmount)}</p>
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Rent Due Day:</strong> ${rentDueDay ? `${rentDueDay}th of every month` : '1st of every month'}</p>
      ${leaseEndDate ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Lease End Date:</strong> ${escapeHtml(new Date(leaseEndDate).toLocaleDateString('en-IN'))}</p>` : ''}
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Property Owner / Manager:</strong> ${escapeHtml(ownerName)}</p>
      ${ownerContact ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Contact:</strong> ${escapeHtml(ownerContact)}</p>` : ''}
      ${rulesHtml}
    </div>

    <p style="font-size: 14px; color: #64748b; line-height: 1.5;">If you have any queries or maintenance needs, please feel free to reach out.</p>
    <p style="font-size: 14px; color: #334155; margin-top: 24px;">Welcome aboard,<br/><strong>${escapeHtml(propertyName)} Management</strong></p>
    `;

    const footerText = `Sent on behalf of ${escapeHtml(ownerName || propertyName)} via GoBanqo`;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText }) };
};

/**
 * Tenant Request Alert (to Owner)
 */
exports.getTenantRequestAlertTemplate = ({ ownerName, tenantName, tenantEmail, tenantPhone, propertyName, roomNumber, requestTitle, requestType, visitDate, message }) => {
    const subject = `📥 New Request: ${requestTitle} — ${propertyName}`;
    const preheader = `Tenant ${tenantName || 'Tenant'} submitted a request for ${propertyName}.`;

    const contentHtml = `
    <h2 style="font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0;">Hello ${escapeHtml(ownerName || 'Property Owner')},</h2>
    <p style="font-size: 15px; color: #334155; line-height: 1.6;">You have received a new tenant request for <strong>${escapeHtml(propertyName)}</strong>:</p>
    
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 24px 0;">
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Request Title:</strong> ${escapeHtml(requestTitle)}</p>
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Category:</strong> ${escapeHtml(requestType || requestTitle)}</p>
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Tenant:</strong> ${escapeHtml(tenantName || tenantEmail || 'Tenant')}</p>
      ${roomNumber ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Room:</strong> ${escapeHtml(roomNumber)}</p>` : ''}
      ${tenantPhone ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Phone:</strong> ${escapeHtml(tenantPhone)}</p>` : ''}
      ${visitDate ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Preferred Date:</strong> ${escapeHtml(visitDate)}</p>` : ''}
      ${message ? `<div style="margin-top: 14px; padding: 12px; background: #eff6ff; border-left: 3px solid #2563eb; border-radius: 4px;"><strong>Message:</strong><br/>${escapeHtml(message)}</div>` : ''}
    </div>

    <p style="font-size: 14px; color: #64748b;">Please log in to your GoBanqo dashboard to update or resolve this request.</p>
    `;

    const footerText = `GoBanqo Property Owner Alert Services`;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText }) };
};

/**
 * Broadcast Notice
 */
exports.getBroadcastTemplate = ({ ownerName, propertyName, customSubject, message }) => {
    const subject = `📢 Notice from ${propertyName}: ${customSubject}`;
    const preheader = `Important notice from ${propertyName} management.`;

    const contentHtml = `
    <h2 style="font-size: 18px; font-weight: 600; color: #0369a1; margin-top: 0;">Notice from ${escapeHtml(propertyName)}</h2>
    <div style="font-size: 15px; color: #334155; line-height: 1.7; white-space: pre-wrap; margin: 20px 0; padding: 16px; background-color: #f0f9ff; border-radius: 8px;">${escapeHtml(message)}</div>
    <p style="font-size: 14px; color: #334155; margin-top: 24px;">Regards,<br/><strong>${escapeHtml(ownerName || 'Property Management')}</strong><br/>${escapeHtml(propertyName)}</p>
    `;

    const footerText = `Sent on behalf of ${escapeHtml(ownerName || propertyName)} via GoBanqo`;
    return { subject, html: renderLayout({ title: subject, preheader, contentHtml, footerText }) };
};
