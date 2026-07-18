// Plain (non-"use server") module for values shared between the Stations step's
// server action and its client form. A "use server" file may export only async
// functions, so constants like this must live outside actions.ts — otherwise the
// build treats the action module as having no valid exports.

/** Hard cap on how many prep stations onboarding will take, to keep it sane. */
export const MAX_STATIONS = 8;

/** Result of the saveStations action — an optional validation error. */
export type StationsState = { error?: string };
