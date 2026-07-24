/**
 * Audience landing pages ("service pages") for /for/[segment]. Each segment has
 * its OWN pain points, feature framing, and FAQ so the pages are genuinely
 * distinct — not thin doorway variants of one template (which Google penalises,
 * and which the SEO plan explicitly warns against). Kept to a tasteful handful
 * of audiences; city variants can be layered on later by extending this matrix.
 *
 * Every claim describes real, current product behaviour only — same integrity
 * rule as lib/marketing-content.ts. Dependency-free so metadata routes and
 * server components can import it anywhere.
 */

export type SegmentFeature = { title: string; body: string };
export type SegmentFaq = { question: string; answer: string };

export type MarketingSegment = {
  /** URL slug: /for/<slug>. Lowercase kebab; must not collide with app routes. */
  slug: string;
  /** Short mono eyebrow. */
  eyebrow: string;
  /** H1. */
  heading: string;
  /** Sub-hero line + basis for the meta description. */
  intro: string;
  metaTitle: string;
  metaDescription: string;
  /** The audience's real frustrations this page speaks to (3). */
  painPoints: SegmentFeature[];
  /** Product capabilities framed for this audience (4). */
  features: SegmentFeature[];
  /** Audience-specific FAQ — also emitted as FAQPage JSON-LD (3–4). */
  faqs: SegmentFaq[];
};

