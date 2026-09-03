import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "./errors";

/**
 * Every caller of isUniqueViolation turns a duplicate-key conflict into a
 * friendly "already taken" (or, on the refund path, a benign no-op). drizzle-orm
 * hands callers a DrizzleQueryError wrapping the Postgres error, so the check
 * must see through the wrapper or every conflict becomes a 500.
 */
const pgUnique = () => Object.assign(new Error("duplicate key"), { code: "23505" });

describe("isUniqueViolation", () => {
  it("recognises a bare Postgres unique violation", () => {
    expect(isUniqueViolation(pgUnique())).toBe(true);
  });

  it("recognises the violation inside drizzle's query error wrapper", () => {
    expect(
      isUniqueViolation(new DrizzleQueryError("insert into x", [], pgUnique())),
    ).toBe(true);
  });

  it("looks through more than one layer of cause", () => {
    const wrapped = new Error("outer", { cause: new Error("mid", { cause: pgUnique() }) });
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it("does not classify other SQLSTATEs or shapeless errors as conflicts", () => {
    expect(isUniqueViolation(Object.assign(new Error("fk"), { code: "23503" }))).toBe(false);
    expect(isUniqueViolation(new DrizzleQueryError("q", [], new Error("timeout")))).toBe(false);
    expect(isUniqueViolation(new Error("plain"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});
