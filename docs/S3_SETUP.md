# S3 image storage setup

SwapHaven stores **HTTPS URLs** in Postgres. Binary files go to **Amazon S3** via **presigned PUT** URLs from the API.

## Flow

```text
Flutter → POST /api/media/presign (JWT)
       ← { uploadUrl, publicUrl, headers }
Flutter → PUT uploadUrl (bytes, Content-Type)
       → POST /api/listings { images: [publicUrl, ...] }
```

---

## 1. Create an S3 bucket

1. AWS Console → **S3** → **Create bucket**
2. Name: e.g. `swaphaven-media-prod` (globally unique)
3. Region: e.g. `us-east-1` (note for `AWS_REGION`)
4. **Block Public Access**: turn **off** only if you serve images via public S3 URLs (simplest).  
   For production later, use **CloudFront** + private bucket instead.
5. Create bucket

### Bucket policy (public read for listing + ad images)

Replace `YOUR_BUCKET`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadMedia",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": [
        "arn:aws:s3:::swaphaven-media-prod/listings/*",
        "arn:aws:s3:::swaphaven-media-prod/ads/*"
      ]
    }
  ]
}
```

Listing photos use `listings/*`. Sponsored ad backgrounds uploaded via `npm run ads` use `ads/*`.

### CORS (for future web uploads)

Use `deploy/s3-cors.json` in this repo (S3 → bucket → Permissions → CORS).

---

## 2. IAM user for Railway

1. **IAM** → **Users** → **Create user** → programmatic access
2. Attach inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": [
        "arn:aws:s3:::swaphaven-media-prod/listings/*",
        "arn:aws:s3:::swaphaven-media-prod/ads/*"
      ]
    }
  ]
}
```

3. Save **Access key ID** and **Secret access key**

---

## 3. Railway environment variables

On the **API service** (not Postgres):

| Variable | Example |
|----------|---------|
| `AWS_REGION` | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | (secret) |
| `S3_MEDIA_BUCKET` | `swaphaven-media-prod` |
| `S3_MEDIA_PREFIX` | `listings` (default) |
| `S3_PRESIGN_EXPIRES_SEC` | `300` (optional) |
| `CDN_BASE_URL` | `https://d123.cloudfront.net` (optional; else S3 virtual-hosted URL) |

Redeploy after setting variables.

Check: `GET https://your-api.up.railway.app/api/media/status` → `{ "configured": true }`

---

## 4. Local development

In `.env`:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_MEDIA_BUCKET=swaphaven-media-dev
S3_MEDIA_PREFIX=listings
```

Without these, the API still runs; `POST /api/media/presign` returns **503** `media_not_configured`.

---

## 5. API reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/media/status` | — | Whether S3 is configured |
| POST | `/api/media/presign` | ✓ | Single or batch presigned upload |

**Single:**

```json
{ "contentType": "image/jpeg", "filename": "photo.jpg" }
```

**Batch (max 10):**

```json
{
  "files": [
    { "contentType": "image/jpeg" },
    { "contentType": "image/png", "filename": "b.png" }
  ]
}
```

**Response (single):**

```json
{
  "uploadUrl": "https://...",
  "publicUrl": "https://bucket.s3.us-east-1.amazonaws.com/listings/...",
  "key": "listings/<userId>/<uuid>.jpg",
  "expiresIn": 300,
  "headers": { "Content-Type": "image/jpeg" }
}
```

Upload with **HTTP PUT** to `uploadUrl` using exactly `headers.Content-Type`.

---

## 6. Flutter client

The mobile app uploads local files before `createProduct`:

1. `POST /api/media/presign`
2. `PUT` file bytes to `uploadUrl`
3. Pass `publicUrl` values in `images` when creating the listing

See `barter-stack/mobile/lib/core/services/listing_media_service.dart`.

---

## Cost

Early traffic is typically **$1–15/month** (storage + egress). See prior S3 cost discussion or [AWS S3 pricing](https://aws.amazon.com/s3/pricing/).
