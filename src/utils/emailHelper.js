const AWS = require('aws-sdk');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const { decryptSecret } = require('./crypto');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const EMAIL_LOG_TABLE = process.env.EMAIL_LOG_TABLE;

exports.buildTransporter = async (emailConfig) => {
    const smtpPassword = await decryptSecret(emailConfig.encryptedPassword);
    let transportConfig;
    if (emailConfig.provider === 'gmail') {
        transportConfig = { service: 'gmail', auth: { user: emailConfig.user, pass: smtpPassword } };
    } else if (emailConfig.provider === 'outlook') {
        transportConfig = { service: 'hotmail', auth: { user: emailConfig.user, pass: smtpPassword } };
    } else {
        const port = emailConfig.port || 587;
        transportConfig = { host: emailConfig.host, port, secure: port === 465, auth: { user: emailConfig.user, pass: smtpPassword } };
    }
    return nodemailer.createTransport(transportConfig);
};

exports.logEmail = async ({ ownerId, tenantId, tenantEmail, type, subject, status, errorMessage }) => {
    if (!EMAIL_LOG_TABLE) return;
    try {
        await dynamodb.put({
            TableName: EMAIL_LOG_TABLE,
            Item: {
                logId: uuidv4(),
                ownerId: ownerId || 'system',
                ownerIdIndex: ownerId || 'system',
                tenantId: tenantId || '',
                tenantEmail: tenantEmail || '',
                type,
                subject,
                status,
                errorMessage: errorMessage || null,
                sentAt: new Date().toISOString(),
            }
        }).promise();
    } catch (err) {
        console.error('[emailHelper.logEmail]', err);
    }
};

exports.delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

exports.getRentReminderTemplate = ({ tenantName, ownerName, propertyName, rentAmount, dueDate }) => {
    const subject = `Rent Payment Reminder — ${propertyName}`;
    const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:22px;">🔔 Rent Payment Reminder</h1>
  </div>
  <div style="background:#fff;padding:30px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:16px;color:#333;">Dear <strong>${tenantName}</strong>,</p>
    <p style="font-size:15px;color:#555;">This is a friendly reminder that your monthly rent is due.</p>
    <div style="background:#f0f0ff;border-left:4px solid #4f46e5;padding:16px;margin:20px 0;border-radius:4px;">
      <p style="margin:6px 0;"><strong>Property:</strong> ${propertyName}</p>
      <p style="margin:6px 0;"><strong>Amount Due:</strong> ₹${Number(rentAmount).toLocaleString('en-IN')}</p>
      <p style="margin:6px 0;"><strong>Due Date:</strong> ${dueDate}</p>
    </div>
    <p style="font-size:14px;color:#777;">Please ensure timely payment to avoid any inconvenience.</p>
    <p style="font-size:14px;color:#333;margin-top:20px;">Thank you,<br/><strong>${propertyName} Management</strong></p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #eee;"/>
    <p style="font-size:11px;color:#aaa;text-align:center;">Sent on behalf of ${ownerName} via PG Manager</p>
  </div>
</div>`;
    return { subject, html };
};

exports.getWelcomeTemplate = ({ tenantName, ownerName, propertyName, ownerContact, rentAmount, rentDueDay, leaseEndDate, rules }) => {
    const subject = `Welcome to ${propertyName} — PG Manager`;
    const rulesHtml = rules && rules.length
        ? `<p style="margin:6px 0;"><strong>House Rules:</strong></p><ul style="margin:4px 0 0 16px;color:#555;">${rules.map(r => `<li style="margin:2px 0;">${r}</li>`).join('')}</ul>`
        : '';
    const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#10b981,#059669);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:22px;">🎉 Welcome to ${propertyName}!</h1>
  </div>
  <div style="background:#fff;padding:30px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:16px;color:#333;">Dear <strong>${tenantName}</strong>,</p>
    <p style="font-size:15px;color:#555;">We're glad to have you. Here are your tenancy details:</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:20px;margin:20px 0;border-radius:8px;">
      <p style="margin:6px 0;"><strong>Property:</strong> ${propertyName}</p>
      <p style="margin:6px 0;"><strong>Monthly Rent:</strong> ₹${Number(rentAmount).toLocaleString('en-IN')}</p>
      <p style="margin:6px 0;"><strong>Rent Due Day:</strong> ${rentDueDay ? `${rentDueDay}th of every month` : '1st of every month'}</p>
      ${leaseEndDate ? `<p style="margin:6px 0;"><strong>Lease End Date:</strong> ${new Date(leaseEndDate).toLocaleDateString('en-IN')}</p>` : ''}
      <p style="margin:6px 0;"><strong>Owner:</strong> ${ownerName}</p>
      <p style="margin:6px 0;"><strong>Contact:</strong> ${ownerContact || 'Check with management'}</p>
      ${rulesHtml}
    </div>
    <p style="font-size:14px;color:#777;">If you have any questions, please reach out to your property manager.</p>
    <p style="font-size:14px;color:#333;margin-top:20px;">Welcome aboard,<br/><strong>${propertyName} Management</strong></p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #eee;"/>
    <p style="font-size:11px;color:#aaa;text-align:center;">Sent on behalf of ${ownerName} via PG Manager</p>
  </div>
</div>`;
    return { subject, html };
};

exports.getBroadcastTemplate = ({ ownerName, propertyName, customSubject, message }) => {
    const subject = customSubject;
    const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#0ea5e9,#0284c7);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:22px;">📢 Notice from ${propertyName}</h1>
  </div>
  <div style="background:#fff;padding:30px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px;">
    <div style="font-size:15px;color:#333;white-space:pre-wrap;line-height:1.7;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    <p style="font-size:14px;color:#333;margin-top:24px;">Regards,<br/><strong>${ownerName}</strong><br/>${propertyName}</p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #eee;"/>
    <p style="font-size:11px;color:#aaa;text-align:center;">Sent on behalf of ${ownerName} via PG Manager</p>
  </div>
</div>`;
    return { subject, html };
};
