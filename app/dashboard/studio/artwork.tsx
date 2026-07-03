import { readableOn } from "@/app/_components/brand-contrast";
import { formatCents } from "@/lib/validation";

import type { SizePreset } from "./presets";

/**
 * SVG artwork generators (Track G). Pure functions returning an <svg> sized to a
 * preset's exact pixel canvas — vector, so the same render exports crisply at
 * any size. Deliberately TYPOGRAPHIC + brand colour only (no remote item/logo
 * images) so a client-side canvas PNG export never taints. Photo compositing is
 * a later enhancement. No hooks — safe to render inside the client studio.
 */

export type MenuArtworkData = {
  venueName: string;
  brandColor: string;
  tagline: string | null;
  categories: {
    name: string;
    items: { name: string; priceCents: number; description: string | null }[];
  }[];
};

export type BannerArtworkData = {
  venueName: string;
  brandColor: string;
  headline: string;
  subtext: string;
  offerText: string;
};

const FONT =
  "'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Rough monospace-free width estimate for wrapping (char ≈ 0.55em). */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  // If we truncated, add an ellipsis to the last line.
  const consumed = lines.join(" ").split(/\s+/).length;
  if (consumed < words.length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1]}…`;
  }
  return lines;
}

/* -------------------------------- Menu ---------------------------------- */

export function MenuArtwork({
  data,
  preset,
}: {
  data: MenuArtworkData;
  preset: SizePreset;
}) {
  const { width: W, height: H } = preset;
  const ink = readableOn(data.brandColor);
  const pad = Math.round(W * 0.06);
  const headerH = Math.round(H * 0.14);
  const cols = W > H ? 2 : 1;
  const colGap = pad;
  const colW = (W - pad * 2 - colGap * (cols - 1)) / cols;
  const bodyTop = headerH + Math.round(H * 0.04);
  const bodyBottom = H - Math.round(H * 0.05);

  const nameSize = Math.round(headerH * 0.34);
  const catSize = Math.round(W * 0.028 * (cols === 1 ? 1 : 0.9)) + 6;
  const itemSize = Math.round(catSize * 0.72);
  const descSize = Math.round(itemSize * 0.7);

  // Flatten to a block stream, then flow into columns.
  type Block =
    | { type: "cat"; name: string }
    | { type: "item"; name: string; priceCents: number; description: string | null };
  const blocks: Block[] = [];
  for (const cat of data.categories) {
    if (cat.items.length === 0) continue;
    blocks.push({ type: "cat", name: cat.name });
    for (const it of cat.items) blocks.push({ type: "item", ...it });
  }

  const catH = catSize * 2.1;
  const itemH = itemSize * 1.5;
  const descH = descSize * 1.25;

  const placed: { col: number; y: number; block: Block; descLines: string[] }[] = [];
  let col = 0;
  let y = bodyTop;
  let truncated = 0;
  const descMaxChars = Math.floor(colW / (descSize * 0.55));

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const descLines =
      block.type === "item" && block.description
        ? wrap(block.description, descMaxChars, 2)
        : [];
    const blockH =
      block.type === "cat" ? catH : itemH + descLines.length * descH;
    if (y + blockH > bodyBottom) {
      col += 1;
      y = bodyTop;
      if (col >= cols) {
        truncated = blocks.length - i;
        break;
      }
    }
    placed.push({ col, y, block, descLines });
    y += blockH;
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", maxWidth: "100%", height: "auto" }}
    >
      <rect width={W} height={H} fill="#fffdf8" />
      {/* Header band in the brand colour. */}
      <rect width={W} height={headerH} fill={data.brandColor} />
      <text
        x={pad}
        y={headerH * 0.5}
        fontFamily={FONT}
        fontSize={nameSize}
        fontWeight={800}
        fill={ink}
        dominantBaseline="middle"
      >
        {data.venueName}
      </text>
      {data.tagline ? (
        <text
          x={pad}
          y={headerH * 0.5 + nameSize * 0.9}
          fontFamily={FONT}
          fontSize={Math.round(nameSize * 0.4)}
          fill={ink}
          opacity={0.85}
          dominantBaseline="middle"
        >
          {data.tagline}
        </text>
      ) : null}

      {placed.map(({ col: c, y: by, block, descLines }, idx) => {
        const x = pad + c * (colW + colGap);
        if (block.type === "cat") {
          return (
            <g key={idx}>
              <text
                x={x}
                y={by + catSize}
                fontFamily={FONT}
                fontSize={catSize}
                fontWeight={800}
                fill={data.brandColor}
                style={{ textTransform: "uppercase" }}
                letterSpacing={1}
              >
                {block.name}
              </text>
              <rect x={x} y={by + catSize * 1.35} width={colW} height={2} fill={data.brandColor} opacity={0.3} />
            </g>
          );
        }
        return (
          <g key={idx}>
            <text x={x} y={by + itemSize} fontFamily={FONT} fontSize={itemSize} fontWeight={700} fill="#0e1f18">
              {block.name}
            </text>
            <text
              x={x + colW}
              y={by + itemSize}
              fontFamily={FONT}
              fontSize={itemSize}
              fontWeight={800}
              fill={data.brandColor}
              textAnchor="end"
            >
              ${formatCents(block.priceCents)}
            </text>
            {descLines.map((line, li) => (
              <text
                key={li}
                x={x}
                y={by + itemSize + descSize * 1.25 * (li + 1)}
                fontFamily={FONT}
                fontSize={descSize}
                fill="#6e756b"
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}

      {truncated > 0 ? (
        <text
          x={W / 2}
          y={bodyBottom + (H - bodyBottom) * 0.5}
          fontFamily={FONT}
          fontSize={descSize}
          fill="#6e756b"
          textAnchor="middle"
        >
          + {truncated} more on the full menu
        </text>
      ) : null}
    </svg>
  );
}

/* ------------------------------- Banner --------------------------------- */

export function BannerArtwork({
  data,
  preset,
}: {
  data: BannerArtworkData;
  preset: SizePreset;
}) {
  const { width: W, height: H } = preset;
  const ink = readableOn(data.brandColor);
  const pad = Math.round(Math.min(W, H) * 0.09);
  const headlineSize = Math.round(Math.min(W, H) * 0.12);
  const subSize = Math.round(headlineSize * 0.4);
  const maxChars = Math.floor((W - pad * 2) / (headlineSize * 0.55));
  const lines = wrap(data.headline || "Your headline here", maxChars, 3);
  const blockH = lines.length * headlineSize * 1.12 + (data.subtext ? subSize * 2 : 0);
  const startY = H / 2 - blockH / 2 + headlineSize;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", maxWidth: "100%", height: "auto" }}
    >
      <rect width={W} height={H} fill={data.brandColor} />
      {/* Subtle corner motif so flat brand fills don't read as empty. */}
      <circle cx={W} cy={0} r={Math.min(W, H) * 0.28} fill={ink} opacity={0.06} />
      <circle cx={0} cy={H} r={Math.min(W, H) * 0.22} fill={ink} opacity={0.06} />

      {data.offerText ? (
        <>
          <rect
            x={pad}
            y={pad}
            rx={subSize * 0.5}
            width={data.offerText.length * subSize * 0.62 + subSize}
            height={subSize * 1.8}
            fill={ink}
            opacity={0.16}
          />
          <text
            x={pad + subSize * 0.5}
            y={pad + subSize * 1.2}
            fontFamily={FONT}
            fontSize={subSize}
            fontWeight={800}
            fill={ink}
            letterSpacing={1}
            style={{ textTransform: "uppercase" }}
          >
            {data.offerText}
          </text>
        </>
      ) : null}

      {lines.map((line, i) => (
        <text
          key={i}
          x={pad}
          y={startY + i * headlineSize * 1.12}
          fontFamily={FONT}
          fontSize={headlineSize}
          fontWeight={800}
          fill={ink}
        >
          {line}
        </text>
      ))}

      {data.subtext ? (
        <text
          x={pad}
          y={startY + lines.length * headlineSize * 1.12 + subSize * 0.4}
          fontFamily={FONT}
          fontSize={subSize}
          fill={ink}
          opacity={0.9}
        >
          {data.subtext}
        </text>
      ) : null}

      <text
        x={pad}
        y={H - pad}
        fontFamily={FONT}
        fontSize={subSize * 0.9}
        fontWeight={700}
        fill={ink}
        opacity={0.85}
      >
        {data.venueName}
      </text>
    </svg>
  );
}
