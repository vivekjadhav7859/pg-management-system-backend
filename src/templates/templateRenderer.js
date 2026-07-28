/**
 * TemplateRenderer - Enterprise email layout orchestrator for GoBanqo.
 * Renders responsive, accessible HTML email wrappers styled in GoBanqo's signature brand theme.
 * Supports Apple Mail, Gmail, Outlook (MSO conditionals), Dark Mode, and mobile viewports.
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
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 32px 0 16px 0;">
        <tr>
          <td align="center">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${actionUrl}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="16%" stroke="f" fillcolor="#16a34a">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;">${actionText}</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="${actionUrl}" target="_blank" style="background-color: #16a34a; background-image: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: #ffffff; display: inline-block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 700; line-height: 48px; text-align: center; text-decoration: none; padding: 0 28px; min-width: 200px; -webkit-text-size-adjust: none; border-radius: 8px; box-shadow: 0 4px 14px rgba(22, 163, 74, 0.35);">${actionText}</a>
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
      background-color: #0b131e;
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
      background-color: #0b131e;
      padding: 32px 12px 48px 12px;
    }
    .main-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2);
    }
    .header-banner {
      background: linear-gradient(135deg, #09131d 0%, #0e1b2a 100%);
      padding: 32px 28px;
      text-align: center;
      border-bottom: 3px solid #16a34a;
    }
    .brand-logo-mark {
      display: inline-block;
      width: 46px;
      height: 46px;
      line-height: 46px;
      background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%);
      color: #ffffff;
      font-weight: 900;
      font-size: 24px;
      border-radius: 12px;
      box-shadow: 0 4px 14px rgba(22, 163, 74, 0.4);
      margin-bottom: 8px;
    }
    .brand-title {
      color: #ffffff;
      margin: 0;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }
    .brand-sub {
      color: #4ade80;
      font-size: 11px;
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      font-weight: 700;
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
        background-color: #080f18 !important;
      }
      .main-container {
        background-color: #1e293b !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6) !important;
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
      .wrapper {
        padding: 16px 8px 32px 8px !important;
      }
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
  ${cleanPreheader ? `<span style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;color:#0f172a;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${cleanPreheader}</span>` : ''}
  
  <div class="wrapper">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center">
          <div class="main-container">
            <!-- GoBanqo Header -->
            <div class="header-banner">
              <div class="brand-logo-mark">G</div>
              <h1 class="brand-title">GoBanqo</h1>
              <div class="brand-sub">PG & Property Management SaaS</div>
            </div>

            <!-- Main Content Body -->
            <div class="content-body">
              ${contentHtml}
              ${actionButtonHtml}
            </div>

            <!-- Footer Panel -->
            <div class="footer-panel">
              ${footerText ? `<p><strong>${footerText}</strong></p>` : ''}
              <p>© ${currentYear} GoBanqo Inc. All rights reserved.</p>
              <p style="font-size: 11px; color: #94a3b8; margin-top: 8px;">
                Secure Transactional System • Powered by GoBanqo Centralized Notification Platform
              </p>
              ${showUnsubscribe ? `<p style="font-size: 11px; color: #94a3b8; margin-top: 6px;"><a href="https://gobanqo.com/notification-preferences" style="color: #16a34a; text-decoration: underline;">Manage Notification Preferences</a></p>` : ''}
            </div>
          </div>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
};
