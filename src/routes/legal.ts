import { Router } from "express";

const router = Router();

const LAST_UPDATED = "July 29, 2026";
const PRIVACY_LAST_UPDATED = "October 13, 2026";

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
    description:
      "How Barter collects, uses, discloses, protects, and retains personal data under Singapore's PDPA.",
    lastUpdated: PRIVACY_LAST_UPDATED,
    bodyHtml: `
    <p>This Privacy Policy explains how Barter ("Barter", "we", "us") collects, uses, discloses,
    protects, and retains personal data when you use our mobile application, website, and related
    services (collectively, the "Service"). It is intended to describe our practices under
    Singapore's Personal Data Protection Act 2012 ("PDPA").</p>

    <p>Barter is currently operated on an independent, unincorporated basis and is not a
    registered company. References to Barter refer to the individual operator(s) responsible
    for the Service.</p>

    <h2>1. Personal Data We Collect</h2>
    <p>Depending on how you use the Service, we may collect:</p>
    <ul>
      <li><strong>Account and profile data:</strong> name, email address, hashed sign-in
      credentials, social sign-in identifiers, display name, profile photo, biography, city,
      country, interests, and preferences.</li>
      <li><strong>Location data:</strong> precise latitude and longitude when you grant location
      permission or provide a listing location; location labels, city, country, and search
      radius; and an approximate country or city inferred from network information.</li>
      <li><strong>Content and transactions:</strong> listing descriptions and photos, messages
      and chat images, offers, trade and meetup details, reviews, reports, and information you
      choose to include in those fields.</li>
      <li><strong>Activity data:</strong> searches, swipes, saves, follows, listing views,
      blocks, notification preferences, app-presence signals, and interactions with features.</li>
      <li><strong>Device and technical data:</strong> push-notification tokens, platform, app
      version, device type, IP address in server logs, request and diagnostic information, and
      an account identifier used for analytics.</li>
      <li><strong>Information from sign-in providers:</strong> information supplied by Apple,
      Google, or Facebook when you choose the relevant sign-in method.</li>
    </ul>
    <p>Please do not put another person's sensitive information, home address, identification
    number, financial information, or other unnecessary personal data in listings or messages.</p>

    <h2>2. How We Collect Personal Data</h2>
    <p>We collect personal data directly from you, automatically when you use the Service, from
    your device when you grant permission, from sign-in providers you select, from other users
    who interact with you, and from service providers that support the Service.</p>

    <h2>3. Purposes for Collection, Use, and Disclosure</h2>
    <p>We collect, use, and disclose personal data with your consent, deemed consent, or where
    otherwise permitted by the PDPA. We use it to:</p>
    <ul>
      <li>create and secure accounts and provide listings, discovery, offers, chat, trades,
      reviews, follows, saves, and related features;</li>
      <li>use location to filter and rank nearby listings, calculate approximate distance,
      suggest meetup areas, and infer the appropriate country catalogue;</li>
      <li>send account verification, password-reset, offer, message, trade, safety, service,
      and other requested notifications;</li>
      <li>personalise recommendations. Listing titles, descriptions, categories, condition,
      brand, and wanted categories may be converted into machine-learning embeddings;</li>
      <li>moderate text and, where enabled, assess listing or chat images for relevance or
      inappropriate content;</li>
      <li>measure feature use, diagnose faults, conduct analytics, and improve the Service;</li>
      <li>prevent fraud, abuse, prohibited conduct, and security incidents; investigate reports;
      enforce our Terms; and protect users and the public; and</li>
      <li>comply with legal obligations and establish, exercise, or defend legal claims.</li>
    </ul>

    <div class="callout">
      <p><strong>How nearby listings work.</strong> A listing place is one the seller picked from
      suggestions. Unit numbers are not accepted. A block or house is saved and shown as the
      surrounding area. Precise coordinates stay server-side for distance and ranking. Other
      people see the public place or area name, an approximate distance, and a map pin on that
      public place or neighbourhood area — not a street address, postal code, unit, block, or
      the exact stored coordinates.</p>
    </div>

    <h2>4. Data We Make Visible to Other Users</h2>
    <p>Marketplace participation requires some sharing. Other users may see your display name,
    profile photo, biography, coarse location, listings, listing photos, public reviews, trade
    statistics, and content you send to them in offers or chats. We do not display your email
    address, password, precise coordinates, street address, or postal code to other users.</p>

    <h2>5. Service Providers and Other Disclosures</h2>
    <p>We do not sell or rent personal data. We may disclose only the data reasonably needed for
    the purposes above to:</p>
    <ul>
      <li><strong>Railway</strong> or another hosting provider for application and database hosting;</li>
      <li><strong>Amazon Web Services</strong> for media storage and, where enabled, image moderation;</li>
      <li><strong>Google Firebase</strong> for analytics, push notifications, and remote configuration;</li>
      <li><strong>Resend</strong> for transactional email delivery;</li>
      <li><strong>OpenAI</strong> for listing-text embeddings used in recommendations;</li>
      <li><strong>Apple, Google, and Facebook</strong> for sign-in and token verification;</li>
      <li><strong>Google Maps, OpenStreetMap Nominatim, and Overpass</strong> for maps,
      geocoding, and meetup suggestions; and</li>
      <li>professional advisers, authorities, courts, emergency services, or other parties where
      reasonably necessary for safety, legal compliance, or legal claims.</li>
    </ul>
    <p>Providers may change as the Service develops. We select and configure providers with
    regard to the personal data involved, the service they perform, and the safeguards available,
    subject to their terms and privacy policies.</p>

    <h2>6. Overseas Transfers</h2>
    <p>Some providers process or store personal data outside Singapore, including in the United
    States and other countries where they or their subprocessors operate. When transferring
    personal data outside Singapore, we take reasonable steps required by the PDPA to ensure
    that the recipient is bound to provide a standard of protection comparable to the PDPA,
    including through contractual obligations, recognised certification, or other legally
    permitted safeguards as applicable.</p>

    <h2>7. Analytics and Communications</h2>
    <p>Firebase Analytics records product events and an internal account identifier. Advertising
    ID collection and ad-personalisation signals are disabled in the app. Search terms may be
    included in analytics, so do not enter personal data in the search box.</p>
    <p>You can disable push notifications in Barter's Settings or your device settings and mute
    listing-follow alerts. We currently use email for transactional or account-related messages
    and do not send SMS marketing or collect telephone numbers. If we introduce direct marketing,
    we will provide the notices, consent choices, and opt-out mechanisms required by law.</p>

    <h2>8. Retention and Account Deletion</h2>
    <p>We retain personal data only while it serves the purpose for which it was collected, or
    while retention is reasonably required for legal, safety, fraud-prevention, dispute, backup,
    or legitimate operational purposes. Retention depends on the data and context; for example,
    account and marketplace records are generally retained while an account is active, while
    shorter-lived verification and technical records are retained only as needed for their
    operational purpose.</p>
    <p>You can delete your account in the app or request deletion by email. This removes the
    active account and associated marketplace records from the primary database. Limited copies
    may remain in backups, security records, provider caches, or uploaded-media storage where
    technically necessary or legally permitted. They are not used for new purposes and will be
    deleted or de-identified when no longer required. If you want us to locate and remove
    uploaded media remaining after account deletion, contact our Data Protection Officer.</p>

    <h2>9. Security</h2>
    <p>We use reasonable administrative, technical, and organisational measures designed to
    prevent unauthorised access, collection, use, disclosure, copying, modification, disposal,
    or loss. Measures include access controls, password hashing, encryption and masking of email
    addresses, transport security, restricted administrative access, and data minimisation.
    No system is completely secure, and you should protect your credentials and report
    suspected misuse promptly.</p>

    <h2>10. Access, Correction, Withdrawal, and Complaints</h2>
    <p>You can view and correct many profile fields in the app. Subject to the PDPA, you may also
    ask us to:</p>
    <ul>
      <li>provide access to personal data in our possession or control and information about how
      it was used or disclosed during the preceding year;</li>
      <li>correct an error or omission in your personal data;</li>
      <li>withdraw consent to specified collection, use, or disclosure;</li>
      <li>delete your account or remaining uploaded media; or</li>
      <li>review a privacy concern or complaint.</li>
    </ul>
    <p>Email the Data Protection Officer with the subject "PDPA Request." We may need to verify
    your identity and clarify the scope of your request. Withdrawing consent does not affect
    processing already lawfully carried out. If the data is needed to provide a feature or the
    Service, withdrawal may mean that feature or your account can no longer be provided. Rights
    may be subject to exceptions under the PDPA.</p>

    <h2>11. Data Breaches</h2>
    <p>We assess suspected personal-data breaches in a reasonable and expeditious manner. Where
    a breach is notifiable under the PDPA, we will notify Singapore's Personal Data Protection
    Commission as soon as practicable and no later than three calendar days after determining
    that notification is required, and notify affected individuals where required.</p>

    <h2>12. Children's Personal Data</h2>
    <p>The Service is not intended for children under 13. If you are between 13 and 17, please
    review this Policy with a parent or guardian and make sure you understand the consequences
    of providing and withdrawing consent. If we learn that a child under 13 provided personal
    data without appropriate authorisation, contact us and we will take reasonable steps to
    remove it.</p>

    <h2>13. Changes to This Policy</h2>
    <p>We may update this Policy as the Service or law changes. We will update the date above
    and give additional notice in the app where a change is material or fresh consent is
    required.</p>

    <h2>14. Data Protection Officer</h2>
    <p>The Barter operator is the designated Data Protection Officer and public data-protection
    contact. For access, correction, withdrawal, deletion, complaints, or questions:</p>
    <p><strong>Data Protection Officer — Barter</strong><br />
    Email: <a href="mailto:support@bartersg.com">support@bartersg.com</a><br />
    Subject: PDPA Request</p>
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
    lastUpdated: PRIVACY_LAST_UPDATED,
    bodyHtml: `
    <p>You can delete your Barter account yourself in the app. The active-account
    deletion process starts immediately and is permanent — we do not keep a
    recovery waiting period, and you cannot restore the account once it is gone.</p>

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
      removes your active account and takes down your listings. Limited copies may
      remain where described below and in our Privacy Policy.</p>
    </div>

    <h2>What we delete</h2>
    <p>When you confirm, the deletion process removes the following active records
    from Barter's primary database:</p>
    <ul>
      <li>Your profile, email, and sign-in credentials</li>
      <li>Your listings (they are taken down and no longer visible to others)</li>
      <li>Offers, trades, reviews, saved items, swipe history, notifications, and
      related conversations covered by the account-deletion process</li>
    </ul>
    <p>Open offers and trades with other people are cancelled. They may see a
    notice that you left Barter. Their own listings stay up.</p>
    <p>Uploaded images, security records, provider caches, and backup copies may
    remain where technically necessary or legally permitted. They are not used
    for new purposes and are deleted or de-identified when no longer required.
    To ask us to locate and remove uploaded media that remains after deletion,
    email the Data Protection Officer below.</p>
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
