import "server-only";

// Shared visual shell for transactional emails — kept in one place so the
// verification email (and any future transactional email) render
// consistently. Deliberately no external image/logo: no logo asset exists
// in public/ yet, and images are blocked by default in most mail clients
// anyway, so a text wordmark is the more reliable choice.
function emailShell(bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
  </head>
  <body style="margin:0;padding:0;background-color:#f4f2ef;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f2ef;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e8e3db;">
            <tr>
              <td style="padding:32px 40px 24px 40px;text-align:center;border-bottom:1px solid #efece5;">
                <span style="font-size:22px;letter-spacing:2px;text-transform:uppercase;color:#1a1a1a;">MrRework</span>
              </td>
            </tr>
            <tr>
              <td style="padding:40px;color:#333333;font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px;background-color:#faf9f6;border-top:1px solid #efece5;text-align:center;color:#8a8578;font-size:12px;line-height:1.6;">
                MrRework &mdash; curated vintage pieces.<br />
                This is an automated message, please don't reply directly to this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function verificationEmailHtml(verifyUrl: string, expiresInHours: number): string {
  return emailShell(`
    <p style="margin:0 0 20px 0;font-size:18px;color:#1a1a1a;">Welcome to MrRework</p>
    <p style="margin:0 0 28px 0;">Thanks for creating an account. Confirm your email address to finish setting things up and start shopping.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
      <tr>
        <td align="center" style="border-radius:4px;background-color:#1a1a1a;">
          <a href="${verifyUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:14px;letter-spacing:1px;text-transform:uppercase;">Verify Email</a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px 0;font-size:13px;color:#666666;">Or paste this link into your browser:</p>
    <p style="margin:0 0 28px 0;font-size:13px;word-break:break-all;"><a href="${verifyUrl}" style="color:#8a6d3b;">${verifyUrl}</a></p>
    <p style="margin:0;font-size:13px;color:#8a8578;">This link expires in ${expiresInHours} hours. If you didn't create this account, you can safely ignore this email.</p>
  `);
}

export function verificationEmailText(verifyUrl: string, expiresInHours: number): string {
  return `Welcome to MrRework!\n\nConfirm your email address to finish setting up your account:\n\n${verifyUrl}\n\nThis link expires in ${expiresInHours} hours. If you didn't create this account, you can safely ignore this email.`;
}

// Shared by both the initial Child Admin invite and a Parent Admin's
// "Reset Password" action — same payload (a temporary password the
// recipient must change on next login), only the intro copy differs.
export function adminCredentialsEmailHtml(opts: { email: string; tempPassword: string; loginUrl: string; isReset: boolean }): string {
  const { email, tempPassword, loginUrl, isReset } = opts;
  return emailShell(`
    <p style="margin:0 0 20px 0;font-size:18px;color:#1a1a1a;">${isReset ? "Your admin password has been reset" : "Welcome to the MrRework admin team"}</p>
    <p style="margin:0 0 28px 0;">
      ${isReset
        ? "A Parent Admin reset your password for the MrRework admin dashboard. Use the temporary password below to sign in — you'll be asked to set a new one straight away."
        : "You've been invited as a Child Admin on the MrRework admin dashboard. Use the temporary password below to sign in for the first time — you'll be asked to set your own password straight away."}
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px 0;border:1px solid #efece5;border-radius:4px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px 0;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8a8578;">Email</p>
          <p style="margin:0 0 14px 0;font-size:14px;">${email}</p>
          <p style="margin:0 0 4px 0;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8a8578;">Temporary password</p>
          <p style="margin:0;font-size:16px;font-family:'Courier New',monospace;letter-spacing:0.5px;">${tempPassword}</p>
        </td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
      <tr>
        <td align="center" style="border-radius:4px;background-color:#1a1a1a;">
          <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:14px;letter-spacing:1px;text-transform:uppercase;">Login to Admin Dashboard</a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#8a8578;">For security, you'll be required to change this password the first time you sign in. If you weren't expecting this email, please contact your Parent Admin.</p>
  `);
}

