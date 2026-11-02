import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import {
  verificationEmailHtml, verificationEmailText,
  adminCredentialsEmailHtml, adminCredentialsEmailText,
  newCustomerRegistrationEmailHtml, newCustomerRegistrationEmailText,
  emailVerificationOtpHtml, emailVerificationOtpText,
} from "./emailTemplates";

// Real outbound email via SMTP (nodemailer) — every real ESP (Resend, SES,
// Postmark, SendGrid, a corporate mail server) exposes SMTP credentials, so
// this one transport works with any of them purely through environment
// variables, without tying the app to a vendor-specific SDK/API shape.
//
// Configuration (see .env.example):
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM
//
// If SMTP_HOST isn't set (local dev, or a deploy that hasn't configured
// mail yet), this falls back to the previous console-log behavior instead
// of failing — the same "gracefully unavailable until configured" pattern
// already used for PayPal elsewhere in this app.
//
// sendMail() never throws: none of its callers (register, forgot-password,
// resend-verification) wrap it in try/catch, and forgot-password in
// particular must always return its generic "if that account exists..."
// response regardless of whether the email actually went out, both to
// avoid a 500 turning into a user-enumeration side channel and so a
// transient provider hiccup doesn't break the request. A delivery failure
// is logged (not silently swallowed) so it's visible in production logs/
// monitoring — mirroring activityLog.ts's existing "this side effect must
// never break the primary flow, but must not vanish silently either"
// contract.
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? "587");
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const EMAIL_FROM = process.env.EMAIL_FROM || "MrRework <noreply@riaajvintage.com>";
const SEND_TIMEOUT_MS = 10_000;

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!SMTP_HOST) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  });
  return transporter;
}

// Verifies the SMTP connection/credentials without sending anything — used
// by the local testing checklist to confirm configuration before relying on
// a real send. Returns false (never throws) if SMTP isn't configured or the
// handshake fails; callers should treat both the same way.
export async function verifySmtpConnection(): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.verify();
    return true;
  } catch (err) {
    console.error("[mail] SMTP connection verify failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

export interface MailAttachment { filename: string; content: Buffer; contentType?: string }

export async function sendMail({ to, subject, text, html, attachments }: { to: string; subject: string; text: string; html?: string; attachments?: MailAttachment[] }): Promise<void> {
  const t = getTransporter();
  if (!t) {
    // Logs the attachment's filename only, never its bytes — the stub path
    // exists purely so local/unconfigured dev can see what *would* have
    // been sent, not to dump a PDF's contents into the console.
    const attachmentNote = attachments?.length ? `\n[attachments: ${attachments.map((a) => a.filename).join(", ")}]` : "";
    console.log(`[mail:stub, SMTP_HOST not configured] To: ${to}\nSubject: ${subject}\n\n${text}${attachmentNote}`);
    return;
  }

  try {
    await t.sendMail({ from: EMAIL_FROM, to, subject, text, html, attachments });
    console.log(`[mail] Sent "${subject}" to ${to}`);
  } catch (err) {
    console.error(`[mail] Failed to send "${subject}" to ${to}:`, err instanceof Error ? err.message : err);
  }
}

// Sends the premium HTML verification email (falls back to the plain-text
// console stub via sendMail() itself when SMTP isn't configured).
export async function sendVerificationEmail(to: string, verifyUrl: string, expiresInHours = 24): Promise<void> {
  await sendMail({
    to,
    subject: "Verify your email",
    text: verificationEmailText(verifyUrl, expiresInHours),
    html: verificationEmailHtml(verifyUrl, expiresInHours),
  });
}

// Registration-flow OTP — see src/lib/customerAuth.ts (issueOtp,
// resendEmailVerificationOtp) for where `otp` is generated and hashed
// before this is ever called; this function is the only place the raw
// code is handled after that, and it goes straight into the email, never
// into a log line or a return value.
export async function sendEmailVerificationOTP(userEmail: string, userName: string, otp: string, expiresInMinutes = 10): Promise<void> {
  await sendMail({
    to: userEmail,
    subject: "Verify Your Email Address",
    text: emailVerificationOtpText({ name: userName, otp, expiresInMinutes }),
    html: emailVerificationOtpHtml({ name: userName, otp, expiresInMinutes }),
  });
}

export interface NewCustomerRegistrationData {
  name: string;
  email: string;
  registeredAt: string;
  customerId: string;
  profileUrl: string;
}

// Notifies one admin that a new customer registered — called once per
// opted-in admin from notifyAdminsOfCustomerRegistration() in
// src/lib/adminNotifications.ts, never directly from the registration
// route itself.
export async function sendNewCustomerRegistrationEmail(adminEmail: string, customerData: NewCustomerRegistrationData): Promise<void> {
  await sendMail({
    to: adminEmail,
    subject: `New Customer Registration - ${customerData.name || customerData.email}`,
    text: newCustomerRegistrationEmailText(customerData),
    html: newCustomerRegistrationEmailHtml(customerData),
  });
}

// Sends a Child Admin their temporary login password — used both for the
// initial invite and for a Parent Admin's "Reset Password" action (see
// adminCredentialsEmailHtml's isReset flag for the only difference).
export async function sendAdminCredentialsEmail(opts: { to: string; tempPassword: string; loginUrl: string; isReset: boolean }): Promise<void> {
  await sendMail({
    to: opts.to,
    subject: opts.isReset ? "Your admin password has been reset" : "You've been invited to the MrRework admin dashboard",
    text: adminCredentialsEmailText({ email: opts.to, tempPassword: opts.tempPassword, loginUrl: opts.loginUrl, isReset: opts.isReset }),
    html: adminCredentialsEmailHtml({ email: opts.to, tempPassword: opts.tempPassword, loginUrl: opts.loginUrl, isReset: opts.isReset }),
  });
}
