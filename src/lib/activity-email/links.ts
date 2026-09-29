const BASE = "https://www.bartersg.com";

export function inboxOfferUrl(offerId: string): string {
  return `${BASE}/inbox/offers/${offerId}`;
}

export function inboxChatUrl(conversationId: string): string {
  return `${BASE}/inbox/chats/${conversationId}`;
}

export function inboxListingUrl(listingId: string): string {
  return `${BASE}/inbox/listings/${listingId}`;
}

export function profileUrl(userId: string): string {
  return `${BASE}/users/${userId}`;
}

export const LANDING_REDIRECT = `${BASE}/`;
