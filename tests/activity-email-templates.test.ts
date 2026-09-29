import { describe, expect, it } from "vitest";
import {
  inboxChatUrl,
  inboxOfferUrl,
  profileUrl,
} from "../src/lib/activity-email/links.js";
import {
  renderCashCounter,
  renderChatMessage,
  renderListingSaved,
  renderNewCashOffer,
  renderNewSwapOffer,
  renderOfferAccepted,
  renderOfferDeclined,
  renderOfferWithdrawn,
  renderSwapCounter,
} from "../src/lib/activity-email/templates.js";

describe("activity email templates", () => {
  const offerUrl = inboxOfferUrl("offer-1");
  const chatUrl = inboxChatUrl("conv-1");
  const profileLink = profileUrl("user-saver-1");

  it("new swap offer", () => {
    const r = renderNewSwapOffer({
      listingTitle: "Vintage Guitar",
      senderName: "Alex",
      offeredItemsLabel: "Polaroid Camera + Film",
      buttonUrl: offerUrl,
    });
    expect(r.subject).toBe("New offer for Vintage Guitar");
    expect(r.text).toContain("Alex wants to swap for your Vintage Guitar.");
    expect(r.html).toContain("NEW OFFER");
    expect(r.html).toContain(offerUrl);
  });

  it("new cash offer", () => {
    const r = renderNewCashOffer({
      listingTitle: "Vintage Guitar",
      senderName: "Alex",
      cashLabel: "$80",
      buttonUrl: offerUrl,
    });
    expect(r.subject).toBe("Cash offer for Vintage Guitar");
    expect(r.text).toContain("Alex offered $80");
    expect(r.html).toContain("CASH OFFER");
  });

  it("swap counter", () => {
    const r = renderSwapCounter({
      listingTitle: "Vintage Guitar",
      senderName: "Alex",
      theirItemsLabel: "Film Camera",
      buttonUrl: offerUrl,
    });
    expect(r.subject).toBe("Counter-offer on Vintage Guitar");
    expect(r.html).toContain("COUNTER-OFFER");
  });

  it("cash counter", () => {
    const r = renderCashCounter({
      listingTitle: "Vintage Guitar",
      senderName: "Alex",
      cashLabel: "$60",
      buttonUrl: offerUrl,
    });
    expect(r.subject).toContain("cash terms");
    expect(r.html).toContain("CASH COUNTER");
  });

  it("offer accepted", () => {
    const r = renderOfferAccepted({
      listingTitle: "Vintage Guitar",
      accepterName: "Alex",
      buttonUrl: chatUrl,
    });
    expect(r.subject).toBe("Your offer was accepted");
    expect(r.html).toContain(chatUrl);
    expect(r.html).toContain("Open chat");
  });

  it("offer declined manual", () => {
    const r = renderOfferDeclined({
      listingTitle: "Vintage Guitar",
      headline: "Your offer for Vintage Guitar was declined.",
      buttonUrl: offerUrl,
    });
    expect(r.subject).toBe("Offer declined — Vintage Guitar");
    expect(r.html).toContain("DECLINED");
  });

  it("offer withdrawn", () => {
    const r = renderOfferWithdrawn({
      listingTitle: "Vintage Guitar",
      buyerName: "Alex",
      buttonUrl: offerUrl,
    });
    expect(r.subject).toContain("withdrawn");
    expect(r.html).toContain("WITHDRAWN");
  });

  it("chat message", () => {
    const r = renderChatMessage({
      listingTitle: "Vintage Guitar",
      senderName: "Alex",
      quote: "Can we meet tomorrow?",
      buttonUrl: chatUrl,
    });
    expect(r.subject).toContain("Alex messaged you");
    expect(r.html).toContain("CHAT");
    expect(r.html).toContain("Can we meet tomorrow?");
  });

  it("listing saved", () => {
    const r = renderListingSaved({
      listingTitle: "Vintage Guitar",
      saverName: "Alex",
      buttonUrl: profileLink,
    });
    expect(r.subject).toBe("Alex saved your Vintage Guitar");
    expect(r.text).toContain("Alex bookmarked your Vintage Guitar");
    expect(r.html).toContain("View profile");
    expect(r.html).toContain("SAVED");
    expect(r.html).toContain(profileLink);
  });
});
