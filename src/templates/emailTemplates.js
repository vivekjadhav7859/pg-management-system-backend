/**
 * Modular enterprise email templates for GoBanqo transactional notifications.
 * Supports all system events across Auth, Tenant, Rent, Payment, Maintenance, Property, and Subscription modules.
 * Tailored with GoBanqo's signature brand theme (Dark Slate, Indigo Accent, Gold/Green Alerts).
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
    const subject = `🎉 Welcome to GoBanqo — Account Created Successfully`;
    const preheader = `Your GoBanqo property management account is ready. Explore your dashboard today.`;
    const contentHtml = `
      <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Welcome to GoBanqo, ${escapeHtml(name || 'Partner')}!</h2>
      <p style="font-size: 15px; color: #334155; line-height: 1.6;">
        Your property management account associated with <strong>${escapeHtml(email)}</strong> has been initialized successfully.
      </p>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #16a34a; padding: 20px; border-radius: 8px; margin: 24px 0;">
        <h3 style="margin: 0 0 10px 0; font-size: 15px; font-weight: 600; color: #0f172a;">What's next?</h3>
        <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 14px; line-height: 1.6;">
          <li>Add and configure your PG/Hostel properties, floors, and rooms.</li>
          <li>Onboard tenants digitally with password-free secure activation links.</li>
          <li>Track automated rent reminders, payments, deposits, and digital receipts.</li>
          <li>Manage tenant complaints and maintenance tickets in real time.</li>
        </ul>
      </div>

      <p style="font-size: 14px; color: #64748b; line-height: 1.5;">
        If you have any questions or need onboarding assistance, our support team is available 24/7.
      </p>
    `;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            actionUrl: dashboardUrl || 'https://gobanqo.com/login', 
            actionText: 'Access Your Dashboard', 
            footerText: 'GoBanqo Account & Security Platform' 
        }) 
    };
};

exports.getEmailVerifiedTemplate = ({ name }) => {
    const subject = `✅ Email Verified — GoBanqo Identity System`;
    const preheader = `Your email address has been verified successfully. Full platform features unlocked.`;
    const contentHtml = `
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="font-size: 40px; display: inline-block; background: #dcfce7; color: #166534; padding: 12px 20px; border-radius: 50%;">✓</span>
      </div>
      <h2 style="font-size: 20px; font-weight: 700; color: #166534; margin-top: 0; text-align: center;">Email Verification Successful</h2>
      <p style="font-size: 15px; color: #334155; line-height: 1.6; text-align: center;">
        Hello <strong>${escapeHtml(name || 'User')}</strong>,
      </p>
      <p style="font-size: 15px; color: #334155; line-height: 1.6;">
        Your email address has been verified successfully. Your GoBanqo account is active and completely secured.
      </p>
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 8px; margin: 24px 0; text-align: center;">
        <p style="margin: 0; font-size: 14px; color: #166534; font-weight: 600;">
          🔒 All security flags cleared. You can now access your full tenant/owner workspace.
        </p>
      </div>
    `;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            actionUrl: 'https://gobanqo.com/login', 
            actionText: 'Log In Now', 
            footerText: 'GoBanqo Identity Services' 
        }) 
    };
};

exports.getLoginOtpTemplate = ({ otpCode }) => {
    const subject = `🔑 ${otpCode} is your GoBanqo Verification Code`;
    const preheader = `Use security code ${otpCode} to log in. This single-use code expires in 10 minutes.`;
    const contentHtml = `
      <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Login Verification Code</h2>
      <p style="font-size: 15px; color: #334155; line-height: 1.6;">
        Please use the single-use verification code below to authorize your session:
      </p>
      
      <div style="background-color: #f1f5f9; border: 2px dashed #cbd5e1; padding: 24px; text-align: center; border-radius: 12px; margin: 28px 0;">
        <span style="font-size: 36px; font-weight: 800; color: #16a34a; letter-spacing: 8px; font-family: 'Courier New', Courier, monospace;">${escapeHtml(otpCode)}</span>
      </div>

      <div style="background-color: #fffbeb; border: 1px solid #fef3c7; padding: 14px; border-radius: 6px; margin-bottom: 20px;">
        <p style="margin: 0; font-size: 13px; color: #92400e; text-align: center;">
          ⏰ Code expires in <strong>10 minutes</strong>. Never share your security code or password with anyone.
        </p>
      </div>

      <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
        If you did not request this login code, please secure your account or notify GoBanqo Security immediately.
      </p>
    `;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            footerText: 'GoBanqo Security Platform' 
        }) 
    };
};

exports.getPasswordResetTemplate = ({ name, resetCode, resetUrl }) => {
    const subject = `🔒 Reset Your Password — GoBanqo Security`;
    const preheader = `Use code ${resetCode} or click the reset link to choose a new GoBanqo password.`;
    const contentHtml = `
      <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Password Reset Request</h2>
      <p style="font-size: 15px; color: #334155; line-height: 1.6;">Hello <strong>${escapeHtml(name || 'User')}</strong>,</p>
      <p style="font-size: 15px; color: #334155; line-height: 1.6;">
        We received a request to reset the password for your GoBanqo account.
      </p>
      
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 18px; border-radius: 6px; margin: 24px 0;">
        <p style="margin: 0; font-size: 14px; color: #991b1b;">
          Verification Code: <strong style="font-size: 18px; font-family: monospace; letter-spacing: 2px;">${escapeHtml(resetCode)}</strong>
        </p>
      </div>

      <p style="font-size: 14px; color: #334155; line-height: 1.6;">
        Click the button below to choose your new password. This single-use reset link expires in 30 minutes.
      </p>
    `;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            actionUrl: resetUrl, 
            actionText: 'Reset Password Now', 
            footerText: 'GoBanqo Security Platform' 
        }) 
    };
};

exports.getPasswordChangedTemplate = ({ name }) => {
    const subject = `⚠️ Security Alert: GoBanqo Password Updated`;
    const preheader = `The password for your GoBanqo account was updated recently.`;
    const contentHtml = `
      <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Password Changed</h2>
      <p style="font-size: 15px; color: #334155; line-height: 1.6;">Hello <strong>${escapeHtml(name || 'User')}</strong>,</p>
      <p style="font-size: 15px; color: #334155; line-height: 1.6;">
        This is a security notice confirming that the password for your GoBanqo account was successfully updated.
      </p>
      
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 8px; margin: 24px 0;">
        <p style="margin: 0; font-size: 13px; color: #dc2626; font-weight: 600;">
          🚨 Didn't perform this action? If you did not update your password, please contact support immediately to lock your account.
        </p>
      </div>
    `;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            actionUrl: 'https://gobanqo.com/support', 
            actionText: 'Contact Support', 
            footerText: 'GoBanqo Security Platform' 
        }) 
    };
};

// ==========================================
// TENANT MANAGEMENT & ONBOARDING TEMPLATES
// ==========================================

exports.getTenantInvitationTemplate = ({ tenantName, ownerName, propertyName, roomNumber, bedNumber, rentAmount, activationUrl, expiresHours = 2160, frontendUrl }) => {
    const baseFrontend = frontendUrl || process.env.FRONTEND_URL || 'https://gobanqo.com';
    const targetActionUrl = activationUrl || `${baseFrontend}/activate`;
    const displayOwnerName = ownerName || propertyName || 'Property Owner';

    const subject = `🎉 Activate Your Account & Complete Profile — Welcome to ${propertyName} on GoBanqo`;
    const preheader = `You've been added to ${propertyName} by ${displayOwnerName}. Activate your account to set up your password and complete your resident profile.`;

    const expireText = expiresHours >= 720 ? '3 months (90 days)' : `${expiresHours} hours`;

    const contentHtml = `
    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Welcome, ${escapeHtml(tenantName || 'Tenant')}!</h2>
    <p style="font-size: 15px; color: #334155; line-height: 1.6;">
        <strong>${escapeHtml(displayOwnerName)}</strong> has added you as a resident at <strong>${escapeHtml(propertyName)}</strong> on GoBanqo.
    </p>
    
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #16a34a; padding: 20px; border-radius: 8px; margin: 24px 0;">
      <h3 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 700; color: #0f172a;">Tenancy Summary</h3>
      <p style="margin: 6px 0; font-size: 14px; color: #334155;"><strong>Property:</strong> ${escapeHtml(propertyName)}</p>
      ${roomNumber ? `<p style="margin: 6px 0; font-size: 14px; color: #334155;"><strong>Room:</strong> ${escapeHtml(roomNumber)} ${bedNumber ? `(Bed ${escapeHtml(bedNumber)})` : ''}</p>` : ''}
      ${rentAmount ? `<p style="margin: 6px 0; font-size: 14px; color: #334155;"><strong>Monthly Rent:</strong> ${formatCurrency(rentAmount)}</p>` : ''}
      <p style="margin: 6px 0; font-size: 14px; color: #334155;"><strong>Owner / Manager:</strong> ${escapeHtml(displayOwnerName)}</p>
    </div>

    <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-bottom: 20px;">
        To activate your account, verify your email address, and complete your resident profile details, click the button or link below:
    </p>

    <!-- Prominent Button & Direct Link Fallback Inline -->
    <div style="text-align: center; margin: 24px 0; padding: 20px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;">
      <a href="${targetActionUrl}" target="_blank" style="background-color: #16a34a; background-image: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: #ffffff; display: inline-block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 700; line-height: 48px; text-align: center; text-decoration: none; padding: 0 32px; min-width: 220px; border-radius: 8px; box-shadow: 0 4px 14px rgba(22, 163, 74, 0.35);">
        Activate Account & Complete Profile
      </a>
      <p style="font-size: 13px; color: #334155; margin: 16px 0 0 0; word-break: break-all; line-height: 1.5;">
        Direct Profile Completion Link:<br/>
        <a href="${targetActionUrl}" target="_blank" style="color: #16a34a; text-decoration: underline; font-weight: 600;">${targetActionUrl}</a>
      </p>
    </div>

    <div style="background-color: #fffbeb; border: 1px solid #fef3c7; padding: 14px; border-radius: 6px; margin: 24px 0;">
      <p style="margin: 0; font-size: 13px; color: #92400e; text-align: center;">
        ⏰ <strong>Security Notice:</strong> This single-use activation link will remain valid for <strong>${expireText}</strong>. GoBanqo will never email passwords.
      </p>
    </div>
    `;

    return {
        subject,
        html: renderLayout({
            title: subject,
            preheader,
            contentHtml,
            actionUrl: targetActionUrl,
            actionText: 'Activate Account & Complete Profile',
            footerText: `Sent on behalf of ${escapeHtml(displayOwnerName)} via GoBanqo Identity Platform`
        })
    };
};

exports.getWelcomeTemplate = exports.getTenantCreatedTemplate = ({
    tenantName,
    ownerName,
    propertyName,
    roomNumber,
    bedNumber,
    ownerContact,
    rentAmount,
    rentDueDay,
    leaseEndDate,
    rules,
    activationUrl,
    loginUrl,
    onboardingUrl,
    frontendUrl
}) => {
    const subject = `🎉 Welcome to ${propertyName} — GoBanqo`;
    const preheader = `Welcome aboard to ${propertyName}! Here are your residency and room details.`;

    const baseFrontend = frontendUrl || process.env.FRONTEND_URL || 'https://gobanqo.com';
    const targetActionUrl = activationUrl || onboardingUrl || loginUrl || `${baseFrontend}/login`;
    const actionBtnText = (activationUrl || onboardingUrl) ? 'Activate Account & Set Password' : 'Log In to Tenant App';

    const rulesHtml = rules && Array.isArray(rules) && rules.length > 0
        ? `<p style="margin: 12px 0 6px 0; font-weight: 700; color: #1e293b;">House Rules:</p><ul style="margin: 4px 0 0 20px; padding: 0; color: #475569;">${rules.map(r => `<li style="margin: 4px 0;">${escapeHtml(r)}</li>`).join('')}</ul>`
        : '';

    const contentHtml = `
    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Welcome, ${escapeHtml(tenantName)}!</h2>
    <p style="font-size: 15px; color: #334155; line-height: 1.6;">We're excited to welcome you to <strong>${escapeHtml(propertyName)}</strong>. Below is a summary of your tenancy configuration:</p>
    
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #16a34a; padding: 20px; border-radius: 8px; margin: 24px 0;">
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Property:</strong> ${escapeHtml(propertyName)}</p>
      ${roomNumber ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Room / Bed:</strong> Room ${escapeHtml(roomNumber)} ${bedNumber ? `(Bed ${escapeHtml(bedNumber)})` : ''}</p>` : ''}
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Monthly Rent:</strong> ${formatCurrency(rentAmount)}</p>
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Rent Due Schedule:</strong> ${rentDueDay ? `${rentDueDay}th of every month` : '1st of every month'}</p>
      ${leaseEndDate ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Lease End Date:</strong> ${escapeHtml(new Date(leaseEndDate).toLocaleDateString('en-IN'))}</p>` : ''}
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Property Manager:</strong> ${escapeHtml(ownerName)}</p>
      ${ownerContact ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Contact Phone:</strong> ${escapeHtml(ownerContact)}</p>` : ''}
      ${rulesHtml}
    </div>

    ${(activationUrl || onboardingUrl) ? `
    <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-left: 4px solid #2563eb; padding: 16px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #1e3a8a; font-weight: 600;">
        🔑 First time logging in? Click the button below to activate your account and choose your password.
      </p>
    </div>
    ` : `
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #16a34a; padding: 16px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #14532d; font-weight: 600;">
        📱 You can log in anytime using your registered email address to access rent details, receipts, and maintenance support.
      </p>
    </div>
    `}

    <p style="font-size: 14px; color: #64748b; line-height: 1.5;">You can track rent payments, download receipts, and log maintenance tickets through your Tenant PWA.</p>
    <p style="font-size: 14px; color: #334155; margin-top: 24px;">Warm regards,<br/><strong>${escapeHtml(propertyName)} Management</strong></p>
    `;

    const footerText = `Sent on behalf of ${escapeHtml(ownerName || propertyName)} via GoBanqo`;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            actionUrl: targetActionUrl, 
            actionText: actionBtnText, 
            footerText 
        }) 
    };
};

exports.getTenantAssignedTemplate = ({ tenantName, propertyName, roomNumber, bedNumber, moveInDate, loginUrl, frontendUrl }) => {
    const baseFrontend = frontendUrl || process.env.FRONTEND_URL || 'https://gobanqo.com';
    const targetActionUrl = loginUrl || `${baseFrontend}/login`;

    const subject = `🏠 Room Allocation Confirmed — ${propertyName}`;
    const preheader = `You have been assigned Room ${roomNumber} at ${propertyName}.`;
    const contentHtml = `
      <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Room Allocation Update</h2>
      <p style="font-size: 15px; color: #334155;">Dear <strong>${escapeHtml(tenantName)}</strong>,</p>
      <p style="font-size: 15px; color: #334155;">Your room allocation details for <strong>${escapeHtml(propertyName)}</strong> have been finalized:</p>
      
      <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-left: 4px solid #0284c7; padding: 20px; border-radius: 8px; margin: 24px 0;">
        <p style="margin: 6px 0; font-size: 14px; color: #0f172a;"><strong>Property:</strong> ${escapeHtml(propertyName)}</p>
        <p style="margin: 6px 0; font-size: 14px; color: #0f172a;"><strong>Room Number:</strong> ${escapeHtml(roomNumber)}</p>
        ${bedNumber ? `<p style="margin: 6px 0; font-size: 14px; color: #0f172a;"><strong>Bed Allocation:</strong> Bed ${escapeHtml(bedNumber)}</p>` : ''}
        ${moveInDate ? `<p style="margin: 6px 0; font-size: 14px; color: #0f172a;"><strong>Move-in Date:</strong> ${escapeHtml(moveInDate)}</p>` : ''}
      </div>
    `;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            actionUrl: targetActionUrl, 
            actionText: 'Log In to Tenant App', 
            footerText: `Sent via GoBanqo on behalf of ${escapeHtml(propertyName)}` 
        }) 
    };
};

exports.getTenantMovedTemplate = ({ tenantName, propertyName, oldRoom, newRoom }) => {
    const subject = `🔄 Room Relocation Notice — ${propertyName}`;
    const preheader = `Your room assignment has been updated from ${oldRoom} to ${newRoom}.`;
    const contentHtml = `
      <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Room Migration Notice</h2>
      <p style="font-size: 15px; color: #334155;">Dear <strong>${escapeHtml(tenantName)}</strong>,</p>
      <p style="font-size: 15px; color: #334155;">Your room assignment at <strong>${escapeHtml(propertyName)}</strong> has been updated:</p>
      
      <div style="background-color: #faf5ff; border: 1px solid #e9d5ff; border-left: 4px solid #8b5cf6; padding: 20px; border-radius: 8px; margin: 24px 0;">
        <p style="margin: 6px 0; color: #6b21a8; font-size: 14px;"><strong>Previous Room:</strong> ${escapeHtml(oldRoom)}</p>
        <p style="margin: 6px 0; color: #6b21a8; font-size: 14px;"><strong>New Assigned Room:</strong> <span style="font-size: 16px; font-weight: 800;">${escapeHtml(newRoom)}</span></p>
      </div>

      <p style="font-size: 14px; color: #64748b;">Please coordinate with management regarding key handover and room inspection.</p>
    `;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            footerText: `Sent on behalf of ${escapeHtml(propertyName)} via GoBanqo` 
        }) 
    };
};

exports.getTenantCheckoutTemplate = ({ tenantName, propertyName, checkoutDate, refundStatus, pendingDues }) => {
    const subject = `📋 Checkout Summary & Settlement — ${propertyName}`;
    const preheader = `Summary of your check-out and final settlement from ${propertyName}.`;
    const contentHtml = `
      <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Check-out Complete</h2>
      <p style="font-size: 15px; color: #334155;">Dear <strong>${escapeHtml(tenantName)}</strong>,</p>
      <p style="font-size: 15px; color: #334155;">Thank you for staying at <strong>${escapeHtml(propertyName)}</strong>. Here is your checkout summary:</p>
      
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #475569; padding: 20px; border-radius: 8px; margin: 24px 0;">
        <p style="margin: 6px 0; font-size: 14px; color: #0f172a;"><strong>Check-out Date:</strong> ${escapeHtml(checkoutDate)}</p>
        <p style="margin: 6px 0; font-size: 14px; color: #0f172a;"><strong>Pending Dues:</strong> ${formatCurrency(pendingDues || 0)}</p>
        ${refundStatus ? `<p style="margin: 6px 0; font-size: 14px; color: #0f172a;"><strong>Security Deposit Status:</strong> ${escapeHtml(refundStatus)}</p>` : ''}
      </div>
      <p style="font-size: 13px; color: #64748b;">Your stay history has been archived safely in your GoBanqo profile.</p>
    `;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            footerText: `GoBanqo Tenancy Services` 
        }) 
    };
};

// ==========================================
// RENT REMINDERS & NOTICES
// ==========================================

exports.getRentReminderTemplate = ({ tenantName, ownerName, propertyName, roomNumber, rentAmount, dueDate }) => {
    const subject = `🔔 Rent Payment Reminder — ${propertyName}`;
    const preheader = `Friendly reminder: Monthly rent of ${formatCurrency(rentAmount)} for ${propertyName} is due on ${dueDate}.`;

    const contentHtml = `
    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Dear ${escapeHtml(tenantName)},</h2>
    <p style="font-size: 15px; color: #334155; line-height: 1.6;">This is a friendly reminder that your upcoming rent payment for <strong>${escapeHtml(propertyName)}</strong> is scheduled soon.</p>
    
    <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-left: 4px solid #0284c7; padding: 20px; border-radius: 8px; margin: 24px 0;">
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Property:</strong> ${escapeHtml(propertyName)}</p>
      ${roomNumber ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Room / Unit:</strong> ${escapeHtml(roomNumber)}</p>` : ''}
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Amount Due:</strong> <span style="font-size: 18px; font-weight: 800; color: #0284c7;">${formatCurrency(rentAmount)}</span></p>
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Due Date:</strong> ${escapeHtml(dueDate)}</p>
    </div>

    <p style="font-size: 14px; color: #64748b; line-height: 1.5;">Please process payment on or before the due date to ensure continuous seamless occupancy.</p>
    <p style="font-size: 14px; color: #334155; margin-top: 24px;">Warm regards,<br/><strong>${escapeHtml(propertyName)} Management</strong></p>
    `;

    const footerText = `Sent on behalf of ${escapeHtml(ownerName || propertyName)} via GoBanqo`;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            actionUrl: 'https://gobanqo.com/tenant/dashboard', 
            actionText: 'Pay Rent / View Details', 
            footerText 
        }) 
    };
};

exports.getRentDueTemplate = ({ tenantName, ownerName, propertyName, roomNumber, rentAmount, dueDate }) => {
    const subject = `🚨 Rent Payment Due Today — ${propertyName}`;
    const preheader = `Your monthly rent of ${formatCurrency(rentAmount)} for ${propertyName} is due today (${dueDate}).`;
    return exports.getRentReminderTemplate({ tenantName, ownerName, propertyName, roomNumber, rentAmount, dueDate });
};

exports.getOverdueReminderTemplate = ({ tenantName, ownerName, propertyName, roomNumber, rentAmount, dueDate }) => {
    const subject = `⚠️ Overdue Rent Notice — ${propertyName}`;
    const preheader = `Urgent: Outstanding rent of ${formatCurrency(rentAmount)} for ${propertyName} is overdue.`;

    const contentHtml = `
    <h2 style="font-size: 20px; font-weight: 700; color: #991b1b; margin-top: 0;">Dear ${escapeHtml(tenantName)},</h2>
    <p style="font-size: 15px; color: #334155; line-height: 1.6;">Our records indicate that your rent payment for <strong style="color: #dc2626;">${escapeHtml(propertyName)}</strong> is currently overdue.</p>
    
    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; padding: 20px; border-radius: 8px; margin: 24px 0;">
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Property:</strong> ${escapeHtml(propertyName)}</p>
      ${roomNumber ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Room:</strong> ${escapeHtml(roomNumber)}</p>` : ''}
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Outstanding Amount:</strong> <span style="font-size: 20px; font-weight: 800; color: #dc2626;">${formatCurrency(rentAmount)}</span></p>
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Original Due Date:</strong> ${escapeHtml(dueDate)}</p>
    </div>

    <p style="font-size: 14px; color: #475569; line-height: 1.5;">Please settle this payment immediately to prevent late penalty surcharges.</p>
    <p style="font-size: 14px; color: #334155; margin-top: 24px;">Regards,<br/><strong>${escapeHtml(propertyName)} Management</strong></p>
    `;

    const footerText = `Sent on behalf of ${escapeHtml(ownerName || propertyName)} via GoBanqo`;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            actionUrl: 'https://gobanqo.com/tenant/dashboard', 
            actionText: 'Settle Payment Now', 
            footerText 
        }) 
    };
};

// ==========================================
// PAYMENT & RECEIPT TEMPLATES
// ==========================================

exports.getPaymentReceiptTemplate = exports.getPaymentReceivedTemplate = ({ tenantName, ownerName, propertyName, roomNumber, rentAmount, receiptNumber, paymentDate, paymentMode, monthStr }) => {
    const subject = `✅ Rent Receipt #${receiptNumber} — ${propertyName}`;
    const preheader = `Payment receipt for ${formatCurrency(rentAmount)} received for ${propertyName}.`;

    const contentHtml = `
    <div style="text-align: center; margin-bottom: 16px;">
      <span style="font-size: 12px; font-weight: 700; background: #dcfce7; color: #166534; padding: 4px 12px; border-radius: 12px; text-transform: uppercase;">Payment Confirmed</span>
    </div>
    <h2 style="font-size: 20px; font-weight: 700; color: #166534; margin-top: 0; text-align: center;">Official Rent Receipt</h2>
    <p style="font-size: 15px; color: #334155; line-height: 1.6;">Dear <strong>${escapeHtml(tenantName)}</strong>,</p>
    <p style="font-size: 15px; color: #334155; line-height: 1.6;">We have successfully received your payment. Details are logged below:</p>
    
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #166534; padding: 20px; border-radius: 8px; margin: 24px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #64748b;">Receipt Number</td><td style="padding: 6px 0; text-align: right; font-weight: 700; color: #1e293b;">${escapeHtml(receiptNumber)}</td></tr>
        ${monthStr ? `<tr><td style="padding: 6px 0; color: #64748b;">Period / Month</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${escapeHtml(monthStr)}</td></tr>` : ''}
        ${roomNumber ? `<tr><td style="padding: 6px 0; color: #64748b;">Room Allocation</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${escapeHtml(roomNumber)}</td></tr>` : ''}
        <tr><td style="padding: 6px 0; color: #64748b;">Property</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${escapeHtml(propertyName)}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Payment Mode</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b; text-transform: capitalize;">${escapeHtml(paymentMode || 'Online')}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Payment Date</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${escapeHtml(paymentDate)}</td></tr>
        <tr style="border-top: 2px solid #bbf7d0;"><td style="padding: 12px 0; color: #0f172a; font-weight: 700; font-size: 15px;">Amount Paid</td><td style="padding: 12px 0; text-align: right; font-weight: 800; color: #166534; font-size: 22px;">${formatCurrency(rentAmount)}</td></tr>
      </table>
    </div>

    <p style="font-size: 13px; color: #94a3b8; text-align: center;">This digital receipt is stored permanently in your GoBanqo profile.</p>
    <p style="font-size: 14px; color: #334155; margin-top: 24px;">Thank you,<br/><strong>${escapeHtml(propertyName)} Management</strong></p>
    `;

    const footerText = `Sent on behalf of ${escapeHtml(ownerName || propertyName)} via GoBanqo`;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            actionUrl: 'https://gobanqo.com/tenant/dashboard', 
            actionText: 'View Full Receipt', 
            footerText 
        }) 
    };
};

exports.getPaymentFailedTemplate = ({ tenantName, propertyName, rentAmount, reason }) => {
    const subject = `❌ Transaction Failed — ${propertyName}`;
    const preheader = `Your rent payment attempt of ${formatCurrency(rentAmount)} for ${propertyName} failed.`;
    const contentHtml = `
      <h2 style="font-size: 20px; font-weight: 700; color: #991b1b; margin-top: 0;">Payment Transaction Failed</h2>
      <p style="font-size: 15px; color: #334155;">Dear <strong>${escapeHtml(tenantName)}</strong>,</p>
      <p style="font-size: 15px; color: #334155;">Your recent payment attempt of <strong>${formatCurrency(rentAmount)}</strong> for ${escapeHtml(propertyName)} could not be processed.</p>
      
      ${reason ? `
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #ef4444; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; color: #991b1b; font-size: 14px;"><strong>Failure Reason:</strong> ${escapeHtml(reason)}</p>
      </div>` : ''}
      
      <p style="font-size: 14px; color: #475569;">Please retry using an alternative payment method or contact management.</p>
    `;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            actionUrl: 'https://gobanqo.com/tenant/dashboard', 
            actionText: 'Retry Payment', 
            footerText: 'GoBanqo Billing Platform' 
        }) 
    };
};

exports.getPaymentPendingTemplate = ({ tenantName, propertyName, rentAmount, paymentReference }) => {
    const subject = `⏳ Payment Processing — ${propertyName}`;
    const preheader = `Your payment of ${formatCurrency(rentAmount)} is currently pending banking verification.`;
    const contentHtml = `
      <h2 style="font-size: 20px; font-weight: 700; color: #d97706; margin-top: 0;">Payment Processing</h2>
      <p style="font-size: 15px; color: #334155;">Dear <strong>${escapeHtml(tenantName)}</strong>,</p>
      <p style="font-size: 15px; color: #334155;">We have received your payment authorization of <strong>${formatCurrency(rentAmount)}</strong> for ${escapeHtml(propertyName)}.</p>
      
      <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 8px; margin: 20px 0;">
        ${paymentReference ? `<p style="margin: 4px 0; font-size: 14px; color: #92400e;"><strong>Banking Reference:</strong> ${escapeHtml(paymentReference)}</p>` : ''}
        <p style="margin: 4px 0; font-size: 13px; color: #b45309;">Your receipt will be generated automatically once bank confirmation completes.</p>
      </div>
    `;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            footerText: 'GoBanqo Billing Platform' 
        }) 
    };
};

// ==========================================
// MAINTENANCE / COMPLAINT TEMPLATES
// ==========================================

exports.getComplaintCreatedTemplate = exports.getTenantRequestAlertTemplate = ({ ownerName, tenantName, tenantEmail, tenantPhone, propertyName, roomNumber, requestTitle, requestType, visitDate, message }) => {
    const subject = `📥 New Maintenance Ticket: ${requestTitle || 'Tenant Request'} — ${propertyName}`;
    const preheader = `Tenant ${tenantName || 'Tenant'} submitted a maintenance request for ${propertyName}.`;

    const contentHtml = `
    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Hello ${escapeHtml(ownerName || 'Property Owner')},</h2>
    <p style="font-size: 15px; color: #334155; line-height: 1.6;">A new maintenance ticket has been registered for <strong>${escapeHtml(propertyName)}</strong>:</p>
    
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; padding: 20px; border-radius: 8px; margin: 24px 0;">
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Ticket Title:</strong> ${escapeHtml(requestTitle)}</p>
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Category:</strong> ${escapeHtml(requestType || 'Maintenance')}</p>
      <p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Tenant:</strong> ${escapeHtml(tenantName || tenantEmail || 'Tenant')}</p>
      ${roomNumber ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Room:</strong> ${escapeHtml(roomNumber)}</p>` : ''}
      ${tenantPhone ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Phone:</strong> ${escapeHtml(tenantPhone)}</p>` : ''}
      ${visitDate ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;"><strong>Preferred Visit:</strong> ${escapeHtml(visitDate)}</p>` : ''}
      ${message ? `<div style="margin-top: 14px; padding: 12px; background: #f0f9ff; border-left: 3px solid #0284c7; border-radius: 4px;"><strong>Issue Details:</strong><br/>${escapeHtml(message)}</div>` : ''}
    </div>

    <p style="font-size: 14px; color: #64748b;">Log in to your GoBanqo dashboard to update ticket status or assign technicians.</p>
    `;

    const footerText = `GoBanqo Maintenance Ticket System`;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            actionUrl: 'https://gobanqo.com/complaints', 
            actionText: 'Review Maintenance Ticket', 
            footerText 
        }) 
    };
};

exports.getComplaintUpdatedTemplate = ({ tenantName, propertyName, requestTitle, status, resolutionNotes }) => {
    const subject = `🔧 Ticket Status Updated: ${requestTitle} — ${status}`;
    const preheader = `Status updated to ${status} for your request at ${propertyName}.`;
    const contentHtml = `
      <h2 style="font-size: 20px; font-weight: 700; color: #0284c7; margin-top: 0;">Maintenance Status Update</h2>
      <p style="font-size: 15px; color: #334155;">Dear <strong>${escapeHtml(tenantName)}</strong>,</p>
      <p style="font-size: 15px; color: #334155;">The status of your ticket <strong>"${escapeHtml(requestTitle)}"</strong> at ${escapeHtml(propertyName)} is now <span style="font-weight: 800; color: #0284c7; text-transform: uppercase;">${escapeHtml(status)}</span>.</p>
      
      ${resolutionNotes ? `
      <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-left: 4px solid #0284c7; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; color: #0369a1; font-size: 14px;"><strong>Manager Notes:</strong> ${escapeHtml(resolutionNotes)}</p>
      </div>` : ''}
    `;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            actionUrl: 'https://gobanqo.com/tenant/dashboard', 
            actionText: 'View Ticket Status', 
            footerText: `Sent on behalf of ${escapeHtml(propertyName)}` 
        }) 
    };
};

exports.getComplaintResolvedTemplate = ({ tenantName, propertyName, requestTitle }) => {
    const subject = `✅ Ticket Resolved: ${requestTitle}`;
    const preheader = `Your complaint at ${propertyName} has been marked as resolved.`;
    return exports.getComplaintUpdatedTemplate({ tenantName, propertyName, requestTitle, status: 'RESOLVED' });
};

// ==========================================
// SUBSCRIPTION & SYSTEM ALERTS
// ==========================================

exports.getPlanChangedTemplate = ({ ownerName, planName, propertyLimit }) => {
    const subject = `🚀 GoBanqo Subscription Plan Updated: ${planName}`;
    const preheader = `Your subscription plan has been updated to ${planName}.`;
    const contentHtml = `
      <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Subscription Plan Updated</h2>
      <p style="font-size: 15px; color: #334155;">Hello <strong>${escapeHtml(ownerName)}</strong>,</p>
      <p style="font-size: 15px; color: #334155;">Your GoBanqo subscription plan has been updated to <strong>${escapeHtml(planName)}</strong>.</p>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; padding: 18px; border-radius: 8px; margin: 24px 0;">
        <p style="margin: 4px 0; font-size: 14px; color: #0f172a;"><strong>Current Active Plan:</strong> ${escapeHtml(planName)}</p>
        <p style="margin: 4px 0; font-size: 14px; color: #0f172a;"><strong>Property Capacity:</strong> ${propertyLimit || 'Unlimited'}</p>
      </div>
    `;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            actionUrl: 'https://gobanqo.com/subscription', 
            actionText: 'Manage Subscription', 
            footerText: 'GoBanqo Subscription Platform' 
        }) 
    };
};

exports.getTrialEndingTemplate = ({ ownerName, daysRemaining, upgradeUrl }) => {
    const subject = `⏳ Your GoBanqo Free Trial Ends in ${daysRemaining} Days`;
    const preheader = `Upgrade your plan to preserve automated tenant reminders, receipts, and analytics.`;
    const contentHtml = `
      <h2 style="font-size: 20px; font-weight: 700; color: #d97706; margin-top: 0;">Free Trial Expiration Reminder</h2>
      <p style="font-size: 15px; color: #334155;">Hello <strong>${escapeHtml(ownerName)}</strong>,</p>
      <p style="font-size: 15px; color: #334155;">Your GoBanqo 30-day free trial will end in <strong style="color: #d97706;">${daysRemaining} days</strong>.</p>
      
      <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 18px; border-radius: 8px; margin: 24px 0;">
        <p style="margin: 0; font-size: 14px; color: #92400e; line-height: 1.5;">
          Upgrade your subscription today to ensure seamless uninterrupted access to automated tenant reminders, digital rent collection, PWA push alerts, and occupancy analytics.
        </p>
      </div>
    `;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            actionUrl: upgradeUrl || 'https://gobanqo.com/subscription', 
            actionText: 'Upgrade Plan Now', 
            footerText: 'GoBanqo Subscription Platform' 
        }) 
    };
};

exports.getBroadcastTemplate = exports.getSystemAlertTemplate = ({ ownerName, propertyName, customSubject, message }) => {
    const subject = customSubject ? `📢 Notice from ${propertyName}: ${customSubject}` : `📢 Notice from ${propertyName} Management`;
    const preheader = `Important notice regarding ${propertyName}.`;

    const contentHtml = `
    <h2 style="font-size: 20px; font-weight: 700; color: #0284c7; margin-top: 0;">Announcement from ${escapeHtml(propertyName || 'Management')}</h2>
    <div style="font-size: 15px; color: #334155; line-height: 1.7; white-space: pre-wrap; margin: 24px 0; padding: 20px; background-color: #f0f9ff; border-radius: 8px; border: 1px solid #bae6fd; border-left: 4px solid #0284c7;">
      ${escapeHtml(message)}
    </div>
    <p style="font-size: 14px; color: #334155; margin-top: 24px;">Regards,<br/><strong>${escapeHtml(ownerName || 'Property Management')}</strong><br/>${escapeHtml(propertyName || '')}</p>
    `;

    const footerText = `Sent on behalf of ${escapeHtml(ownerName || propertyName)} via GoBanqo Broadcast Platform`;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            footerText 
        }) 
    };
};

exports.getOwnerDailySummaryTemplate = ({ ownerName, totalProperties, activeTenants, collectedRentMonth, pendingComplaints }) => {
    const subject = `📊 GoBanqo Daily Portfolio Digest`;
    const preheader = `Daily snapshot: ${activeTenants} active tenants across ${totalProperties} properties. ${formatCurrency(collectedRentMonth)} collected this month.`;
    const contentHtml = `
      <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Daily Portfolio Digest</h2>
      <p style="font-size: 15px; color: #334155;">Good morning <strong>${escapeHtml(ownerName)}</strong>,</p>
      <p style="font-size: 15px; color: #334155;">Here is your automated daily operational digest across your property portfolio:</p>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; padding: 20px; border-radius: 8px; margin: 24px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 8px 0; color: #64748b;">Active Properties</td><td style="padding: 8px 0; text-align: right; font-weight: 700; color: #0f172a;">${totalProperties}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">Active Tenants</td><td style="padding: 8px 0; text-align: right; font-weight: 700; color: #0f172a;">${activeTenants}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">Rent Collected This Month</td><td style="padding: 8px 0; text-align: right; font-weight: 800; color: #166534; font-size: 16px;">${formatCurrency(collectedRentMonth)}</td></tr>
          <tr style="border-top: 1px solid #e2e8f0;"><td style="padding: 8px 0; color: #64748b;">Open Maintenance Tickets</td><td style="padding: 8px 0; text-align: right; font-weight: 700; color: #dc2626;">${pendingComplaints}</td></tr>
        </table>
      </div>
    `;
    return { 
        subject, 
        html: renderLayout({ 
            title: subject, 
            preheader, 
            contentHtml, 
            actionUrl: 'https://gobanqo.com/dashboard', 
            actionText: 'View Owner Dashboard', 
            footerText: 'GoBanqo Portfolio Analytics Platform' 
        }) 
    };
};
