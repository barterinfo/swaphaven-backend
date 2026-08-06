import { RekognitionClient, DetectLabelsCommand, DetectModerationLabelsCommand } from "@aws-sdk/client-rekognition";
import { env } from "../config/env.js";

// Common words that carry no meaning for image-to-listing matching.
const STOP_WORDS = new Set([
  "this", "that", "with", "from", "have", "will", "been", "were", "they",
  "them", "than", "then", "when", "what", "which", "your", "their", "there",
  "here", "where", "some", "such", "more", "most", "much", "many", "very",
  "just", "like", "also", "only", "even", "both", "each", "into", "through",
  "once", "and", "the", "for", "are", "but", "not", "was", "has", "had",
  "its", "you", "she", "him", "his", "her", "our", "out", "can", "all",
  "few", "how", "made", "may", "now", "new", "own", "any", "same", "other",
  "used", "good", "great", "item", "sale", "brand", "year", "size",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\W_]+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
}

/**
 * Parses the S3 bucket and key out of a virtual-hosted-style S3 URL
 * (e.g. https://bucket.s3.region.amazonaws.com/key/path) or a CDN URL when
 * CDN_BASE_URL is configured. Returns null for unrecognised URLs.
 */
function extractS3Info(url: string): { bucket: string; key: string } | null {
  const m = url.match(/https?:\/\/([^.]+)\.s3\.[^.]+\.amazonaws\.com\/(.+)/);
  if (m) return { bucket: m[1]!, key: decodeURIComponent(m[2]!) };

  if (env.CDN_BASE_URL && env.S3_MEDIA_BUCKET) {
    const base = env.CDN_BASE_URL.replace(/\/$/, "");
    if (url.startsWith(`${base}/`)) {
      return {
        bucket: env.S3_MEDIA_BUCKET,
        key: decodeURIComponent(url.slice(base.length + 1)),
      };
    }
  }
  return null;
}

function buildRekognitionClient(): RekognitionClient {
  return new RekognitionClient({
    region: env.AWS_REGION!,
    ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });
}

/**
 * Returns true when the image at `imageUrl` appears relevant to the listing,
 * false when Rekognition finds content that has zero keyword overlap with the
 * listing title + description.
 *
 * Always returns true (fail-open) when:
 * - S3 media is not configured
 * - The URL is not a recognisable S3 URL (e.g. external CDN)
 * - The listing text has fewer than two meaningful words (too vague to check)
 * - Rekognition returns no labels or throws
 */
export async function isImageRelevantToListing(
  imageUrl: string,
  title: string,
  description: string,
): Promise<boolean> {
  if (!env.AWS_REGION || !env.S3_MEDIA_BUCKET) return true;

  const s3Info = extractS3Info(imageUrl);
  if (!s3Info) return true;

  const listingText = `${title} ${description}`.toLowerCase();
  const listingTokens = tokenize(listingText);
  if (listingTokens.length < 2) return true;

  let labels: { Name?: string; Parents?: { Name?: string }[]; Aliases?: { Name?: string }[] }[];
  try {
    const result = await buildRekognitionClient().send(
      new DetectLabelsCommand({
        Image: { S3Object: { Bucket: s3Info.bucket, Name: s3Info.key } },
        MaxLabels: 15,
        MinConfidence: 55,
      }),
    );
    labels = result.Labels ?? [];
  } catch {
    // Rekognition error (permissions, object not found, etc.) — fail open.
    return true;
  }

  if (labels.length === 0) return true;

  // Collect all meaningful words from label names, parent labels, and aliases.
  const labelWords = new Set<string>();
  for (const label of labels) {
    for (const w of tokenize(label.Name ?? "")) labelWords.add(w);
    for (const parent of label.Parents ?? []) {
      for (const w of tokenize(parent.Name ?? "")) labelWords.add(w);
    }
    for (const alias of label.Aliases ?? []) {
      for (const w of tokenize(alias.Name ?? "")) labelWords.add(w);
    }
  }

  // 1. Any label word is a substring of the full listing text
  //    e.g. label "Phone" matches listing "iPhone 13"  ("phone" ⊂ "iphone")
  for (const lw of labelWords) {
    if (listingText.includes(lw)) return true;
  }

  // 2. Any listing token is a substring of any label word, or vice-versa
  //    e.g. listing token "guitar" matches label "Acoustic Guitar"
  for (const token of listingTokens) {
    for (const lw of labelWords) {
      if (lw.includes(token) || token.includes(lw)) return true;
    }
  }

  return false;
}

/**
 * Checks all provided image URLs against the listing title and description.
 * Returns the first URL that appears irrelevant, or null if all pass.
 * Fails open — a Rekognition error causes the URL to be treated as relevant.
 */
export async function findIrrelevantImage(
  imageUrls: string[],
  title: string,
  description: string,
): Promise<string | null> {
  for (const url of imageUrls) {
    const relevant = await isImageRelevantToListing(url, title, description);
    if (!relevant) return url;
  }
  return null;
}

/** Parent categories that should block a chat image as inappropriate. */
const BLOCKED_MODERATION_PARENTS = new Set([
  "Explicit Nudity",
  "Suggestive",
  "Violence",
  "Visually Disturbing",
  "Drugs",
  "Hate Symbols",
]);

const MODERATION_MIN_CONFIDENCE = 75;

/**
 * Returns true when Rekognition flags the image as explicit / inappropriate.
 *
 * Always returns false (fail-open) when:
 * - Profanity/moderation filter is disabled
 * - S3 media is not configured
 * - The URL is not a recognisable S3/CDN URL
 * - Rekognition throws
 */
export async function isImageObscene(imageUrl: string): Promise<boolean> {
  if (!env.ENABLE_PROFANITY_FILTER) return false;
  if (!env.AWS_REGION || !env.S3_MEDIA_BUCKET) return false;

  const s3Info = extractS3Info(imageUrl);
  if (!s3Info) return false;

  try {
    const result = await buildRekognitionClient().send(
      new DetectModerationLabelsCommand({
        Image: { S3Object: { Bucket: s3Info.bucket, Name: s3Info.key } },
        MinConfidence: MODERATION_MIN_CONFIDENCE,
      }),
    );

    for (const label of result.ModerationLabels ?? []) {
      const confidence = label.Confidence ?? 0;
      if (confidence < MODERATION_MIN_CONFIDENCE) continue;
      const parent = label.ParentName ?? "";
      const name = label.Name ?? "";
      if (BLOCKED_MODERATION_PARENTS.has(parent) || BLOCKED_MODERATION_PARENTS.has(name)) {
        return true;
      }
    }
    return false;
  } catch {
    // Rekognition error — fail open so chat is not blocked by AWS outages.
    return false;
  }
}
