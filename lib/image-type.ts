/**
 * Content sniffing for owner-uploaded images (logo, storefront imagery, menu
 * photos, media library).
 *
 * `File.type` is set by the BROWSER from the file extension and travels in the
 * multipart body, so it is client-declared, not a property of the bytes. The
 * uploads used it as their only type gate before handing the buffer to sharp
 * (logo colour extraction) and to R2 as the served Content-Type. Any payload
 * renamed `.png` sailed through. The bytes decide here instead: the first
 * few octets of JPEG, PNG and WebP are fixed signatures, and anything else —
 * including a real image in a format we don't serve — is refused.
 *
 * Pure and dependency-free so it can be unit-tested against crafted buffers.
 */

export type UploadImageType = "image/jpeg" | "image/png" | "image/webp";

/** Allowed upload types -> file extension used in the object key. */
export const IMAGE_TYPE_EXT: Record<UploadImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: readonly number[], at = 0) {
  if (bytes.length < at + signature.length) return false;
  return signature.every((byte, i) => bytes[at + i] === byte);
}

/**
 * The image type the bytes actually are, or null when they are not one of
 * the three formats we accept. Ignores whatever the client claimed.
 */
export function sniffImageType(bytes: Uint8Array): UploadImageType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";
  // JPEG: SOI marker FF D8 followed by another marker byte FF.
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // WebP: RIFF container ("RIFF" <size> "WEBP").
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}
