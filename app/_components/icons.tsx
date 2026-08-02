import type { SVGProps } from "react";

/**
 * Inline SVG icons replacing the emoji used as UI iconography (UI audit P2-2).
 *
 * Emoji render as a different typeface on Windows and Android, break vertical
 * rhythm, and cannot inherit `currentColor` — so a "printer" sits at whatever
 * size and hue the platform font decides, next to text that is neither. The
 * design brief specifies no emoji.
 *
 * Same idiom `sidebar.tsx` already uses: 24-box viewBox, `currentColor`,
 * 1.75 stroke, `aria-hidden` (every one of these sits beside a text label, so
 * announcing it would just duplicate the label).
 */

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Printer — table QR printing. */
export function IconPrinter(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 9V3h12v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M6 15h12v6H6z" />
    </Icon>
  );
}

/** Bell — kitchen new-order sound, on. */
export function IconBell(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 9a6 6 0 1 0-12 0c0 4-1.5 5-2 6h16c-.5-1-2-2-2-6" />
      <path d="M10.3 20a2 2 0 0 0 3.4 0" />
    </Icon>
  );
}

/** Bell with a strike — kitchen sound, off. */
export function IconBellOff(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 9a6 6 0 0 0-9.3-5" />
      <path d="M6.3 6.3A6 6 0 0 0 6 9c0 4-1.5 5-2 6h12" />
      <path d="M10.3 20a2 2 0 0 0 3.4 0" />
      <path d="M3 3l18 18" />
    </Icon>
  );
}

/** Monitor — the Tech Support department. */
export function IconMonitor(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Icon>
  );
}

/** Speech bubble — the Sales Enquiry department. */
export function IconChat(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 11.5a8 8 0 0 1-11.6 7.1L3 20.5l1.9-6.3A8 8 0 1 1 21 11.5Z" />
    </Icon>
  );
}

/** Receipt — the Billing department, and the "Placed" order step. */
export function IconReceipt(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 3h14v18l-2.3-1.6L14.4 21 12 19.4 9.6 21l-2.3-1.6L5 21V3Z" />
      <path d="M9 8h6M9 12h6" />
    </Icon>
  );
}

/** Thumb up — CSAT positive. */
export function IconThumbUp(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Z" />
      <path d="M7 11l4.2-8a2.2 2.2 0 0 1 3 2.9L13 9h5.4a2 2 0 0 1 2 2.5l-1.7 6.6a2 2 0 0 1-1.9 1.4H7" />
    </Icon>
  );
}

/** Thumb down — CSAT negative. */
export function IconThumbDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3Z" />
      <path d="M17 13l-4.2 8a2.2 2.2 0 0 1-3-2.9L11 15H5.6a2 2 0 0 1-2-2.5l1.7-6.6A2 2 0 0 1 7.2 4.5H17" />
    </Icon>
  );
}

/** Pan — the "Cooking" order step. */
export function IconPan(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12h13a0 0 0 0 1 0 0v2a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-2Z" />
      <path d="M16 13l5-3" />
    </Icon>
  );
}

/** Cutlery — the "Ready" step for a dine-in order. */
export function IconCutlery(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3v7a2 2 0 0 0 4 0V3M8 10v11" />
      <path d="M17 3c-1.5 1.5-2 3-2 5s.5 2.5 2 2.5V21" />
    </Icon>
  );
}

/** Bag — the "Ready" step for a pickup order. */
export function IconBag(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 7h14l-1 13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 7Z" />
      <path d="M9 7V5a3 3 0 0 1 6 0v2" />
    </Icon>
  );
}

/** Tick — a completed step in the diner's order tracker. */
export function IconCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}
