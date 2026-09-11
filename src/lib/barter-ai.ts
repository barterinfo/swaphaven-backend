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
  country: string;
  category?: string;
  limit: number;
};

async function recommend(
  path: "/api/internal/recommend/related" | "/api/internal/recommend/deck",
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

/** Fire-and-forget listing embed. Never throws into listing create/update. */
export function scheduleListingEmbed(listingId: string): void {
  void embedListing(listingId).catch((err) => {
    console.error("[barter-ai embed]", err);
  });
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

