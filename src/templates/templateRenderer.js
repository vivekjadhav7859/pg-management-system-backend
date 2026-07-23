/**
 * TemplateRenderer - Wraps email content into a production-grade, highly responsive, accessible HTML layout.
 * Supports Gmail, Outlook (MSO conditionals), Apple Mail, Dark Mode, and Mobile viewport responsiveness.
 */

exports.renderLayout = ({ 
    title, 
    preheader = '', 
    contentHtml, 
    footerText = '', 
    actionUrl = null, 
    actionText = null,
    showUnsubscribe = false 
}) => {
    const currentYear = new Date().getFullYear();
    const cleanPreheader = preheader ? preheader.replace(/"/g, '&quot;') : '';

    const actionButtonHtml = (actionUrl && actionText) ? `
      <!-- CTA Button -->
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0 16px 0;">
        <tr>
          <td align="center">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${actionUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="12%" stroke="f" fillcolor="#2563eb">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;">${actionText}</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="${actionUrl}" target="_blank" style="background-color: #2563eb; background-image: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; display: inline-block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 600; line-height: 48px; text-align: center; text-decoration: none; width: 220px; -webkit-text-size-adjust: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);">${actionText}</a>
            <!--<![endif]-->
          </td>
        </tr>
      </table>
    ` : '';

    return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background-color: #f4f6f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -ms-text-size-adjust: 100%;
      -webkit-text-size-adjust: 100%;
      color: #1e293b;
    }
    table, td {
      mso-table-lspace: 0pt !important;
      mso-table-rspace: 0pt !important;
      border-collapse: collapse !important;
    }
    img {
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
      -ms-interpolation-mode: bicubic;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #f4f6f9;
      padding-bottom: 40px;
    }
    .main-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
    }
    .header-banner {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      padding: 32px 24px;
      text-align: center;
    }
    .brand-title {
      color: #ffffff;
      margin: 0;
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }
    .brand-sub {
      color: #94a3b8;
      font-size: 12px;
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .content-body {
      padding: 36px 32px;
      background-color: #ffffff;
    }
    .footer-panel {
      background-color: #f8fafc;
      padding: 24px 32px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
    .footer-panel p {
      margin: 4px 0;
      line-height: 1.5;
    }
    /* Dark Mode Media Queries */
    @media (prefers-color-scheme: dark) {
      body, .wrapper {
        background-color: #0f172a !important;
      }
      .main-container {
        background-color: #1e293b !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4) !important;
      }
      .content-body {
        background-color: #1e293b !important;
        color: #f1f5f9 !important;
      }
      .footer-panel {
        background-color: #0f172a !important;
        border-top-color: #334155 !important;
        color: #94a3b8 !important;
      }
    }
    @media only screen and (max-width: 600px) {
      .content-body {
        padding: 24px 20px !important;
      }
      .footer-panel {
        padding: 20px 16px !important;
      }
    }
  </style>
</head>
<body>
  ${cleanPreheader ? `<span style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;color:#f4f6f9;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${cleanPreheader}</span>` : ''}
  
  <div class="wrapper">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding: 20px 12px 0 12px;">
          <div class="main-container">
            <!-- Header -->
            <div class="header-banner">
              <h1 class="brand-title">GoBanqo</h1>
              <div class="brand-sub">Property Management SaaS</div>
            </div>

            <!-- Content -->
            <div class="content-body">
              ${contentHtml}
              ${actionButtonHtml}
            </div>

            <!-- Footer -->
            <div class="footer-panel">
              ${footerText ? `<p><strong>${footerText}</strong></p>` : ''}
              <p>© ${currentYear} GoBanqo. All rights reserved.</p>
              <p style="font-size: 11px; color: #94a3b8; margin-top: 8px;">
                Automated Transactional Delivery • Powered by GoBanqo Enterprise Infrastructure
              </p>
              ${showUnsubscribe ? `<p style="font-size: 11px; color: #94a3b8; margin-top: 6px;"><a href="https://gobanqo.com/notification-preferences" style="color: #64748b; text-decoration: underline;">Manage Notification Preferences</a></p>` : ''}
            </div>
          </div>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
};
