import { describe, expect, it } from "vitest";
import { CampaignVerificationQueue } from "./campaign-verification-queue.service";

describe("CampaignVerificationQueue", () => {
  it("processes more than 100 jobs with bounded concurrency and deduplicates keys", async () => {
    let active = 0;
    let maximum = 0;
    let completed = 0;
    const queue = new CampaignVerificationQueue({
      concurrency: 100,
      verifier: {
        async verify(job) {
          active += 1;
          maximum = Math.max(maximum, active);
          await Promise.resolve();
          active -= 1;
          completed += 1;
          return { transactionHash: `tx-${job.plantingId}` };
        },
      },
    });

    for (let index = 0; index < 125; index += 1) {
      queue.enqueue({ idempotencyKey: `job-${index}`, network: "testnet", contractId: "C1", campaignId: "campaign-1", plantingId: String(index) });
    }
    const duplicate = queue.enqueue({ idempotencyKey: "job-1", network: "testnet", contractId: "C1", campaignId: "campaign-1", plantingId: "1" });
    await queue.waitForIdle();

    expect(duplicate.created).toBe(false);
    expect(completed).toBe(125);
    expect(maximum).toBeLessThanOrEqual(100);
    expect(queue.listJobs("campaign-1").every((job) => job.status === "succeeded")).toBe(true);
  });

  it("retries transient failures and records a terminal failure after max attempts", async () => {
    let calls = 0;
    const queue = new CampaignVerificationQueue({
      concurrency: 1,
      maxAttempts: 2,
      verifier: { async verify() { calls += 1; throw new Error("rpc unavailable"); } },
    });
    queue.enqueue({ idempotencyKey: "retry-1", network: "testnet", contractId: "C1", campaignId: "campaign-1", plantingId: "1" });
    await queue.waitForIdle();
    expect(calls).toBe(2);
    expect(queue.getJob("retry-1")).toMatchObject({ status: "failed", attempts: 2, lastError: "rpc unavailable" });
  });
});
