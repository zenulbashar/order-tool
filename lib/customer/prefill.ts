import { cookies } from "next/headers";

/**
 * Device-level "remember me" PRE-FILL cookie — a pure checkout form convenience,
 * NOT identity. It holds ONLY a returning customer's name + phone so they don't
 * retype them on their OWN device. It lives in customer-land and is firewall-
 * compatible: this file never imports lib/auth.ts and never touches owner tables.
 *
 * By DESIGN this cookie:
 *  - carries NO auth token and NO session — it grants ZERO access to order
 *    history or any account data. History stays behind the authenticated
 *    ot_customer_session ONLY;
 *  - identifies the DEVICE/browser, not the person — on a SHARED device it
 *    pre-fills the PREVIOUS person's name/phone. That's acceptable for a
 *    low-stakes name+phone default, and is exactly why it must never expose more.
 *
 * httpOnly is used (the safest form): the value is read SERVER-SIDE in the
 * checkout page and passed down as a form default, so client JS never needs to
 * read it and XSS cannot exfiltrate the stored name/phone. A signed-in session
 * always takes precedence over this cookie (see checkout/page.tsx).
 */

const PREFILL_COOKIE = "ot_customer_prefill";
const PREFILL_MAX_AGE_S = 90 * 24 * 60 * 60; // 90 days

// Mirror the order-capture bounds so a tampered/oversized cookie can never seed
// an oversized form default. Trimmed + capped; empty fields drop out.
const NAME_MAX = 80;
const PHONE_MAX = 30;

export type CustomerPrefill = { name: string; phone: string };

/** Read the device pre-fill, or null when absent / empty / malformed. */
export async function readCustomerPrefill(): Promise<CustomerPrefill | null> {
  const raw = (await cookies()).get(PREFILL_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const name =
      typeof record.name === "string"
        ? record.name.trim().slice(0, NAME_MAX)
        : "";
    const phone =
      typeof record.phone === "string"
        ? record.phone.trim().slice(0, PHONE_MAX)
        : "";
    if (!name && !phone) return null;
    return { name, phone };
  } catch {
    return null; // not JSON / unreadable — treat as no pre-fill
  }
}

/**
 * Store the device pre-fill (name + phone only). Trims + caps both and writes
 * nothing if both are empty. MUST run in a Server Action or Route Handler (Next
 * forbids cookie writes during RSC render).
 */
export async function writeCustomerPrefill(
  name: string,
  phone: string,
): Promise<void> {
  const trimmedName = name.trim().slice(0, NAME_MAX);
  const trimmedPhone = phone.trim().slice(0, PHONE_MAX);
  if (!trimmedName && !trimmedPhone) return;

  (await cookies()).set(
    PREFILL_COOKIE,
    JSON.stringify({ name: trimmedName, phone: trimmedPhone }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: PREFILL_MAX_AGE_S,
    },
  );
}
