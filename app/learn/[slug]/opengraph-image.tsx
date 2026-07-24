import { ImageResponse } from "next/og";

import { ARTICLES, getArticle } from "@/lib/marketing-content";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Prompt2Eat guide";

/** Prerender one card per guide (matches the page's generateStaticParams). */
export function generateStaticParams() {
  return ARTICLES.map((article) => ({ slug: article.slug }));
}

type ImageParams = { params: Promise<{ slug: string }> };

/**
 * Per-guide social card: the guide's eyebrow + title on the brand ink field,
 * with the Prompt2Eat wordmark. Built with next/og's built-in font (no fetch),
 * so a shared /learn/<slug> link previews as the specific guide, not the
 * generic brand card.
 */
export default async function Image({ params }: ImageParams) {
  const { slug } = await params;
  const article = getArticle(slug);
  const eyebrow = article?.eyebrow ?? "Guide";
  const title = article?.title ?? "Prompt2Eat guides";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background:
            "radial-gradient(90% 70% at 15% 10%, #1c4231 0%, #16241c 60%)",
          color: "#f7f3ea",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 24,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "#F4B43C",
            fontWeight: 700,
          }}
        >
          {eyebrow}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 68,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: -1.5,
            maxWidth: 980,
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="52" height="52" viewBox="0 0 72 72" fill="none">
            <rect width="72" height="72" rx="16" fill="#0e1f18" />
            <g transform="translate(0,7)">
              <path
                d="M12 52 A 35 35 0 0 1 56 15 A 21.5 21.5 0 0 0 12 52 Z"
                fill="#F4B43C"
              />
              <path d="M57 5 L61 14 L57 23 L53 14 Z" fill="#F7F3EA" />
              <path d="M48 14 L57 10 L66 14 L57 18 Z" fill="#F7F3EA" />
            </g>
          </svg>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 800 }}>
            <span>Prompt</span>
            <span style={{ color: "#F4B43C" }}>2</span>
            <span>Eat</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
