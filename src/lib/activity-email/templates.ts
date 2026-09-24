import { escapeHtml } from "./escape.js";
import { emailColors as c } from "./colors.js";

export const LOGO_CID = "barter-logo-b";

export interface ActivityEmailRendered {
  subject: string;
  text: string;
  html: string;
}

interface ShellInput {
  subject: string;
  eyebrow: string;
  headline: string;
  buttonLabel: string;
  buttonUrl: string;
  bodyTextLines: string[];
  /** HTML inside the card below the headline (quote, detail row, etc.). */
  innerHtml: string;
}

function renderShell(input: ShellInput): ActivityEmailRendered {
  const textBody = [
    "Barter",
    "",
    input.headline,
    ...input.bodyTextLines,
    "",
    `${input.buttonLabel}: ${input.buttonUrl}`,
    "",
    "You're getting this because of activity on your Barter account.",
    "bartersg.com",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:${c.pageBg};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${c.pageBg};padding:24px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background-color:${c.cardBg};border-radius:16px;border:1px solid ${c.hairline};">
<tr><td style="padding:28px 24px 8px;">
<table role="presentation" cellspacing="0" cellpadding="0"><tr>
<td style="vertical-align:middle;"><img src="cid:${LOGO_CID}" width="28" height="28" alt="Barter" style="display:block;border:0;"/></td>
<td style="vertical-align:middle;padding-left:4px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;letter-spacing:-1px;color:${c.textPrimary};line-height:1;">arter</td>
</tr></table>
</td></tr>
<tr><td style="padding:8px 24px 4px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.08em;color:${c.eyebrow};">${escapeHtml(input.eyebrow)}</td></tr>
<tr><td style="padding:4px 24px 16px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:600;line-height:1.35;color:${c.textPrimary};">${escapeHtml(input.headline)}</td></tr>
<tr><td style="padding:0 24px 20px;">${input.innerHtml}</td></tr>
<tr><td style="padding:0 24px 24px;">
<a href="${escapeHtml(input.buttonUrl)}" style="display:inline-block;background-color:${c.buttonBg};color:${c.buttonText};font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:14px 24px;border-radius:12px;">${escapeHtml(input.buttonLabel)}</a>
</td></tr>
<tr><td style="padding:0 24px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${c.textMuted};border-top:1px solid ${c.hairline};">
<p style="margin:16px 0 4px;">You're getting this because of activity on your Barter account.</p>
<p style="margin:0;"><a href="https://www.bartersg.com/" style="color:${c.eyebrow};text-decoration:none;">bartersg.com</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject: input.subject, text: textBody, html };
}

function detailRow(opts: {
  title: string;
  subtitle: string;
  imageUrl?: string | null;
}): string {
  const img = opts.imageUrl
    ? `<td style="width:56px;vertical-align:top;padding-right:12px;"><img src="${escapeHtml(opts.imageUrl)}" width="56" height="56" alt="" style="display:block;border-radius:8px;object-fit:cover;border:0;"/></td>`
    : "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${c.insetBg};border-radius:12px;">
<tr>
${img}
<td style="vertical-align:middle;padding:12px ${opts.imageUrl ? "12px" : "16px"} 12px 0;font-family:Arial,Helvetica,sans-serif;">
<div style="font-size:15px;font-weight:600;color:${c.textPrimary};margin-bottom:4px;">${escapeHtml(opts.title)}</div>
<div style="font-size:13px;color:${c.textSecondary};line-height:1.4;">${escapeHtml(opts.subtitle)}</div>
</td>
</tr>
</table>`;
}

function quoteBlock(quote: string): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${c.insetBg};border-radius:12px;">
<tr><td style="padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:${c.textSecondary};font-style:italic;">&ldquo;${escapeHtml(quote)}&rdquo;</td></tr>
</table>`;
}

export function renderNewSwapOffer(input: {
  listingTitle: string;
  senderName: string;
  offeredItemsLabel: string;
  imageUrl?: string | null;
  buttonUrl: string;
}): ActivityEmailRendered {
  const headline = `${input.senderName} wants to swap for your ${input.listingTitle}.`;
  return renderShell({
    subject: `New offer for ${input.listingTitle}`,
    eyebrow: "NEW OFFER",
    headline,
    buttonLabel: "View offer",
    buttonUrl: input.buttonUrl,
    bodyTextLines: [`They offered ${input.offeredItemsLabel}`],
    innerHtml: detailRow({
      title: input.listingTitle,
      subtitle: `They offered ${input.offeredItemsLabel}`,
      imageUrl: input.imageUrl,
    }),
  });
}

export function renderNewCashOffer(input: {
  listingTitle: string;
  senderName: string;
  cashLabel: string;
  imageUrl?: string | null;
  buttonUrl: string;
}): ActivityEmailRendered {
  const headline = `${input.senderName} offered ${input.cashLabel} for your ${input.listingTitle}.`;
  return renderShell({
    subject: `Cash offer for ${input.listingTitle}`,
    eyebrow: "CASH OFFER",
    headline,
    buttonLabel: "View offer",
    buttonUrl: input.buttonUrl,
    bodyTextLines: [`Cash offer · ${input.cashLabel}`],
    innerHtml: detailRow({
      title: input.listingTitle,
      subtitle: `Cash offer · ${input.cashLabel}`,
      imageUrl: input.imageUrl,
    }),
  });
}

