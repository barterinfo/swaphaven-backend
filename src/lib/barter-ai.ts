import { env } from "../config/env.js";
import { AppError } from "../middleware/error.js";

export type BarterAiPingResult =
  | { skipped: true }
  | { skipped: false; status: string; service: string; timestamp: string };

export type BarterAiPublicPingResult =
  | { skipped: true }
  | {
      skipped: false;
      status: string;
      service: string;
      access: string;
      timestamp: string;
    };

const DEFAULT_TIMEOUT_MS = 5_000;
const RECOMMEND_TIMEOUT_MS = 800;
const EMBED_TIMEOUT_MS = 15_000;
/** Must exceed barter-ai image fetch + Gemini suggest (≈15s + 55s). */
const SUGGEST_TIMEOUT_MS = 75_000;
/** Intent + optional seek rank (embed + candidates). */
const ASK_TIMEOUT_MS = 25_000;

export type BarterAiListingSuggestion = {
  title: string;
  description: string;
  categorySlug: string;
  condition: "new" | "like_new" | "great" | "good" | "fair";
  brand: string | null;
  ageRange: string | null;
  estimatedValueCents: number | null;
  pricingRationale: string | null;
  wantedCategorySlugs: string[];
  wantedFreeText: string | null;
  confidence: number;
};

export type SuggestListingFromImagesBody = {
  imageUrls: string[];
  country?: string;
  categoryCatalog: Array<{ id: string; name: string; slug: string }>;
};

export type BarterAiRankedItem = {
  listingId: string;
  score: number;
  reason: string | null;
};

export type BarterAiRecommendResult =
  | { skipped: true }
  | { skipped: false; items: BarterAiRankedItem[] };


function barterAiBaseUrl(): string | null {
  return env.BARTER_AI_URL?.replace(/\/$/, "") ?? null;
}

function configured(): { baseUrl: string; secret: string } | null {
  const baseUrl = barterAiBaseUrl();
  const secret = env.BARTER_AI_SECRET;
  if (!baseUrl) return null;
  if (!secret) {
    throw new AppError(
      500,
      "barter_ai_misconfigured",
      "BARTER_AI_URL is set but BARTER_AI_SECRET is missing",
    );
  }
  return { baseUrl, secret };
}

async function fetchBarterAi<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number,
  errorLabel: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(path, { ...init, signal: controller.signal });

    if (!res.ok) {
      throw new AppError(
        502,
        "barter_ai_error",
        `${errorLabel} failed with HTTP ${res.status}`,
      );
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const message =
      err instanceof Error && err.name === "AbortError"
        ? `${errorLabel} timed out`
        : `${errorLabel} failed: ${err instanceof Error ? err.message : String(err)}`;
    throw new AppError(502, "barter_ai_unreachable", message);
  } finally {
    clearTimeout(timer);
  }
}

