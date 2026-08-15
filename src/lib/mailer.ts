import { Resend } from "resend";
import { env } from "../config/env.js";

export class MailerError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "MailerError";
  }
}

function getClient(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new MailerError("RESEND_API_KEY is not configured");
  }
  return new Resend(env.RESEND_API_KEY);
}

async function sendOtpEmail(params: {
  to: string;
  otp: string;
  expiresMinutes: number;
  subject: string;
  purposeLabel: string;
  failLabel: string;
}): Promise<void> {
  if (!env.EMAIL_FROM) {
    throw new MailerError("EMAIL_FROM is not configured");
  }

  const { to, otp, expiresMinutes, subject, purposeLabel, failLabel } = params;
  const text =
    `Your ${purposeLabel} code is ${otp}.\n\n` +
    `It expires in ${expiresMinutes} minutes. If you did not request this, you can ignore this email.`;
  const html =
    `<p>Your ${purposeLabel} code is <strong>${otp}</strong>.</p>` +
    `<p>It expires in ${expiresMinutes} minutes. If you did not request this, you can ignore this email.</p>`;

  try {
    const resend = getClient();
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: [to],
      subject,
      text,
      html,
    });
    if (error) {
      throw new MailerError(error.message ?? "Resend send failed", error);
    }
  } catch (err) {
    if (err instanceof MailerError) throw err;
    throw new MailerError(
      err instanceof Error ? err.message : `Failed to send ${failLabel} email`,
      err,
    );
  }
}

/**
 * Sends a password-reset OTP email via Resend.
 * Throws {@link MailerError} when env is missing or Resend rejects the send.
 */
export async function sendPasswordResetOtp(params: {
  to: string;
  otp: string;
  expiresMinutes: number;
}): Promise<void> {
  await sendOtpEmail({
    ...params,
    subject: "Your Barter reset code",
    purposeLabel: "password reset",
    failLabel: "reset",
  });
}

/**
 * Sends a registration verification OTP email via Resend.
 * Throws {@link MailerError} when env is missing or Resend rejects the send.
 */
export async function sendRegistrationOtp(params: {
  to: string;
  otp: string;
  expiresMinutes: number;
}): Promise<void> {
  await sendOtpEmail({
    ...params,
    subject: "Your Barter verification code",
    purposeLabel: "verification",
    failLabel: "verification",
  });
}

/**
 * Notifies ops of a new content report. Best-effort — missing mail config logs
 * and returns; the report row is already persisted for manual review.
 */
export async function notifyContentReport(params: {
  reportId: string;
  reporterId: string;
  reportedUserId: string;
  targetType: string;
  targetId: string;
  reason: string;
  details?: string | null;
}): Promise<void> {
  const to = env.SUPPORT_EMAIL ?? "support@bartersg.com";
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.info(
      `[safety] Report ${params.reportId} queued (pending). Mailer not configured — check DB content_reports.`,
    );
    return;
  }

  const text = [
    "New Barter content report (status: pending — no auto-ban).",
    "",
    `Report ID: ${params.reportId}`,
    `Target: ${params.targetType} ${params.targetId}`,
    `Reported user: ${params.reportedUserId}`,
    `Reporter: ${params.reporterId}`,
    `Reason: ${params.reason}`,
    params.details ? `Details: ${params.details}` : null,
    "",
    "Review in DB (content_reports). Mark dismissed or actioned after you decide.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const resend = getClient();
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: [to],
      subject: `[Barter] Report: ${params.reason} (${params.targetType})`,
      text,
    });
    if (error) {
      console.error("[safety] Failed to email content report:", error);
    }
  } catch (err) {
    console.error("[safety] Failed to email content report:", err);
  }
}
