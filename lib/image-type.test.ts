import { describe, expect, it } from "vitest";

import { IMAGE_TYPE_EXT, sniffImageType } from "@/lib/image-type";

/**
 * The upload actions trust these bytes, not the browser's File.type, to decide
 * what an upload is. A false positive lets a non-image reach sharp and R2 with
 * an image Content-Type; a false negative rejects a real photo.
 */
const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const webp = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x20,
]);

describe("sniffImageType", () => {
  it("recognises the three formats we serve", () => {
    expect(sniffImageType(png)).toBe("image/png");
    expect(sniffImageType(jpeg)).toBe("image/jpeg");
    expect(sniffImageType(webp)).toBe("image/webp");
  });

  it("refuses other real image formats we do not serve", () => {
    // GIF89a, SVG (text), TIFF (little-endian), BMP — each would otherwise be
    // handed to a different decoder than the one the declared type implies.
    expect(sniffImageType(new TextEncoder().encode("GIF89a\x00\x00"))).toBeNull();
    expect(
      sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">')),
    ).toBeNull();
    expect(sniffImageType(Uint8Array.from([0x49, 0x49, 0x2a, 0x00, 0x08]))).toBeNull();
    expect(sniffImageType(Uint8Array.from([0x42, 0x4d, 0x36, 0x00, 0x00]))).toBeNull();
  });

  it("refuses HTML or scripts renamed to an image extension", () => {
    expect(
      sniffImageType(new TextEncoder().encode("<!doctype html><script>1</script>")),
    ).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
  });

  it("does not accept a RIFF container that is not WebP (e.g. WAV/AVI)", () => {
    const wav = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(sniffImageType(wav)).toBeNull();
  });

  it("handles empty and truncated buffers without throwing", () => {
    expect(sniffImageType(new Uint8Array())).toBeNull();
    expect(sniffImageType(Uint8Array.from([0x89, 0x50]))).toBeNull();
    expect(sniffImageType(Uint8Array.from([0x52, 0x49, 0x46, 0x46]))).toBeNull();
  });

  it("maps every accepted type to an object-key extension", () => {
    expect(IMAGE_TYPE_EXT["image/png"]).toBe("png");
    expect(IMAGE_TYPE_EXT["image/jpeg"]).toBe("jpg");
    expect(IMAGE_TYPE_EXT["image/webp"]).toBe("webp");
  });
});