export function renderSwapCounter(input: {
  listingTitle: string;
  senderName: string;
  theirItemsLabel: string;
  imageUrl?: string | null;
  buttonUrl: string;
}): ActivityEmailRendered {
  const headline = `${input.senderName} sent new swap terms for ${input.listingTitle}.`;
  return renderShell({
    subject: `Counter-offer on ${input.listingTitle}`,
    eyebrow: "COUNTER-OFFER",
    headline,
    buttonLabel: "Review counter-offer",
    buttonUrl: input.buttonUrl,
    bodyTextLines: [`They now offer ${input.theirItemsLabel}`],
    innerHtml: detailRow({
      title: input.listingTitle,
      subtitle: `They now offer ${input.theirItemsLabel}`,
      imageUrl: input.imageUrl,
    }),
  });
}

export function renderCashCounter(input: {
  listingTitle: string;
  senderName: string;
  cashLabel: string;
  imageUrl?: string | null;
  buttonUrl: string;
}): ActivityEmailRendered {
  const headline = `${input.senderName} proposed ${input.cashLabel} for ${input.listingTitle}.`;
  return renderShell({
    subject: `New cash terms for ${input.listingTitle}`,
    eyebrow: "CASH COUNTER",
    headline,
    buttonLabel: "Review counter-offer",
    buttonUrl: input.buttonUrl,
    bodyTextLines: [`Updated cash amount · ${input.cashLabel}`],
    innerHtml: detailRow({
      title: input.listingTitle,
      subtitle: `Updated cash amount · ${input.cashLabel}`,
      imageUrl: input.imageUrl,
    }),
  });
}

export function renderOfferAccepted(input: {
  listingTitle: string;
  accepterName: string;
  buttonUrl: string;
}): ActivityEmailRendered {
  const headline = `${input.accepterName} accepted the trade for ${input.listingTitle}.`;
  return renderShell({
    subject: "Your offer was accepted",
    eyebrow: "ACCEPTED",
    headline,
    buttonLabel: "Open chat",
    buttonUrl: input.buttonUrl,
    bodyTextLines: ["You can chat in the app to arrange the meetup."],
    innerHtml: detailRow({
      title: input.listingTitle,
      subtitle: "You can chat in the app to arrange the meetup.",
    }),
  });
}

export function renderOfferDeclined(input: {
  listingTitle: string;
  headline: string;
  buttonUrl: string;
}): ActivityEmailRendered {
  return renderShell({
    subject: `Offer declined — ${input.listingTitle}`,
    eyebrow: "DECLINED",
    headline: input.headline,
    buttonLabel: "View offer",
    buttonUrl: input.buttonUrl,
    bodyTextLines: [],
    innerHtml: detailRow({
      title: input.listingTitle,
      subtitle: input.headline,
    }),
  });
}

export function renderOfferWithdrawn(input: {
  listingTitle: string;
  buyerName: string;
  buttonUrl: string;
}): ActivityEmailRendered {
  const headline = `${input.buyerName} withdrew their offer for ${input.listingTitle}.`;
  return renderShell({
    subject: `Offer withdrawn — ${input.listingTitle}`,
    eyebrow: "WITHDRAWN",
    headline,
    buttonLabel: "View offer",
    buttonUrl: input.buttonUrl,
    bodyTextLines: [],
    innerHtml: detailRow({ title: input.listingTitle, subtitle: headline }),
  });
}

export function renderChatMessage(input: {
  listingTitle: string;
  senderName: string;
  quote: string;
  buttonUrl: string;
}): ActivityEmailRendered {
  const headline = `${input.senderName} sent a message on the ${input.listingTitle} trade.`;
  return renderShell({
    subject: `${input.senderName} messaged you about ${input.listingTitle}`,
    eyebrow: "CHAT",
    headline,
    buttonLabel: "Open chat",
    buttonUrl: input.buttonUrl,
    bodyTextLines: [input.quote],
    innerHtml: quoteBlock(input.quote),
  });
}

export function renderListingSaved(input: {
  listingTitle: string;
  saveCount: number;
  imageUrl?: string | null;
  buttonUrl: string;
}): ActivityEmailRendered {
  const headline = `Someone bookmarked your ${input.listingTitle}.`;
  const countLine =
    input.saveCount === 1
      ? "1 person has saved this listing."
      : `${input.saveCount} people have saved this listing.`;
  return renderShell({
    subject: `Someone saved ${input.listingTitle}`,
    eyebrow: "SAVED",
    headline,
    buttonLabel: "View your listing",
    buttonUrl: input.buttonUrl,
    bodyTextLines: [countLine],
    innerHtml: detailRow({
      title: input.listingTitle,
      subtitle: countLine,
      imageUrl: input.imageUrl,
    }),
  });
}
