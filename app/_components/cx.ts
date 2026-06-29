/**
 * Minimal className joiner — drops falsy values so conditional classes compose
 * cleanly (`cx("a", cond && "b")`). The repo carries no clsx / cn / classnames
 * dependency and this is enough for the shared primitives, so we avoid adding one.
 */
export type ClassValue = string | false | null | undefined;

export function cx(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
