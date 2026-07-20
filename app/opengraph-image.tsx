import { ImageResponse } from "next/og";

import { SITE_TAGLINE } from "@/lib/seo";

export const alt = "Prompt2Eat — Just say what you're hungry for";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The default social/link-preview card (og:image) for every page that doesn't
 * define its own: forest ink, the leaf + AI-spark brand mark (logo-kit paths,
 * inline so no fetch), the wordmark with the amber "2", and the tagline.
 * Rendered with next/og's built-in font — no external font fetch, so it can
 * never fail a build or a cold request.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          background:
            "radial-gradient(80% 60% at 50% 20%, #1c4231 0%, #16241c 65%)",
          color: "#f7f3ea",
        }}
      >
        {/* Brand mark — the logo kit's leaf + AI spark, scaled up. */}
        <svg width="168" height="168" viewBox="0 0 72 72" fill="none">
          <rect width="72" height="72" rx="16" fill="#0e1f18" />
          <g transform="translate(0,7)">
            <rect
              x="5.5"
              y="49.5"
              width="10"
              height="5.4"
              rx="2.7"
              transform="rotate(43 12 52)"
              fill="#B97714"
            />
            <path
              d="M12 52 A 35 35 0 0 1 56 15 A 21.5 21.5 0 0 0 12 52 Z"
              fill="#F4B43C"
            />
            <path d="M57 5 L61 14 L57 23 L53 14 Z" fill="#F7F3EA" />
            <path d="M48 14 L57 10 L66 14 L57 18 Z" fill="#F7F3EA" />
          </g>
        </svg>

        <div style={{ display: "flex", fontSize: 84, fontWeight: 800 }}>
          <span>Prompt</span>
          <span style={{ color: "#F4B43C" }}>2</span>
          <span>Eat</span>
        </div>

        <div style={{ display: "flex", fontSize: 34, color: "#a9c3b1" }}>
          {SITE_TAGLINE}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 10,
            fontSize: 22,
            color: "#7fa890",
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          AI-native ordering for restaurants
        </div>
      </div>
    ),
    size,
  );
}
