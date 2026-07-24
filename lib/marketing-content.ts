/**
 * Marketing content — the FAQ and the /learn guides — as typed data, so the
 * visible UI and the structured data (FAQPage / Article JSON-LD) render from
 * ONE source and can never drift apart (Google penalises FAQ markup that
 * doesn't match the page).
 *
 * Every answer states real, current product behaviour only — no invented
 * capabilities, ratings, or numbers. Dependency-free so metadata routes and
 * server components can import it anywhere.
 */

export type FaqItem = { question: string; answer: string };

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is Prompt2Eat?",
    answer:
      "Prompt2Eat is an AI-native ordering platform for restaurants, cafés, and hospitality venues. Diners scan a QR code or open the venue's link and just say what they feel like — the AI concierge finds matching dishes from the live menu and sends the order to the kitchen. Owners run the menu, orders, payments, stock, and storefront from one dashboard.",
  },
  {
    question: "How does the AI concierge take an order?",
    answer:
      "A diner describes a craving in plain language — for example, \"something warming and vegetarian, around $18\" — and the concierge proposes real dishes from the venue's menu, with sizes and modifiers handled. Suggestions only pre-fill: the diner always reviews and confirms before anything is ordered, and the concierge never edits the cart on its own.",
  },
  {
    question: "Do diners need to download an app?",
    answer:
      "No. Ordering runs entirely in the browser — diners scan the table QR code or open the venue's storefront link on their phone. No app store, no account required to order.",
  },
  {
    question: "How do I get my menu into Prompt2Eat?",
    answer:
      "Snap a photo of your printed menu during onboarding and the AI reads it into items, categories, sizes, and prices. You review everything before it saves — nothing is published without your approval. You can also build or edit the menu by hand in the dashboard at any time.",
  },
  {
    question: "What payment methods are supported?",
    answer:
      "Cards, Apple Pay, and Google Pay via Stripe, plus PayTo pay-by-bank for Australian venues. Orders are only confirmed by verified payment events — a kitchen never starts on an unpaid ticket.",
  },
  {
    question: "What is PayTo pay-by-bank?",
    answer:
      "PayTo lets a diner pay straight from their bank account: they approve the payment in their own banking app instead of typing card details. Venues can offer an optional discount for choosing it, and returning diners can save a mandate for one-tap checkout.",
  },
  {
    question: "Does it work for dine-in, takeaway, and scheduled orders?",
    answer:
      "Yes. Dine-in works from table QR codes with the table number carried through to the kitchen. Takeaway supports order-ahead with ASAP or scheduled pickup times, controlled by the lead time you set.",
  },
  {
    question: "What does my kitchen actually see?",
    answer:
      "A live order board grouped by status (new, preparing, ready), with per-order tickets. Printing supports three outputs: the customer receipt with prices, a packaging docket listing every item so nothing misses the bag, and price-free sticky labels per prep station headed by the order number and station code — for example 42-K for order 42 at the Kebab station.",
  },
  {
    question: "How much does Prompt2Eat cost?",
    answer:
      "Every venue starts with a 30-day free trial — no card required to begin. After that, plans scale with your venue, and you can change or cancel from Billing at any time.",
  },
  {
    question: "Can the AI handle allergies and dietary needs?",
    answer:
      "Dietary tags (vegan, vegetarian, gluten-free, and more) are shown on items and understood by the concierge, and every dietary answer carries a disclaimer: tags are the venue's guide, not a guarantee. For allergies, diners are always told to confirm directly with the venue — the AI never asserts a dish is allergen-safe.",
  },
];

export type Article = {
  slug: string;
  title: string;
  /** Meta description + index-card summary (~155 chars for snippets). */
  description: string;
  /** Mono eyebrow shown above the title. */
  eyebrow: string;
  sections: { heading: string; paragraphs: string[] }[];
};

