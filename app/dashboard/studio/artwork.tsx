import { readableOn } from "@/app/_components/brand-contrast";
import { formatCents } from "@/lib/validation";

import type { SizePreset } from "./presets";

/**
 * SVG artwork generators (Track G). Pure functions returning an <svg> sized to a
 * preset's exact pixel canvas — vector, so the same render exports crisply at
 * any size. TYPOGRAPHIC + brand colour, plus the venue logo when present. The
 * logo is passed pre-inlined as a data: URI (the server fetches + base64-encodes
 * it) — data URIs are same-origin, so the client-side canvas PNG export never
 * taints; a raw remote URL WOULD taint it. No hooks — safe in the client studio.
 */

export type MenuArtworkData = {
  venueName: string;
  brandColor: string;
  tagline: string | null;
  /** Venue logo pre-inlined as a data: URI (server-side) so PNG export stays
   * clean — remote URLs would taint the export canvas. null/undefined = none. */
  logoDataUri?: string | null;
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
  /** Data-URI logo (see MenuArtworkData.logoDataUri). null/undefined = none. */
  logoDataUri?: string | null;
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

/** Single-line truncate with an ellipsis so a long name can't overrun a price. */
function truncate(text: string, maxChars: number): string {
  if (maxChars <= 1) return "…";
  return text.length > maxChars ? `${text.slice(0, maxChars - 1).trimEnd()}…` : text;
}

/* -------------------------------- Menu ---------------------------------- */

export function MenuArtwork({
  data,
  preset,
  showPrices = true,
  showDescriptions = true,
}: {
  data: MenuArtworkData;
  preset: SizePreset;
  showPrices?: boolean;
  showDescriptions?: boolean;
}) {
  const { width: W, height: H } = preset;
  const ink = readableOn(data.brandColor);
  const pad = Math.round(W * 0.055);
  const headerH = Math.round(H * 0.14);
  const bodyTop = headerH + Math.round(H * 0.035);
  const bodyBottom = H - Math.round(H * 0.045);
  const nameSize = Math.round(headerH * 0.34);

  // Logo (if any) sits at the right of the header on a white chip so it stays
  // legible over any brand fill or a transparent PNG. The venue name truncates
  // to leave room for it.
  const logo = data.logoDataUri ?? null;
  const logoBox = logo ? Math.round(headerH * 0.6) : 0;
  const logoPad = Math.round(logoBox * 0.12);
  const logoX = W - pad - logoBox;
  const logoY = Math.round(headerH * 0.5 - logoBox / 2);
  const nameRight = logo ? logoX - Math.round(pad * 0.5) : W - pad;
  const venueName = truncate(
    data.venueName,
    Math.max(4, Math.floor((nameRight - pad) / (nameSize * 0.6))),
  );

  // Flatten to a block stream (category header + items).
  type Block =
    | { type: "cat"; name: string }
    | { type: "item"; name: string; priceCents: number; description: string | null };
  const blocks: Block[] = [];
  for (const cat of data.categories) {
    if (cat.items.length === 0) continue;
    blocks.push({ type: "cat", name: cat.name });
    for (const it of cat.items) blocks.push({ type: "item", ...it });
  }

  type Placed = {
    col: number;
    y: number;
    block: Block;
    descLines: string[];
    name: string;
    itemSize: number;
    catSize: number;
    descSize: number;
  };

  // Try to fit the WHOLE menu: pick the biggest font (then shed descriptions,
  // then shrink) that lets every block fit across `cols` columns. Only when even
  // the most compact pass overflows do we fall back to "+N more".
  const aspect = W / H;
  const maxCols = aspect >= 1.6 ? 4 : aspect > 1.05 ? 3 : W > 640 ? 2 : 1;

  function layout(cols: number, descCap: 0 | 1 | 2, scale: number) {
    const colGap = pad;
    const colW = (W - pad * 2 - colGap * (cols - 1)) / cols;
    const catSize = Math.max(11, Math.round((W * 0.02) / Math.sqrt(cols) * scale) + 4);
    const itemSize = Math.max(9, Math.round(catSize * 0.74));
    const descSize = Math.max(8, Math.round(itemSize * 0.72));
    const catH = catSize * 1.9;
    const rowH = itemSize * 1.32;
    const descH = descSize * 1.2;
    // Char budgets (rough monospace-free estimate at ~0.55em). With prices
    // hidden the name gets the full column width.
    const priceReserve = showPrices ? itemSize * 4.2 : 0; // room for "$00.00" + gap
    const nameMaxChars = Math.max(6, Math.floor((colW - priceReserve) / (itemSize * 0.52)));
    const descMaxChars = Math.max(8, Math.floor(colW / (descSize * 0.52)));

    const placed: Placed[] = [];
    let col = 0;
    let y = bodyTop;
    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i];
      const descLines =
        descCap > 0 && block.type === "item" && block.description
          ? wrap(block.description, descMaxChars, descCap)
          : [];
      const blockH = block.type === "cat" ? catH : rowH + descLines.length * descH;
      if (y + blockH > bodyBottom) {
        col += 1;
        y = bodyTop;
        if (col >= cols) return { placed, colW, truncated: blocks.length - i };
      }
      placed.push({
        col,
        y,
        block,
        descLines,
        name: block.type === "item" ? truncate(block.name, nameMaxChars) : block.name,
        itemSize,
        catSize,
        descSize,
      });
      y += blockH;
    }
    return { placed, colW, truncated: 0 };
  }

  // Descriptions can be turned off entirely by the owner; when on, the fit loop
  // may still shed them (cap 2→1→0) to make the whole menu fit.
  const descCaps: readonly (0 | 1 | 2)[] = showDescriptions ? [2, 1, 0] : [0];
  let chosen = layout(maxCols, descCaps[0], 1);
  outer: for (const scale of [1, 0.9, 0.8, 0.72, 0.64, 0.56, 0.5, 0.45]) {
    for (const descCap of descCaps) {
      const t = layout(maxCols, descCap, scale);
      if (t.truncated === 0) {
        chosen = t;
        break outer;
      }
      chosen = t; // keep the tightest attempt as the fallback
    }
  }
  const { placed, colW, truncated } = chosen;
  const colGap = pad;

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
        {venueName}
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
          {truncate(data.tagline, Math.floor((nameRight - pad) / (nameSize * 0.4 * 0.52)))}
        </text>
      ) : null}
      {logo ? (
        <>
          <rect
            x={logoX}
            y={logoY}
            width={logoBox}
            height={logoBox}
            rx={Math.round(logoBox * 0.16)}
            fill="#ffffff"
          />
          {/* Data-URI logo — inlined server-side, so the export canvas stays clean. */}
          <image
            href={logo}
            x={logoX + logoPad}
            y={logoY + logoPad}
            width={logoBox - logoPad * 2}
            height={logoBox - logoPad * 2}
            preserveAspectRatio="xMidYMid meet"
          />
        </>
      ) : null}

      {placed.map((p, idx) => {
        const x = pad + p.col * (colW + colGap);
        if (p.block.type === "cat") {
          return (
            <g key={idx}>
              <text
                x={x}
                y={p.y + p.catSize}
                fontFamily={FONT}
                fontSize={p.catSize}
                fontWeight={800}
                fill={data.brandColor}
                style={{ textTransform: "uppercase" }}
                letterSpacing={1}
              >
                {p.name}
              </text>
              <rect x={x} y={p.y + p.catSize * 1.3} width={colW} height={Math.max(1, Math.round(p.catSize * 0.08))} fill={data.brandColor} opacity={0.3} />
            </g>
          );
        }
        return (
          <g key={idx}>
            {/* Name reserves room for the right-aligned price (truncated to fit). */}
            <text x={x} y={p.y + p.itemSize} fontFamily={FONT} fontSize={p.itemSize} fontWeight={700} fill="#0e1f18">
              {p.name}
            </text>
            {showPrices ? (
              <text
                x={x + colW}
                y={p.y + p.itemSize}
                fontFamily={FONT}
                fontSize={p.itemSize}
                fontWeight={800}
                fill={data.brandColor}
                textAnchor="end"
              >
                ${formatCents(p.block.type === "item" ? p.block.priceCents : 0)}
              </text>
            ) : null}
            {p.descLines.map((line, li) => (
              <text
                key={li}
                x={x}
                y={p.y + p.itemSize + p.descSize * 1.2 * (li + 1)}
                fontFamily={FONT}
                fontSize={p.descSize}
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
          fontSize={Math.round(headerH * 0.12)}
          fill="#6e756b"
          textAnchor="middle"
        >
          + {truncated} more — choose a larger size to fit the full menu
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

  // Logo (if any) — top-right, on a white chip so it reads over the brand fill.
  const logo = data.logoDataUri ?? null;
  const logoBox = logo ? Math.round(Math.min(W, H) * 0.16) : 0;
  const logoPad = Math.round(logoBox * 0.12);
  const logoX = W - pad - logoBox;

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

      {logo ? (
        <>
          <rect
            x={logoX}
            y={pad}
            width={logoBox}
            height={logoBox}
            rx={Math.round(logoBox * 0.16)}
            fill="#ffffff"
          />
          {/* Data-URI logo — inlined server-side, so the export canvas stays clean. */}
          <image
            href={logo}
            x={logoX + logoPad}
            y={pad + logoPad}
            width={logoBox - logoPad * 2}
            height={logoBox - logoPad * 2}
            preserveAspectRatio="xMidYMid meet"
          />
        </>
      ) : null}

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