export const SEGMENTS: MarketingSegment[] = [
  {
    slug: "cafes",
    eyebrow: "For cafés",
    heading: "Online ordering built for the café rush",
    intro:
      "Turn every table into a till and let regulars order their coffee before they reach the counter, without new hardware or a POS migration.",
    metaTitle: "Online ordering for cafés",
    metaDescription:
      "QR table ordering and order-ahead coffee for cafés. Import your menu from a photo, take card and pay-by-bank, and reward regulars — live in an afternoon.",
    painPoints: [
      {
        title: "The morning queue",
        body: "A line out the door means walked customers. Order-ahead lets regulars send their usual before they arrive, so the queue moves and the coffee is ready.",
      },
      {
        title: "Staff stretched at peak",
        body: "When every table needs a server at once, orders slip. QR ordering lets diners send their own order straight to the kitchen while staff pour and plate.",
      },
      {
        title: "Menus that change weekly",
        body: "Specials boards move fast. Editing the menu should take a minute, not a support ticket, and it does — right from the dashboard.",
      },
    ],
    features: [
      {
        title: "QR table ordering, no app",
        body: "Each table gets a branded QR code. Diners scan, order, and pay from their phone in the browser, and the table number rides along to the kitchen.",
      },
      {
        title: "Order-ahead coffee",
        body: "Regulars order takeaway for ASAP or a scheduled pickup, within the lead time you set, so their flat white is waiting.",
      },
      {
        title: "Loyalty for regulars",
        body: "Turn on points so returning diners earn on every order and redeem them at checkout — the kind of thing that keeps a local coming back.",
      },
      {
        title: "Menu from a photo",
        body: "Photograph your menu and the AI reads it into items, sizes, and prices for you to review. Edit specials any time.",
      },
    ],
    faqs: [
      {
        question: "Do my customers need an app to order?",
        answer:
          "No. Ordering runs in the phone browser — a diner scans the table QR code or opens your storefront link, with no app store and no account needed.",
      },
      {
        question: "Can regulars order coffee ahead of time?",
        answer:
          "Yes. Takeaway supports order-ahead for ASAP or a scheduled pickup time, within the lead time you set, so drinks are ready when the customer arrives.",
      },
      {
        question: "How do I get my café menu online?",
        answer:
          "Photograph your printed menu during onboarding and the AI reads it into structured items you review before publishing. You can also edit or add specials by hand at any time.",
      },
    ],
  },
  {
    slug: "restaurants",
    eyebrow: "For restaurants",
    heading: "Dine-in and takeaway ordering for restaurants",
    intro:
      "Let guests order and pay from the table, help them choose with an AI concierge, and keep the kitchen moving with a live board and station labels.",
    metaTitle: "Online ordering for restaurants",
    metaDescription:
      "Dine-in QR ordering, an AI concierge that helps guests choose, and a kitchen board with per-station labels. Take cards and pay-by-bank, live in an afternoon.",
    painPoints: [
      {
        title: "Tables waiting to order",
        body: "A guest ready to order and no server free is a slower table and a smaller check. QR ordering lets them start whenever they're ready.",
      },
      {
        title: "Guests unsure what to pick",
        body: "Questions about the menu eat your staff's time all night. The AI concierge answers them and suggests real dishes from your live menu.",
      },
      {
        title: "Tickets lost between stations",
        body: "A busy pass drops items. Per-station labels and a live order board keep every ticket complete and sorted.",
      },
    ],
    features: [
      {
        title: "Order from the table",
        body: "Each table has its own QR code, and the table number prints on the kitchen ticket so food goes to the right seat.",
      },
      {
        title: "AI concierge",
        body: "A guest describes what they feel like and the concierge proposes matching dishes, sizes, and sides from your menu. It only pre-fills — the guest always confirms.",
      },
      {
        title: "Kitchen board + station labels",
        body: "A live board grouped by status, plus receipts, a packaging docket, and price-free sticky labels per prep station (like 42-K for order 42 at the Kebab station).",
      },
      {
        title: "Every way to pay",
        body: "Cards, Apple Pay, Google Pay, and PayTo pay-by-bank, settled to your own account. Orders only reach the kitchen once payment is confirmed.",
      },
    ],
    faqs: [
      {
        question: "Does the table number reach the kitchen?",
        answer:
          "Yes. Dine-in orders carry the table number from the QR code through to the kitchen ticket, on screen and on every print, so food goes to the right table.",
      },
      {
        question: "What does the AI concierge do?",
        answer:
          "A guest describes a craving in plain language and the concierge suggests real dishes from your live menu, with sizes and modifiers handled. Suggestions only pre-fill; the guest reviews and confirms before ordering.",
      },
      {
        question: "Can the kitchen print per station?",
        answer:
          "Yes. Alongside the customer receipt and a packaging docket, Prompt2Eat prints price-free sticky labels for each prep station, headed by the order number and the station's code.",
      },
    ],
  },
  {
    slug: "bars",
    eyebrow: "For bars & pubs",
    heading: "Order-at-table for busy bars and pubs",
    intro:
      "Keep the floor moving on a packed night: guests order another round from their phone and pay on the spot, so staff pour instead of chasing tabs.",
    metaTitle: "Order-at-table for bars & pubs",
    metaDescription:
      "QR order-at-table for bars and pubs. Guests reorder and pay from their phone, orders are confirmed by payment, and the floor keeps moving. Live in an afternoon.",
    painPoints: [
      {
        title: "The bar is three deep",
        body: "When guests can't get to the bar, they stop ordering. Order-at-table lets them send the next round without leaving their seat.",
      },
      {
        title: "Chasing unpaid tabs",
        body: "Every order is paid when it's placed, so there are no walked tabs and no reconciling at close.",
      },
      {
        title: "One weak WiFi corner",
        body: "Ordering runs in the browser on the guest's own phone and data, so a dead spot at the bar doesn't stop a sale.",
      },
    ],
    features: [
      {
        title: "Scan and reorder",
        body: "A QR code on each table opens your branded menu. Guests order another round in seconds and it goes straight to the pass.",
      },
      {
        title: "Paid before it pours",
        body: "Orders are only sent once payment is confirmed, so nothing is made on an unpaid ticket and closing is clean.",
      },
      {
        title: "Fast, familiar payments",
        body: "Cards, Apple Pay, Google Pay, and PayTo pay-by-bank, all on the guest's phone, settled to your account.",
      },
      {
        title: "Your look, not a marketplace",
        body: "The storefront carries your colours, logo, and cover photo, so it feels like your venue from the first scan.",
      },
    ],
    faqs: [
      {
        question: "How do guests order another round?",
        answer:
          "They scan the QR code on their table, which opens your menu in the browser, choose their drinks, and pay from their phone. The order goes straight to your staff.",
      },
      {
        question: "Are orders paid up front?",
        answer:
          "Yes. An order is only confirmed and sent to staff once its payment is verified, so there are no unpaid tabs to chase at the end of the night.",
      },
      {
        question: "Do I need special hardware?",
        answer:
          "No. Ordering runs on the guest's own phone in the browser, and you manage everything from the dashboard on a device you already have.",
      },
    ],
  },
  {
    slug: "bakeries",
    eyebrow: "For bakeries",
    heading: "Order-ahead and pickup for bakeries",
    intro:
      "Take cake and catering orders online, let customers reserve a pickup time, and sell gift cards, all from a storefront that looks like your bakery.",
    metaTitle: "Online ordering for bakeries",
    metaDescription:
      "Order-ahead pickup for bakeries: reserve pickup times, sell gift cards, and take card or pay-by-bank. Import your menu from a photo and go live in an afternoon.",
    painPoints: [
      {
        title: "Phone orders all morning",
        body: "Taking cake and catering orders by phone interrupts the bake. An online storefront takes them for you, around the clock.",
      },
      {
        title: "Pickups bunching up",
        body: "Scheduled pickup times spread collections across the day instead of everyone arriving at once.",
      },
      {
        title: "Selling out of the best sellers",
        body: "Order-ahead shows demand early, so you can bake to real orders instead of guessing.",
      },
    ],
    features: [
      {
        title: "Scheduled pickup",
        body: "Customers order ahead and choose a pickup time within the lead time you set, so collections are planned, not a scramble.",
      },
      {
        title: "Gift cards",
        body: "Sell gift cards from your storefront — a simple extra line of revenue that brings new customers in.",
      },
      {
        title: "Menu from a photo",
        body: "Photograph your product list and the AI reads it into items and prices you review, so getting online takes an afternoon.",
      },
      {
        title: "Card and pay-by-bank",
        body: "Take cards, Apple Pay, Google Pay, and PayTo pay-by-bank, all settled to your own account.",
      },
    ],
    faqs: [
      {
        question: "Can customers choose a pickup time?",
        answer:
          "Yes. Takeaway supports order-ahead with a scheduled pickup time, within the lead time you set, so you can plan the day's collections.",
      },
      {
        question: "Can I sell gift cards?",
        answer:
          "Yes. Gift cards can be sold from your storefront and redeemed at checkout, giving you an extra revenue line and a reason for new customers to visit.",
      },
      {
        question: "How long does it take to get online?",
        answer:
          "Most venues go live in an afternoon: photograph your menu to import it, set your brand and hours, connect payments, and publish.",
      },
    ],
  },
  {
    slug: "food-trucks",
    eyebrow: "For food trucks",
    heading: "Skip-the-queue ordering for food trucks",
    intro:
      "Let customers order ahead and pay from their phone so the line moves faster, with no hardware to haul and nothing to plug in.",
    metaTitle: "Online ordering for food trucks",
    metaDescription:
      "Order-ahead, skip-the-queue ordering for food trucks. No hardware, order and pay from any phone, take card and pay-by-bank, and change your menu on the fly.",
    painPoints: [
      {
        title: "The queue is the business",
        body: "A long line turns customers away. Order-ahead lets them send it before they reach the window, so the queue keeps moving.",
      },
      {
        title: "No room for hardware",
        body: "There's no space for a bulky POS. Ordering runs on phones — the customer's and yours — with nothing to install.",
      },
      {
        title: "Different pitch every day",
        body: "You move, your menu changes, and sometimes you sell out. Edit items and availability in seconds from your phone.",
      },
    ],
    features: [
      {
        title: "Order ahead from any phone",
        body: "Share your storefront link or a QR on the truck. Customers order and pay before they arrive, and the order lands with you.",
      },
      {
        title: "No hardware",
        body: "Run everything from the dashboard on a phone or tablet you already own. Nothing to buy, nothing to plug in.",
      },
      {
        title: "Change the menu on the fly",
        body: "Sold out of the special? Toggle it off in seconds. Photograph a new menu to import it when the offering changes.",
      },
      {
        title: "Card and pay-by-bank",
        body: "Take cards, Apple Pay, Google Pay, and PayTo pay-by-bank, settled to your own account, all on the customer's phone.",
      },
    ],
    faqs: [
      {
        question: "Do I need a POS or card machine?",
        answer:
          "No. Customers order and pay on their own phone, and you run everything from the dashboard on a device you already have, so there's no hardware to carry.",
      },
      {
        question: "Can customers skip the queue?",
        answer:
          "Yes. They can order ahead from your storefront link or a QR code on the truck and pay from their phone, so their food is being made before they reach the window.",
      },
      {
        question: "Can I change my menu when I sell out?",
        answer:
          "Yes. You can toggle an item's availability off in seconds from your phone, and re-import a new menu from a photo whenever your offering changes.",
      },
    ],
  },
];

export function getSegment(slug: string): MarketingSegment | undefined {
  return SEGMENTS.find((segment) => segment.slug === slug);
}
