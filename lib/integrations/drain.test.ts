import { describe, expect, it } from "vitest";

import { drainDueJobs } from "@/lib/integrations/drain";

/** A fake due-queue: claimBatch consumes up to `limit` of the backlog. */
function fakeQueue(backlog: number) {
  const state = { remaining: backlog, claims: 0 };
  const claimBatch = async (limit: number) => {
    state.claims += 1;
    const took = Math.min(limit, state.remaining);
    state.remaining -= took;
    return took;
  };
  return { state, claimBatch };
}

describe("drainDueJobs", () => {
  it("drains a backlog of 100 jobs within one invocation (M2 acceptance)", async () => {
    const { state, claimBatch } = fakeQueue(100);
    const result = await drainDueJobs({
      claimBatch,
      batchSize: 10,
      deadlineMs: Number.MAX_SAFE_INTEGER,
    });
    expect(result.processed).toBe(100);
    expect(state.remaining).toBe(0);
    expect(result.budgetExhausted).toBe(false);
    // 10 full batches + the short (empty) batch that proves the queue is dry.
    expect(state.claims).toBe(11);
  });

  it("stops immediately on a short batch (queue empty)", async () => {
    const { state, claimBatch } = fakeQueue(3);
    const result = await drainDueJobs({
      claimBatch,
      batchSize: 10,
      deadlineMs: Number.MAX_SAFE_INTEGER,
    });
    expect(result).toEqual({ processed: 3, budgetExhausted: false });
    expect(state.claims).toBe(1);
  });

  it("stops on the deadline with jobs still due and says so", async () => {
    const { claimBatch } = fakeQueue(1_000);
    let clock = 0;
    const result = await drainDueJobs({
      claimBatch,
      batchSize: 10,
      deadlineMs: 25,
      // Each batch "takes" 10ms; the deadline passes after the 3rd batch.
      now: () => (clock += 10),
    });
    expect(result.processed).toBe(30);
    expect(result.budgetExhausted).toBe(true);
  });

  it("propagates a claim failure to the caller (cron 500s → reported)", async () => {
    await expect(
      drainDueJobs({
        claimBatch: async () => {
          throw new Error("db down");
        },
        batchSize: 10,
        deadlineMs: Number.MAX_SAFE_INTEGER,
      }),
    ).rejects.toThrow("db down");
  });
});
