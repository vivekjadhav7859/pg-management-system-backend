const { renderLayout } = require('../../templates/templateRenderer');

exports.handler = async (event) => {
  const brandName = "GoBanqo";
  const supportEmail = "support@gobanqo.com";
  
  const renderCognitoTemplate = (title, message, codePlaceholder = '{####}') => {
    const contentHtml = `
      <h2 style="font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0;">${title}</h2>
      <p style="font-size: 15px; color: #334155; line-height: 1.6;">${message}</p>
      <div style="background-color: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: 800; color: #0f172a; letter-spacing: 6px; font-family: monospace;">${codePlaceholder}</span>
      </div>
      <p style="font-size: 13px; color: #64748b;">If you didn't request this code, you can safely ignore this email.</p>
    `;

    return renderLayout({
      title: `${title} — ${brandName}`,
      preheader: message,
      contentHtml,
      footerText: `Need help? Contact us at ${supportEmail}`
    });
  };

  // Handle Cognito Trigger Sources
  if (event.triggerSource === "CustomMessage_SignUp") {
    event.response.emailSubject = `Verify your email for ${brandName}`;
    event.response.emailMessage = renderCognitoTemplate(
      "Verify Your Email",
      "Welcome to GoBanqo! Please use the verification code below to confirm your email address and activate your account.",
      "{####}"
    );
  } else if (event.triggerSource === "CustomMessage_ResendCode") {
    event.response.emailSubject = `Your new verification code for ${brandName}`;
    event.response.emailMessage = renderCognitoTemplate(
      "New Verification Code",
      "We received a request to resend your verification code. Please use the code below to verify your email.",
      "{####}"
    );
  } else if (event.triggerSource === "CustomMessage_ForgotPassword") {
    event.response.emailSubject = `Password reset for your ${brandName} account`;
    event.response.emailMessage = renderCognitoTemplate(
      "Reset Your Password",
      "We received a request to reset your password. Use the secure code below to proceed.",
      "{####}"
    );
  } else if (event.triggerSource === "CustomMessage_AdminCreateUser") {
    event.response.emailSubject = `Welcome to ${brandName}`;
    event.response.emailMessage = renderCognitoTemplate(
      "Welcome to GoBanqo",
      `Your account has been created. Your temporary password is: <strong>{####}</strong>. Please log in to change your password.`,
      "{####}"
    );
  }

  // Return the modified event to Cognito
  return event;
};
