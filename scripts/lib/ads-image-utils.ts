/** Pure helpers shared by the ads CLI — unit-tested without S3 or DB. */

export const IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

/** Strip wrapping quotes and whitespace from pasted paths / URLs. */
export function normalizeUserPath(raw: string): string {
  let v = raw.trim();
  if (
    (v.startsWith("'") && v.endsWith("'")) ||
    (v.startsWith('"') && v.endsWith('"'))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/** True when [url] pathname ends with a known image extension. */
export function looksLikeDirectImageUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /\.(jpe?g|png|webp|heic|heif)(\?|$)/i.test(path);
  } catch {
    return false;
  }
}

export function explainS3UploadError(
  err: unknown,
  bucket: string | undefined,
  region: string | undefined,
): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/bucket does not exist|NoSuchBucket/i.test(msg)) {
    return (
      `${msg}\n` +
      `  → Bucket "${bucket}" was not found in AWS region "${region}".\n` +
      "  → Create it in the S3 console (same region as AWS_REGION), or fix S3_MEDIA_BUCKET in .env.\n" +
      "  → See docs/S3_SETUP.md. Until then, use option 3 (remote image URL) in the ads CLI."
    );
  }
  if (/AccessDenied|not authorized/i.test(msg)) {
    return (
      `${msg}\n` +
      `  → IAM user needs s3:PutObject on arn:aws:s3:::${bucket}/ads/*`
    );
  }
  return msg;
}
