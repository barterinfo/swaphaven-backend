import { Router } from "express";

const router = Router();

const LAST_UPDATED = "July 29, 2026";

const STYLES = `
    :root { color-scheme: dark; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 0; padding: 0; background: #0f0f12; color: #f5f5f7;
      line-height: 1.6;
    }
    .wrap { max-width: 42rem; margin: 0 auto; padding: 3rem 1.5rem 5rem; }
    h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
    .updated { color: #a1a1aa; font-size: 0.875rem; margin-bottom: 2.5rem; }
    h2 { font-size: 1.15rem; margin-top: 2.25rem; color: #f5f5f7; }
    p, li { color: #d4d4d8; font-size: 0.95rem; }
    ul, ol { padding-left: 1.25rem; }
    ol li { margin-bottom: 0.45rem; }
    a { color: #a78bfa; }
    .callout {
      border: 1px solid #7c3aed; background: rgba(124, 58, 237, 0.1);
      border-radius: 12px; padding: 1rem 1.25rem; margin: 1.25rem 0;
    }
    .callout p { color: #ede9fe; margin: 0; }
    .callout strong { color: #fff; }
`;

function buildLegalPageHtml(opts: {
  title: string;
  description: string;
  bodyHtml: string;
  lastUpdated?: string;
}): string {
  const lastUpdated = opts.lastUpdated ?? LAST_UPDATED;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${opts.title} · Barter</title>
  <meta name="description" content="${opts.description}" />
  <meta name="robots" content="index, follow" />
  <style>${STYLES}</style>
</head>
<body>
  <div class="wrap">
    <h1>${opts.title}</h1>
    <p class="updated">Last updated: ${lastUpdated}</p>
    ${opts.bodyHtml}
  </div>
</body>
</html>`;
}

function buildPrivacyPolicyHtml(): string {
  return buildLegalPageHtml({
    title: "Privacy Policy",
    description: "Barter's privacy policy, including your responsibility as a user of the app.",
    bodyHtml: `
    <p>This Privacy Policy explains how Barter ("Barter", "the app", "we", "us") collects, uses,
    and shares information when you use our mobile application and related services, and it
    describes your responsibilities as a user of the app.</p>

    <p>Barter is currently operated on an independent, unincorporated basis and is not a
    registered company. References in this Policy to "Barter," "we," or "us" refer to the
    individual(s) who operate the app, not a corporate entity, and there are no separate
    employees or corporate affiliates at this time.</p>

    <h2>1. Information We Collect</h2>
    <ul>
      <li>Account information you provide, such as your name, email address, and profile photo.</li>
      <li>Content you create, such as listings, messages, offers, and trade history.</li>
      <li>Device and usage information, such as app version, device type, and interaction logs.</li>
      <li>Approximate location, where you choose to enable it, to show nearby listings.</li>
    </ul>

    <h2>2. How We Use Your Information</h2>
    <ul>
      <li>To operate, maintain, and improve the app's features (listings, swiping, offers, chat, trades).</li>
      <li>To communicate with you about your account, trades, and updates to our services.</li>
      <li>To detect, prevent, and address fraud, abuse, and violations of our terms.</li>
    </ul>

    <h2>3. Sharing of Information</h2>
    <p>We do not sell your personal information. We may share limited information with other
    users as part of core app functionality (e.g. your display name and listing details are
    visible to users you interact with), and with service providers who help us operate the app
    (e.g. cloud hosting, push notifications, email delivery), under confidentiality obligations.</p>

    <h2>4. Data Security</h2>
    <p>We take reasonable technical and organizational measures to protect your information.
    However, no method of transmission or storage is completely secure, and we cannot guarantee
    absolute security.</p>

    <div class="callout">
      <p><strong>5. Your Responsibility &amp; Assumption of Risk.</strong> Barter is a platform
      that helps users discover, list, and arrange trades of items with other users. We do not
      own, inspect, or verify the items listed, and we do not conduct background checks on users.
      You are solely responsible for evaluating other users, verifying the condition and legality
      of items, and exercising caution and good judgment in all interactions, including any
      in-person meetups or exchanges arranged through the app.</p>
    </div>

    <h2>6. Limitation of Liability</h2>
    <p>To the fullest extent permitted by applicable law, Barter and the individual(s) who
    operate it are not responsible or liable for any injury, loss, damage, dispute, tragedy,
    theft, fraud, or other wrongdoing — whether direct, indirect, incidental, consequential, or
    otherwise — arising from or related to your use of the app, any item exchanged through the
    app, or your interactions or meetups with other users, whether online or in person. The app
    is provided "as is" and "as available," without warranties of any kind. By using the app, you
    acknowledge and agree that you do so entirely at your own risk, and that you are solely
    responsible for your own safety, decisions, and conduct while using it.</p>

    <h2>7. Children's Privacy</h2>
    <p>Barter is not intended for children under 13, and we do not knowingly collect information
    from children under 13.</p>

    <h2>8. Changes to This Policy</h2>
    <p>We may update this Privacy Policy from time to time. We will update the "Last updated"
    date above when we do, and material changes may be communicated in-app.</p>

    <h2>9. Contact Us</h2>
    <p>If you have questions about this Privacy Policy, contact us at
    <a href="mailto:support@bartersg.com">support@bartersg.com</a>.</p>
    `,
  });
}

function buildTermsHtml(): string {
  return buildLegalPageHtml({
    title: "Terms and Conditions",
    description: "Barter's terms and conditions, including your responsibility as a user of the app.",
    bodyHtml: `
    <p>These Terms and Conditions ("Terms") govern your access to and use of Barter ("Barter",
    "the app", "we", "us"). By creating an account or using the app, you agree to be bound by
    these Terms. If you do not agree, do not use the app.</p>

    <p>Barter is currently operated on an independent, unincorporated basis and is not a
    registered company. References in these Terms to "Barter," "we," or "us" refer to the
    individual(s) who operate the app, not a corporate entity, and there are no separate
    employees or corporate affiliates at this time.</p>

    <h2>1. Eligibility &amp; Accounts</h2>
    <p>You must be at least 13 years old to use Barter. You are responsible for maintaining the
    confidentiality of your account credentials and for all activity that occurs under your
    account.</p>

    <h2>2. The Service</h2>
    <p>Barter is a platform that lets users list, discover, and arrange trades of items with
    other users. We do not own, sell, inspect, authenticate, or take title to any item listed on
    the app, and we are not a party to any trade or agreement between users.</p>

    <div class="callout">
      <p><strong>3. Your Responsibility &amp; Assumption of Risk.</strong> You are solely
      responsible for your own conduct, decisions, and safety while using the app. This
      includes, without limitation: evaluating the trustworthiness of other users, verifying the
      condition, authenticity, and legality of any item, and exercising caution and good
      judgment when communicating with other users and when arranging or attending any
      in-person meetup or exchange. We do not conduct background checks or verify the identity
      of users, and we do not guarantee the accuracy of any listing, profile, or message.</p>
    </div>

    <h2>4. Prohibited Conduct</h2>
    <ul>
      <li>Listing stolen, illegal, counterfeit, hazardous, or prohibited items.</li>
      <li>Harassing, threatening, defrauding, or endangering other users.</li>
      <li>Misrepresenting your identity, or the condition, ownership, or legality of an item.</li>
      <li>Using the app for any unlawful purpose or in violation of these Terms.</li>
    </ul>
    <p>We may suspend or terminate accounts that violate these Terms, at our discretion.</p>

    <h2>5. Disclaimer of Warranties</h2>
    <p>The app is provided "as is" and "as available," without warranties of any kind, whether
    express, implied, or statutory, including warranties of merchantability, fitness for a
    particular purpose, or non-infringement. We do not warrant that the app will be
    uninterrupted, secure, or error-free, or that any user, listing, or trade will meet your
    expectations.</p>

    <h2>6. Limitation of Liability</h2>
    <p>To the fullest extent permitted by applicable law, Barter and the individual(s) who
    operate it shall not be liable for any injury, loss, damage, dispute, tragedy, theft, fraud,
    or other wrongdoing — whether direct, indirect, incidental, consequential, special, or
    otherwise — arising from or related to your use of the app, any item exchanged through the
    app, or your interactions or meetups with other users, whether online or in person. This
    limitation applies regardless of the legal theory asserted, even if we have been advised of
    the possibility of such damages. By using the app, you acknowledge and agree that you do so
    entirely at your own risk.</p>

    <h2>7. Indemnification</h2>
    <p>You agree to indemnify and hold harmless Barter and the individual(s) who operate it from
    any claims, damages, losses, or expenses (including legal fees) arising from your use of the
    app, your violation of these Terms, or your interactions or trades with other users.</p>

    <h2>8. Termination</h2>
    <p>You may stop using the app at any time. We may suspend or terminate your access to the
    app at any time, with or without notice, for any reason, including violation of these
    Terms.</p>

    <h2>9. Governing Law</h2>
    <p>These Terms are governed by the laws of Singapore, without regard to its conflict of law
    principles. Any dispute arising from these Terms or your use of the app shall be subject to
    the exclusive jurisdiction of the courts of Singapore.</p>

    <h2>10. Changes to These Terms</h2>
    <p>We may update these Terms from time to time. We will update the "Last updated" date above
    when we do, and material changes may be communicated in-app. Continued use of the app after
    changes take effect constitutes acceptance of the updated Terms.</p>

    <h2>11. Contact Us</h2>
    <p>If you have questions about these Terms, contact us at
    <a href="mailto:support@bartersg.com">support@bartersg.com</a>.</p>
    `,
  });
}

function buildDeleteAccountHtml(): string {
  return buildLegalPageHtml({
    title: "How do I delete my Barter account?",
    description:
      "Step-by-step instructions to delete your Barter account in the app, and what happens to your data.",
    lastUpdated: "August 19, 2026",
    bodyHtml: `
    <p>You can delete your Barter account yourself in the app. Deletion is
    immediate and permanent — we do not keep a waiting period, and you cannot
    recover the account once it is gone.</p>

    <h2>Delete your account in the app</h2>
    <ol>
      <li>Open the Barter app and sign in.</li>
      <li>Go to the <strong>Profile</strong> tab (your own profile).</li>
      <li>Tap the <strong>gear</strong> icon at the top of your profile to open Settings.</li>
      <li>Scroll down to <strong>Delete my profile</strong>.</li>
      <li>Tap <strong>Delete my profile</strong>.</li>
      <li>Read the warning, then tap <strong>Delete</strong> to confirm.</li>
    </ol>
    <p>The app will sign you out when deletion finishes.</p>

    <div class="callout">
      <p><strong>This cannot be undone.</strong> Deleting your profile permanently
      removes your account, listings, offers, and chats.</p>
    </div>

    <h2>What we delete</h2>
    <p>When you confirm, we immediately purge your account from Barter:</p>
    <ul>
      <li>Your profile, email, and sign-in credentials</li>
      <li>Your listings (they are taken down and no longer visible to others)</li>
      <li>Your offers, chats, trade history, and reviews</li>
      <li>Saved items, swipe history, and notification records tied to you</li>
    </ul>
    <p>Open offers and trades with other people are cancelled. They may see a
    notice that you left Barter. Their own listings stay up.</p>
    <p>If you return later, you will need to create a new account. You can use
    the same email address.</p>

    <h2>If you cannot open the app</h2>
    <p>Email us from the address on your Barter account and ask us to delete it:</p>
    <p><a href="mailto:support@bartersg.com">support@bartersg.com</a></p>
    <p>Include the display name on the account if you can. We will delete the
    same data as the in-app flow once we confirm it is your account.</p>
    `,
  });
}

// ─── GET /privacy ───────────────────────────────────────────────────────────
// Static privacy policy page, publicly served at https://www.bartersg.com/privacy
router.get("/privacy", (_req, res) => {
  res.type("html").send(buildPrivacyPolicyHtml());
});

// ─── GET /terms ──────────────────────────────────────────────────────────────
// Static terms & conditions page, publicly served at https://www.bartersg.com/terms
router.get("/terms", (_req, res) => {
  res.type("html").send(buildTermsHtml());
});

// ─── GET /delete-account ─────────────────────────────────────────────────────
// Public help page for Play Console / App Store account-deletion URL.
// Served at https://www.bartersg.com/delete-account
router.get("/delete-account", (_req, res) => {
  res.type("html").send(buildDeleteAccountHtml());
});

export default router;