/** Public barter-ai liveness — only needs BARTER_AI_URL. */
export async function publicPing(
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<BarterAiPublicPingResult> {
  const baseUrl = barterAiBaseUrl();
  if (!baseUrl) return { skipped: true };

  const body = await fetchBarterAi<{
    status?: string;
    service?: string;
    access?: string;
    timestamp?: string;
  }>(
    `${baseUrl}/api/ping`,
    { method: "GET", headers: { Accept: "application/json" } },
    timeoutMs,
    "barter-ai public ping",
  );

  return {
    skipped: false,
    status: body.status ?? "ok",
    service: body.service ?? "barter-ai",
    access: body.access ?? "public",
    timestamp: body.timestamp ?? new Date().toISOString(),
  };
}

/**
 * Optional HTTP client for the barter-ai companion service.
 * No-ops when BARTER_AI_URL is unset so existing API behavior is unchanged.
 */
export async function ping(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<BarterAiPingResult> {
  const cfg = configured();
  if (!cfg) return { skipped: true };

  const body = await fetchBarterAi<{
    status?: string;
    service?: string;
    timestamp?: string;
  }>(
    `${cfg.baseUrl}/api/internal/ping`,
    {
      method: "GET",
      headers: {
        "X-Internal-Key": cfg.secret,
        Accept: "application/json",
      },
    },
    timeoutMs,
    "barter-ai internal ping",
  );

  return {
    skipped: false,
    status: body.status ?? "ok",
    service: body.service ?? "barter-ai",
    timestamp: body.timestamp ?? new Date().toISOString(),
  };
}

type RecommendBody = {
  userId?: string;
  listingId?: string;
  excludeIds: string[];
  excludeOwnerIds: string[];
  followedOwnerIds?: string[];
  country: string;
  category?: string;
  /** When true, rank only free giveaway listings. */
  giveawayOnly?: boolean;
  limit: number;
  candidateIds?: string[];
};

async function recommend(
  path:
    | "/api/internal/recommend/related"
    | "/api/internal/recommend/deck"
    | "/api/internal/recommend/search",
  body: RecommendBody,
): Promise<BarterAiRecommendResult> {
  let cfg: { baseUrl: string; secret: string } | null;
  try {
    cfg = configured();
  } catch {
    return { skipped: true };
  }
  if (!cfg) return { skipped: true };

  try {
    const json = await fetchBarterAi<{ items?: BarterAiRankedItem[] }>(
      `${cfg.baseUrl}${path}`,
      {
        method: "POST",
        headers: {
          "X-Internal-Key": cfg.secret,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      RECOMMEND_TIMEOUT_MS,
      "barter-ai recommend",
    );
    return { skipped: false, items: json.items ?? [] };
  } catch (err) {
    console.error("[barter-ai recommend]", err);
    return { skipped: true };
  }
}

export function recommendRelated(body: RecommendBody): Promise<BarterAiRecommendResult> {
  return recommend("/api/internal/recommend/related", body);
}

export function recommendDeck(body: RecommendBody): Promise<BarterAiRecommendResult> {
  return recommend("/api/internal/recommend/deck", body);
}

export function recommendSearch(body: RecommendBody & { candidateIds: string[] }): Promise<BarterAiRecommendResult> {
  return recommend("/api/internal/recommend/search", body);
}

/** Fire-and-forget listing embed. Never throws into listing create/update. */
export function scheduleListingEmbed(listingId: string): void {
  void embedListing(listingId).catch((err) => {
    console.error("[barter-ai embed]", err);
  });
}

/**
 * Vision suggest for create-listing auto-fill.
 * Throws AppError 503 when barter-ai is unset or returns suggest-unavailable.
 */
export async function suggestListingFromImages(
  body: SuggestListingFromImagesBody,
): Promise<BarterAiListingSuggestion> {
  const cfg = configured();
  if (!cfg) {
    throw new AppError(
      503,
      "ai_suggest_unavailable",
      "AI listing suggest is not configured",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUGGEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.baseUrl}/api/internal/suggest/listing`, {
      method: "POST",
      headers: {
        "X-Internal-Key": cfg.secret,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      const code = errBody?.error ?? "";
      // Missing key, quota, or budget cut — clients should fall back to manual entry.
      if (
        res.status === 503 ||
        res.status === 429 ||
        code === "ai_suggest_unconfigured" ||
        code === "ai_suggest_unavailable"
      ) {
        throw new AppError(
          503,
          "ai_suggest_unavailable",
          errBody?.message ?? "AI listing suggest is unavailable",
        );
      }
      throw new AppError(
        502,
        "barter_ai_error",
        `barter-ai suggest failed with HTTP ${res.status}`,
      );
    }

    return (await res.json()) as BarterAiListingSuggestion;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "barter-ai suggest timed out"
        : `barter-ai suggest failed: ${err instanceof Error ? err.message : String(err)}`;
    throw new AppError(502, "barter_ai_unreachable", message);
  } finally {
    clearTimeout(timer);
  }
}

async function embedListing(listingId: string): Promise<void> {
  let cfg: { baseUrl: string; secret: string } | null;
  try {
    cfg = configured();
  } catch {
    return;
  }
  if (!cfg) return;

  await fetchBarterAi(
    `${cfg.baseUrl}/api/internal/embed/listing`,
    {
      method: "POST",
      headers: {
        "X-Internal-Key": cfg.secret,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ listingId }),
    },
    EMBED_TIMEOUT_MS,
    "barter-ai embed",
  );
}

/** Awaitable listing embed — used before want-match so cosine can run. */
export async function embedListingAwait(listingId: string): Promise<void> {
  await embedListing(listingId);
}

export type BarterAiAskIntent = "seek" | "sell" | "both" | "unclear";

export type BarterAiAskConstraints = {
  brand: string | null;
  condition: "new" | "like_new" | "great" | "good" | "fair" | null;
  maxValueCents: number | null;
};

export type BarterAiAskSellDraft = {
  title: string;
  categorySlug: string;
  description: string;
};

export type BarterAiAskRankedItem = {
  listingId: string;
  score: number;
  reason: string | null;
  suggestedClosetCategory: string | null;
};

export type BarterAiAskResult = {
  intent: BarterAiAskIntent;
  query: string | null;
  categorySlug: string | null;
  constraints: BarterAiAskConstraints;
  sellDraft: BarterAiAskSellDraft | null;
  message: string;
  items: BarterAiAskRankedItem[];
  queryEmbedding: number[] | null;
};

export type AskBarterAiBody = {
  userId: string;
  text: string;
  country: string;
  categoryCatalog: Array<{ id: string; name: string; slug: string }>;
  excludeIds?: string[];
  excludeOwnerIds?: string[];
  limit?: number;
  prior?: {
    intent?: BarterAiAskIntent;
    query?: string | null;
    categorySlug?: string | null;
    constraints?: Partial<BarterAiAskConstraints>;
  };
};

const ASK_UNAVAILABLE_MESSAGE =
  "Ask is temporarily unavailable. Try search or swipe.";

export async function askBarterAi(body: AskBarterAiBody): Promise<BarterAiAskResult> {
  const cfg = configured();
  if (!cfg) {
    throw new AppError(503, "ask_unavailable", ASK_UNAVAILABLE_MESSAGE);
  }

  try {
    return await fetchBarterAi<BarterAiAskResult>(
      `${cfg.baseUrl}/api/internal/ask`,
      {
        method: "POST",
        headers: {
          "X-Internal-Key": cfg.secret,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      ASK_TIMEOUT_MS,
      "barter-ai ask",
    );
  } catch (err) {
    // Upstream HTTP errors / timeouts surface as 502 barter_ai_* — never leak that
    // technical message (e.g. "barter-ai ask failed with HTTP 503") to clients.
    if (
      err instanceof AppError &&
      (err.statusCode === 502 ||
        err.statusCode === 503 ||
        err.code === "barter_ai_error" ||
        err.code === "barter_ai_unreachable")
    ) {
      throw new AppError(503, "ask_unavailable", ASK_UNAVAILABLE_MESSAGE);
    }
    throw err;
  }
}

export async function embedText(text: string): Promise<number[] | null> {
  const cfg = configured();
  if (!cfg) return null;
  try {
    const json = await fetchBarterAi<{ embedding?: number[] | null }>(
      `${cfg.baseUrl}/api/internal/embed/text`,
      {
        method: "POST",
        headers: {
          "X-Internal-Key": cfg.secret,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      },
      EMBED_TIMEOUT_MS,
      "barter-ai embed text",
    );
    return Array.isArray(json.embedding) ? json.embedding : null;
  } catch (err) {
    console.error("[barter-ai embed text]", err);
    return null;
  }
}

