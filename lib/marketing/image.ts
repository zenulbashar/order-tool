import "server-only";

import { randomUUID } from "node:crypto";

import { isGeminiConfigured } from "@/lib/aeo-visibility";
import { isR2Configured, uploadToR2 } from "@/lib/r2";

/**
 * Optional "draft an image too" for the marketing generator: one Gemini image
 * call (plain REST, same key as the visibility probes) whose PNG is stored in
 * the venue's own R2 folder so the owner can download or reuse it. Hidden
 * unless BOTH the key and R2 are configured; never throws into the action.
 */

export const DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image";
const REQUEST_TIMEOUT_MS = 45_000;
/** Generated images above this are refused rather than stored. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export function isMarketingImageConfigured(): boolean {
  return isGeminiConfigured() && isR2Configured();
}

export function marketingImageModel(): string {
  return process.env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
}

type GeminiImageResponse = {
  candidates?: {
    content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] };
  }[];
};

/** Pure: the first inline image part, or null. */
export function extractInlineImage(
  payload: unknown,
): { mimeType: string; data: string } | null {
  const parts = (payload as GeminiImageResponse)?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part?.inlineData;
    if (inline?.data && typeof inline.mimeType === "string" && inline.mimeType.startsWith("image/")) {
      return { mimeType: inline.mimeType, data: inline.data };
    }
  }
  return null;
}

export type DraftImageResult = { ok: true; url: string } | { ok: false; error: string };

export async function draftMarketingImage(venueId: string, prompt: string): Promise<DraftImageResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !isR2Configured()) {
    return { ok: false, error: "Image drafting isn't switched on for this deployment." };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let payload: unknown;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(marketingImageModel())}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      return { ok: false, error: "The image service didn't answer. Try again in a moment." };
    }
    payload = await response.json();
  } catch {
    return { ok: false, error: "The image service didn't answer. Try again in a moment." };
  } finally {
    clearTimeout(timer);
  }
  const image = extractInlineImage(payload);
  if (!image) {
    return { ok: false, error: "No image came back for that topic. Try rewording it." };
  }
  const bytes = Buffer.from(image.data, "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: "The image came back in an unusable size. Try again." };
  }
  const extension = image.mimeType === "image/jpeg" ? "jpg" : "png";
  try {
    const url = await uploadToR2(
      `venues/${venueId}/marketing/${randomUUID()}.${extension}`,
      bytes,
      image.mimeType,
    );
    return { ok: true, url };
  } catch {
    return { ok: false, error: "Couldn't save the image. Try again." };
  }
}
