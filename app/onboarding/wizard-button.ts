/**
 * The wizard's full-width step submit (audit D4).
 *
 * Two hand-written copies existed, in the details and service steps. Kept local
 * to app/onboarding rather than promoted into the design system: it is the
 * onboarding flow's own affordance, and a full-width forest submit is not a
 * shape the owner dashboard or the diner storefront has any use for. Naming it
 * globally would add design-system vocabulary for one flow.
 */
export const wizardSubmitButton =
  "flex w-full items-center justify-center gap-1.5 rounded-control bg-forest " +
  "px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 " +
  "disabled:opacity-60";
