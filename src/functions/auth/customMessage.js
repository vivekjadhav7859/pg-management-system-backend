exports.handler = async (event) => {
  const brandName = "GoBanqo";
  const supportEmail = "support@gobanqo.com";
  
  const template = (title, message, code) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        .header { background-color: #0f172a; padding: 30px 20px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 1px; }
        .content { padding: 40px 30px; color: #334155; line-height: 1.6; }
        .content p { margin: 0 0 15px; font-size: 16px; }
        .code-box { background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 6px; padding: 20px; text-align: center; margin: 30px 0; }
        .code { font-size: 32px; font-weight: 700; color: #0f172a; letter-spacing: 4px; }
        .footer { background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer p { margin: 0; font-size: 14px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${brandName}</h1>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p>${message}</p>
          <div class="code-box">
            <div class="code">${code}</div>
          </div>
          <p>If you didn't request this, you can safely ignore this email.</p>
          <p>Best regards,<br><strong>The ${brandName} Team</strong></p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} ${brandName}. All rights reserved.</p>
          <p>Need help? Contact us at <a href="mailto:${supportEmail}">${supportEmail}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Handle different trigger sources
  if (event.triggerSource === "CustomMessage_SignUp") {
    event.response.emailSubject = `Verify your email for ${brandName}`;
    event.response.emailMessage = template(
      "Verify Your Email",
      "Welcome! Please use the verification code below to confirm your email address and activate your account.",
      "{####}"
    );
  } else if (event.triggerSource === "CustomMessage_ResendCode") {
    event.response.emailSubject = `Your new verification code for ${brandName}`;
    event.response.emailMessage = template(
      "New Verification Code",
      "We received a request to resend your verification code. Please use the code below to verify your email.",
      "{####}"
    );
  } else if (event.triggerSource === "CustomMessage_ForgotPassword") {
    event.response.emailSubject = `Password reset for your ${brandName} account`;
    event.response.emailMessage = template(
      "Reset Your Password",
      "We received a request to reset your password. Use the secure code below to proceed.",
      "{####}"
    );
  } else if (event.triggerSource === "CustomMessage_AdminCreateUser") {
    event.response.emailSubject = `Welcome to ${brandName}`;
    event.response.emailMessage = template(
      "Welcome to GoBanqo",
      `Your account has been created. Your temporary password is: <strong>{####}</strong>. Please log in to change your password.`,
      "{####}"
    );
  }

  // Return the modified event to Cognito
  return event;
};
