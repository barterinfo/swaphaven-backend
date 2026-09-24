import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resend } from "resend";
import { env } from "../../config/env.js";
import type { ActivityEmailRendered } from "./templates.js";
import { LOGO_CID } from "./templates.js";

const logoPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "assets",
  "barter_logo_b_only.png",
);

let logoBytes: Buffer | null = null;

function loadLogo(): Buffer {
  if (!logoBytes) {
    logoBytes = fs.readFileSync(logoPath);
  }
  return logoBytes;
}

/**
 * Sends a rendered activity email. Best-effort: logs and returns when mail is
 * not configured or Resend rejects the send.
 */
export async function sendActivityEmail(
  to: string,
  rendered: ActivityEmailRendered,
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.info("[activity-email] Mailer not configured — skipping send.");
    return;
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: [to],
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    attachments: [
      {
        filename: "barter-logo-b.png",
        content: loadLogo(),
        contentId: LOGO_CID,
      },
    ],
  });

  if (error) {
    console.error("[activity-email] Resend send failed:", error);
  }
}
