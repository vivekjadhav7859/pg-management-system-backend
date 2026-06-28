const AWS = require('aws-sdk');
const financialService = require('../services/financial.service');
const { buildTransporter, logEmail } = require('./emailHelper');

const ses = new AWS.SES({ region: process.env.SES_REGION || process.env.AWS_REGION || 'ap-south-1' });
const FROM_EMAIL = process.env.SES_FROM_EMAIL;

const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

exports.sendOwnerRequestEmail = async ({
    owner,
    tenant,
    property,
    requestTitle,
    requestType,
    roomNumber,
    visitDate,
    message,
}) => {
    if (!owner?.email) {
        return { sent: false, reason: 'Missing owner email' };
    }

    const subject = `${requestTitle} - ${property?.propertyName || 'Nexus PG'}`;
    const html = `
<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:20px;background:#f7f7f5;">
  <div style="background:#ffffff;border:1px solid #e5e5e1;border-radius:12px;overflow:hidden;">
    <div style="padding:22px 24px;border-bottom:1px solid #e5e5e1;">
      <h1 style="font-size:20px;line-height:1.3;margin:0;color:#181816;">${escapeHtml(requestTitle)}</h1>
      <p style="margin:6px 0 0;color:#64645e;font-size:14px;">A tenant has sent a new request from Nexus.</p>
    </div>
    <div style="padding:22px 24px;color:#181816;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 10px;"><strong>Property:</strong> ${escapeHtml(property?.propertyName || 'Not specified')}</p>
      ${roomNumber ? `<p style="margin:0 0 10px;"><strong>Room:</strong> ${escapeHtml(roomNumber)}</p>` : ''}
      <p style="margin:0 0 10px;"><strong>Request Type:</strong> ${escapeHtml(requestType || requestTitle)}</p>
      ${visitDate ? `<p style="margin:0 0 10px;"><strong>Preferred Date:</strong> ${escapeHtml(visitDate)}</p>` : ''}
      <p style="margin:0 0 10px;"><strong>Tenant:</strong> ${escapeHtml(tenant?.name || tenant?.email || 'Tenant')}</p>
      ${tenant?.email ? `<p style="margin:0 0 10px;"><strong>Tenant Email:</strong> ${escapeHtml(tenant.email)}</p>` : ''}
      ${tenant?.phone ? `<p style="margin:0 0 10px;"><strong>Tenant Phone:</strong> ${escapeHtml(tenant.phone)}</p>` : ''}
      ${message ? `<div style="margin:16px 0;padding:14px;border-left:4px solid #2460e0;background:#f3f6ff;border-radius:6px;"><strong>Message:</strong><br/>${escapeHtml(message)}</div>` : ''}
      <p style="margin:18px 0 0;color:#64645e;">Open Nexus Requests to approve, reject, assign, or update this request.</p>
    </div>
  </div>
</div>`;

    const emailLog = {
        ownerId: owner.userId,
        tenantId: tenant?.userId || '',
        tenantEmail: tenant?.email || '',
        type: 'OWNER_REQUEST_ALERT',
        subject,
    };

    const sendWithOwnerSmtp = async () => {
        if (!property?.propertyId) return { sent: false, reason: 'Missing propertyId' };

        const reminderSettings = await financialService.getReminderSettings(property.propertyId).catch((err) => {
            console.warn('[ownerRequestEmail] reminder settings lookup failed', err.message);
            return null;
        });

        if (!reminderSettings?.emailConfig) {
            return { sent: false, reason: 'Owner SMTP not configured' };
        }

        const transporter = await buildTransporter(reminderSettings.emailConfig);
        const mail = {
            from: `"${property?.propertyName || 'Nexus PG'}" <${reminderSettings.emailConfig.user}>`,
            to: owner.email,
            subject,
            html,
        };

        if (tenant?.email) {
            mail.replyTo = tenant.email;
        }

        await transporter.sendMail(mail);
        await logEmail({ ...emailLog, status: 'SENT' });
        return { sent: true, provider: 'smtp' };
    };

    const sendWithSes = async () => {
        if (!FROM_EMAIL) {
            return { sent: false, reason: 'SES_FROM_EMAIL not configured' };
        }

        const params = {
            Source: FROM_EMAIL,
            Destination: { ToAddresses: [owner.email] },
            Message: {
                Subject: { Data: subject, Charset: 'UTF-8' },
                Body: { Html: { Data: html, Charset: 'UTF-8' } },
            },
        };

        if (tenant?.email) {
            params.ReplyToAddresses = [tenant.email];
        }

        await ses.sendEmail(params).promise();
        await logEmail({ ...emailLog, status: 'SENT' });
        return { sent: true, provider: 'ses' };
    };

    const failures = [];

    try {
        const smtpResult = await sendWithOwnerSmtp();
        if (smtpResult.sent) return smtpResult;
        failures.push(smtpResult.reason);
    } catch (err) {
        failures.push(`Owner SMTP failed: ${err.message}`);
        console.warn('[ownerRequestEmail] owner SMTP failed', err.message);
    }

    try {
        const sesResult = await sendWithSes();
        if (sesResult.sent) return sesResult;
        failures.push(sesResult.reason);
    } catch (err) {
        failures.push(`SES failed: ${err.message}`);
        console.warn('[ownerRequestEmail] SES failed', err.message);
    }

    const reason = failures.filter(Boolean).join('; ');
    await logEmail({ ...emailLog, status: 'FAILED', errorMessage: reason });
    return { sent: false, reason };
};