export const ARTICLES: Article[] = [
  {
    slug: "ai-ordering-for-restaurants",
    title: "What is AI ordering for restaurants?",
    description:
      "How AI-native ordering works: diners describe a craving, an AI concierge matches real menu items, and the kitchen gets a normal ticket.",
    eyebrow: "AI ordering",
    sections: [
      {
        heading: "From menus to conversations",
        paragraphs: [
          "Traditional online ordering makes the diner do the work: scroll a long menu, decode item names, and assemble a cart. AI ordering flips that. The diner says what they actually want — \"something warming and vegetarian, around $18\" — and an AI concierge reads the venue's live menu and proposes real dishes that fit, with sizes and add-ons already sorted.",
          "The important part is what the AI does not do. In Prompt2Eat, the concierge only proposes: every suggestion pre-fills a normal item sheet that the diner reviews and confirms. The AI never places an order on its own, never edits the cart directly, and never invents items that aren't on the menu.",
        ],
      },
      {
        heading: "What the venue sees",
        paragraphs: [
          "To the kitchen, an AI-assisted order is just an order: it lands on the live order board with the same statuses, tickets, and printing as any other. Staff don't need training in anything new — the AI changes how diners ask, not how kitchens work.",
          "Because the concierge answers from the venue's own menu data, dietary tags and prices stay accurate, and dietary answers always carry a disclaimer to confirm allergies with the venue directly.",
        ],
      },
      {
        heading: "Why venues adopt it",
        paragraphs: [
          "Diners who can ask for \"the most popular spicy thing under $20\" order faster and discover more of the menu than diners squinting at a PDF. Order-ahead, table QR ordering, and payment happen in the same flow, so the venue runs one system instead of three.",
        ],
      },
    ],
  },
  {
    slug: "qr-code-ordering",
    title: "QR code ordering for cafés and restaurants",
    description:
      "How QR dine-in ordering works end-to-end: table codes, browser ordering with no app, table numbers on the ticket, and payment at the table.",
    eyebrow: "QR dine-in",
    sections: [
      {
        heading: "Scan, order, pay — no app",
        paragraphs: [
          "QR ordering turns every table into a till. A diner scans the code on the table tent, the venue's branded menu opens in their browser — no app store, no signup — and they order and pay from their seat. The table number rides along automatically, so the kitchen ticket says exactly where the food goes.",
          "In Prompt2Eat, each table gets its own QR code, generated in the dashboard and printable as branded table tents. The storefront carries the venue's own colours and logo, so it feels like the venue, not a marketplace.",
        ],
      },
      {
        heading: "Built for real service",
        paragraphs: [
          "Orders only reach the kitchen after payment is confirmed, so nothing gets cooked on an unpaid ticket. The live order board shows which tables are seated and ordering, and dine-in tickets are marked with the table label on screen and on every print.",
          "Diners who prefer to talk can still use the AI concierge from the same page — QR ordering and conversational ordering are the same flow, not separate products.",
        ],
      },
    ],
  },
  {
    slug: "import-menu-from-photo",
    title: "Import a restaurant menu from a photo",
    description:
      "Turn a printed menu into a structured online menu in minutes: photograph it, let AI read items, sizes and prices, then review before publishing.",
    eyebrow: "Menu import",
    sections: [
      {
        heading: "The fastest path from paper to online",
        paragraphs: [
          "Retyping a menu is the most tedious step of going online. Prompt2Eat removes it: photograph your printed menu, and the AI reads it into structured items — names, categories, descriptions, sizes, and prices — in one pass.",
          "Everything lands in a review screen first. You check what was found, fix anything the photo obscured, and only then publish. Nothing is saved to your live menu without your approval.",
        ],
      },
      {
        heading: "After the import",
        paragraphs: [
          "Imported items are normal menu items: you can add photos, dietary tags, modifier groups, size variants, and per-station routing afterwards in the menu editor. The AI can also draft item descriptions for you — again as suggestions you approve, never silent edits.",
          "Menu import runs during onboarding so a venue can go from a paper menu to a live ordering page in a single sitting, and it stays available from the dashboard whenever the menu changes.",
        ],
      },
    ],
  },
  {
    slug: "payto-pay-by-bank",
    title: "PayTo pay-by-bank for Australian venues",
    description:
      "What PayTo means for hospitality: diners approve payment in their banking app, venues can reward it with a discount, and returning diners pay in one tap.",
    eyebrow: "Payments",
    sections: [
      {
        heading: "Paying from the bank, not the card",
        paragraphs: [
          "PayTo is Australia's bank-to-bank payment rail. Instead of typing card details, the diner chooses their bank at checkout and approves the payment inside their own banking app. The venue sees a confirmed, verified payment — the order is only sent to the kitchen once the payment event lands.",
          "Because approval happens in the diner's banking app, the checkout shows a calm waiting state that keeps checking for confirmation, with clear guidance that they won't be charged twice.",
        ],
      },
      {
        heading: "Why venues offer it",
        paragraphs: [
          "Venues can attach an optional discount to PayTo orders to steer diners toward it, and returning diners can save a mandate so future checkouts are one tap. Cards, Apple Pay, and Google Pay remain available beside it — PayTo is an additional option, not a replacement.",
        ],
      },
    ],
  },
  {
    slug: "kitchen-station-label-printing",
    title: "Kitchen dockets and station label printing",
    description:
      "Receipts, packaging dockets, and per-station sticky labels (like 42-K) — how multi-station printing keeps every order complete and every station fast.",
    eyebrow: "Kitchen ops",
    sections: [
      {
        heading: "Three prints, three jobs",
        paragraphs: [
          "One ticket can't serve three audiences. Prompt2Eat prints three: the customer receipt with prices and the total; a packaging docket that lists every item grouped by station so the person bagging the order can confirm nothing is missing; and a sticky label per prep station showing only that station's items — with no prices, sized for a small label roll.",
          "Each station label is headed by the order number plus the station's code — order 42 at the Kebab station prints 42-K — so a rail of labels stays sortable at a glance. Items that belong to other stations collapse to a count (\"+ 2 more items\"), which keeps the label readable on a tiny surface while still telling the station how many pieces complete the order.",
        ],
      },
      {
        heading: "Set up in onboarding, managed in settings",
        paragraphs: [
          "Venues define their stations — kebab, grill, fryer, whatever the pass looks like — during onboarding or later in settings, each with a short code. Menu items are routed to a station in the menu editor; anything unrouted stays on the receipt and the packaging docket. A venue with no stations just gets the classic single ticket.",
        ],
      },
    ],
  },
  {
    slug: "how-to-set-up-online-ordering",
    title: "How to set up online ordering for a restaurant",
    description:
      "Set up online ordering for a restaurant in an afternoon: import your menu from a photo, brand your storefront, turn on payments, and go live.",
    eyebrow: "Setup",
    sections: [
      {
        heading: "Start with your menu",
        paragraphs: [
          "The slow part of setting up online ordering for a restaurant has always been the menu, and that is exactly what Prompt2Eat shortcuts. Photograph your printed menu during onboarding and the AI reads it into structured items with categories, sizes, and prices, which you review before anything saves.",
          "From there the menu is yours to shape: add photos, dietary tags, modifier groups, and size variants in the editor. You can also have the AI draft item descriptions for you to approve, so the whole menu reads well without you writing every line.",
        ],
      },
      {
        heading: "Make the storefront yours",
        paragraphs: [
          "Your ordering page should look like your venue, not a marketplace. Set your brand colour and logo, add a cover photo and a short description, and enter your address and opening hours. Those details also feed the structured data that helps your page show up in search and in AI assistants.",
        ],
      },
      {
        heading: "Turn on payments",
        paragraphs: [
          "Connect your own payment account and start taking cards, Apple Pay, and Google Pay, plus PayTo pay-by-bank for Australian venues. Money settles to your account, and an order only reaches the kitchen once its payment is confirmed, so nothing is cooked on an unpaid ticket.",
        ],
      },
      {
        heading: "Choose how diners order",
        paragraphs: [
          "For dine-in, print a QR code for each table; a diner scans it, orders from their phone, and the table number rides along to the kitchen. For takeaway, diners order ahead for ASAP or a scheduled pickup time, within the lead time you set. Both run from the same storefront, and diners who prefer to talk can use the AI concierge on the same page.",
        ],
      },
      {
        heading: "Go live and get found",
        paragraphs: [
          "When you finish onboarding, your storefront goes live and is automatically added to the sitemap with Restaurant structured data, so Google and AI assistants can find and describe it. Keep your hours, address, and menu descriptions complete — that is what lets your page answer a diner's \"where, when, and what can I order\" without them ever calling.",
          "From that point, running online ordering and running your venue are the same dashboard: orders, payments, stock, and staff in one place.",
        ],
      },
    ],
  },
];

/** Look up one article by slug (used by generateStaticParams + the page). */
export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((article) => article.slug === slug);
}
