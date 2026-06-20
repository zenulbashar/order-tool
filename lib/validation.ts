import { z } from "zod";

/**
 * Canonical email form used everywhere we read or write a user's email.
 *
 * Auth.js only lower-cases the domain by default, which let mixed-case local
 * parts create duplicate accounts on roster-tool. Fully lower-casing here, plus
 * the UNIQUE INDEX on lower(email), closes that gap. Wired into the Resend
 * provider via `normalizeIdentifier`.
 */
export function normalizeEmail(identifier: string): string {
  const email = identifier.trim().toLowerCase();
  if ((email.match(/@/g) ?? []).length !== 1 || email.startsWith("@") || email.endsWith("@")) {
    throw new Error("A single valid email address is required.");
  }
  return email;
}

export const venueNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a venue name.")
  .max(80, "Venue name is too long.");

/**
 * URL-safe venue slug: lowercase alphanumerics separated by single hyphens.
 * Input is trimmed and lower-cased before validation so casing never blocks a
 * sign-up. Uniqueness is enforced separately (pre-check + unique index).
 */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Address must be at least 3 characters.")
  .max(40, "Address must be at most 40 characters.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers, and single hyphens.",
  );
