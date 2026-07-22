/**
 * TemplateRenderer - Wraps email content into a modern, responsive HTML brand layout.
 */

exports.renderLayout = ({ title, preheader = '', contentHtml, footerText = '' }) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
    body {
      margin: 0;
      padding: 0;
      background-color: #f4f6f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      color: #1e293b;
    }
    table {
      border-collapse: collapse;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
    }
    .header {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      padding: 28px 32px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .body-content {
      padding: 32px;
    }
    .footer {
      background-color: #f8fafc;
      padding: 20px 32px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
    .footer p {
      margin: 4px 0;
    }
  </style>
</head>
<body>
  ${preheader ? `<span style="display:none;font-size:1px;color:#333;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</span>` : ''}
  <div style="padding: 24px 12px; background-color: #f4f6f9;">
    <div class="container">
      <div class="header">
        <h1>GoBanqo</h1>
      </div>
      <div class="body-content">
        ${contentHtml}
      </div>
      <div class="footer">
        ${footerText ? `<p>${footerText}</p>` : ''}
        <p>© ${new Date().getFullYear()} GoBanqo. All rights reserved.</p>
        <p style="font-size: 11px; color: #94a3b8;">Automated Transactional Notification • Powered by GoBanqo Engine</p>
      </div>
    </div>
  </div>
</body>
</html>`;
};