// Sent on every new registration and every "Resend OTP" — the account
// stays unverified (and login stays blocked) until this exact code is
// submitted on /verify-email within expiresInMinutes. `otp` is the plain
// 6-digit code by design (it's what the recipient types in) — this
// function is server-only and this is the one place it's allowed to appear
// in plaintext; the DB only ever stores its hash (see issueOtp() in
// customerAuth.ts) and it must never be logged (see activityLog calls in
// the register/verify-otp/resend-otp routes, which log that an OTP event
// happened, never the code itself).
export function emailVerificationOtpHtml(opts: { name: string; otp: string; expiresInMinutes: number }): string {
  const { name, otp, expiresInMinutes } = opts;
  return emailShell(`
    <p style="margin:0 0 20px 0;font-size:18px;color:#1a1a1a;">Verify your email address</p>
    <p style="margin:0 0 8px 0;">Hello ${name || "there"},</p>
    <p style="margin:0 0 28px 0;">Thank you for registering. Your verification code is:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px 0;">
      <tr>
        <td align="center" style="padding:20px;border:1px solid #efece5;border-radius:4px;background-color:#faf9f6;">
          <span style="font-size:32px;font-weight:700;letter-spacing:10px;font-family:'Courier New',monospace;color:#1a1a1a;">${otp}</span>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 28px 0;font-size:13px;color:#666666;">This code expires in ${expiresInMinutes} minutes.</p>
    <p style="margin:0;font-size:13px;color:#8a8578;">If you did not create this account, you can safely ignore this email.</p>
  `);
}

export function emailVerificationOtpText(opts: { name: string; otp: string; expiresInMinutes: number }): string {
  const { name, otp, expiresInMinutes } = opts;
  return `Hello ${name || "there"},\n\nThank you for registering.\n\nYour verification code is:\n\n${otp}\n\nThis code expires in ${expiresInMinutes} minutes.\n\nIf you did not create this account, you can safely ignore this email.\n\nRegards,\nMrRework`;
}

// Sent to any admin who has opted in to "Receive new customer registration
// emails" (see src/lib/adminNotifications.ts) whenever a new customer
// account is created. `name` is often empty — registration only collects
// email/password (see registerCustomer() in customerAuth.ts), a display
// name is set later from Account settings — so this renders "—" rather
// than a blank line when there isn't one yet.
export function newCustomerRegistrationEmailHtml(opts: { name: string; email: string; registeredAt: string; customerId: string; profileUrl: string }): string {
  const { name, email, registeredAt, customerId, profileUrl } = opts;
  return emailShell(`
    <p style="margin:0 0 20px 0;font-size:18px;color:#1a1a1a;">New customer registration</p>
    <p style="margin:0 0 28px 0;">A new customer has registered on your website.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px 0;border:1px solid #efece5;border-radius:4px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px 0;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8a8578;">Name</p>
          <p style="margin:0 0 14px 0;font-size:14px;">${name || "—"}</p>
          <p style="margin:0 0 4px 0;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8a8578;">Email</p>
          <p style="margin:0 0 14px 0;font-size:14px;">${email}</p>
          <p style="margin:0 0 4px 0;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8a8578;">Registered at</p>
          <p style="margin:0 0 14px 0;font-size:14px;">${registeredAt}</p>
          <p style="margin:0 0 4px 0;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8a8578;">Customer ID</p>
          <p style="margin:0;font-size:13px;font-family:'Courier New',monospace;">${customerId}</p>
        </td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
      <tr>
        <td align="center" style="border-radius:4px;background-color:#1a1a1a;">
          <a href="${profileUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:14px;letter-spacing:1px;text-transform:uppercase;">View customer profile</a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#8a8578;">You're receiving this because "Receive new customer registration emails" is enabled for your admin account. A Parent Admin can change this from Settings &gt; Email Notifications.</p>
  `);
}

export function newCustomerRegistrationEmailText(opts: { name: string; email: string; registeredAt: string; customerId: string; profileUrl: string }): string {
  const { name, email, registeredAt, customerId, profileUrl } = opts;
  return `A new customer has registered on your website.\n\nCustomer Details:\nName: ${name || "—"}\nEmail: ${email}\nRegistered At: ${registeredAt}\nCustomer ID: ${customerId}\n\nView the customer profile: ${profileUrl}`;
}

export function adminCredentialsEmailText(opts: { email: string; tempPassword: string; loginUrl: string; isReset: boolean }): string {
  const { email, tempPassword, loginUrl, isReset } = opts;
  const intro = isReset
    ? "A Parent Admin reset your password for the MrRework admin dashboard."
    : "You've been invited as a Child Admin on the MrRework admin dashboard.";
  return `${intro}\n\nLogin URL: ${loginUrl}\nEmail: ${email}\nTemporary password: ${tempPassword}\n\nYou'll be required to change this password the first time you sign in. If you weren't expecting this email, please contact your Parent Admin.`;
}
