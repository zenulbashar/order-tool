import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * Server-only Cloudflare R2 client for owner-uploaded menu-item photos.
 *
 * R2 is S3-compatible, so we drive it with the AWS S3 SDK pointed at the R2
 * endpoint. The client is LAZILY constructed (first call, not module load) —
 * the same contract as getStripe() in lib/stripe.ts and the Neon pool in
 * lib/db/index.ts: nothing reads R2_* at import time, so `next build` / `tsc` /
 * `eslint` all run with NO env present. By the time a request calls a helper
 * here, the runtime env is guaranteed present.
 *
 * Photos are uploaded server-side (never browser->R2 directly) and served from
 * the bucket's public base URL (R2_PUBLIC_URL — a public R2 bucket or a
 * Cloudflare-proxied custom domain). The public URL is what we store in
 * menu_items.image_url.
 */

type R2Config = {
  client: S3Client;
  bucket: string;
  publicBaseUrl: string;
};

let cached: R2Config | null = null;

function getR2(): R2Config {
  if (cached) return cached;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket ||
    !publicUrl
  ) {
    throw new Error(
      "R2 storage is not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, " +
        "R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_URL.",
    );
  }

  cached = {
    client: new S3Client({
      // R2 ignores region but the SDK requires one; "auto" is the documented
      // value for R2.
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
    // Trailing slash is stripped so publicUrlFor() can join with a single "/".
    publicBaseUrl: publicUrl.replace(/\/+$/, ""),
  };
  return cached;
}

/** Public URL for an object key (R2_PUBLIC_URL + "/" + key). */
function publicUrlFor(key: string): string {
  return `${getR2().publicBaseUrl}/${key}`;
}

/**
 * Upload a buffer to R2 under `key` and return its public URL. Throws if R2 is
 * unconfigured (call time only) or the upload fails — callers wrap this so a
 * failure never corrupts the DB or crashes the request.
 */
export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const { client, bucket } = getR2();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return publicUrlFor(key);
}

/** Delete an object by key. Used for best-effort cleanup of replaced/removed photos. */
export async function deleteFromR2(key: string): Promise<void> {
  const { client, bucket } = getR2();
  await client.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key }),
  );
}

/**
 * Recover the object key from a stored public URL so a replaced/removed photo
 * can be cleaned up — WITHOUT needing a separate key column. Because every URL
 * we write is `${publicBaseUrl}/${key}`, the key is just the suffix after that
 * prefix. Returns null for any URL we don't manage (e.g. a leftover
 * manually-pasted URL from before uploads existed, or a different domain), so
 * cleanup is safely skipped rather than deleting the wrong object.
 */
export function r2KeyFromPublicUrl(url: string): string | null {
  if (!url) return null;
  let base: string;
  try {
    base = getR2().publicBaseUrl;
  } catch {
    // R2 unconfigured — nothing to clean up.
    return null;
  }
  const prefix = `${base}/`;
  if (!url.startsWith(prefix)) return null;
  const key = url.slice(prefix.length);
  return key.length > 0 ? key : null;
}
