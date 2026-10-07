export type VerificationJobStatus = "pending" | "processing" | "succeeded" | "failed";

export interface VerificationJob {
  id: string;
  idempotencyKey: string;
  network: "testnet" | "mainnet";
  contractId: string;
  campaignId: string;
  plantingId: string;
  status: VerificationJobStatus;
  attempts: number;
  transactionHash?: string;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface VerificationResult {
  transactionHash: string;
}

export interface CampaignVerifier {
  verify(job: Pick<VerificationJob, "network" | "contractId" | "campaignId" | "plantingId">): Promise<VerificationResult>;
}

export interface VerificationQueueOptions {
  concurrency?: number;
  maxAttempts?: number;
  maxQueueSize?: number;
  verifier: CampaignVerifier;
  now?: () => number;
}

export type EnqueueResult = { created: boolean; job: VerificationJob };

/**
 * A bounded, at-least-once worker queue. Production deployments should replace
 * the Map with a shared store implementing the same atomic idempotency contract;
 * this implementation keeps the repository's existing in-memory service seam.
 */
export class CampaignVerificationQueue {
  private readonly jobs = new Map<string, VerificationJob>();
  private readonly pending: string[] = [];
  private readonly verifier: CampaignVerifier;
  private readonly concurrency: number;
  private readonly maxAttempts: number;
  private readonly maxQueueSize: number;
  private readonly now: () => number;
  private active = 0;
  private draining = false;

  constructor(options: VerificationQueueOptions) {
    this.verifier = options.verifier;
    this.concurrency = Math.min(Math.max(Math.trunc(options.concurrency ?? 250), 1), 2000);
    this.maxAttempts = Math.max(Math.trunc(options.maxAttempts ?? 3), 1);
    this.maxQueueSize = Math.max(Math.trunc(options.maxQueueSize ?? 10_000), this.concurrency);
    this.now = options.now ?? (() => Date.now());
  }

  enqueue(input: Omit<VerificationJob, "id" | "status" | "attempts" | "createdAt" | "updatedAt">): EnqueueResult {
    const existing = this.jobs.get(input.idempotencyKey);
    if (existing) return { created: false, job: { ...existing } };
    if (this.pending.length + this.active >= this.maxQueueSize) throw new Error("Verification queue is full");
    const now = this.now();
    const job: VerificationJob = {
      ...input,
      id: `verification-${now}-${this.jobs.size + 1}`,
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.idempotencyKey, job);
    this.pending.push(job.idempotencyKey);
    void this.drain();
    return { created: true, job: { ...job } };
  }

  getJob(idOrKey: string): VerificationJob | undefined {
    const job = this.jobs.get(idOrKey) ?? Array.from(this.jobs.values()).find((candidate) => candidate.id === idOrKey);
    return job ? { ...job } : undefined;
  }

  listJobs(campaignId?: string): VerificationJob[] {
    return Array.from(this.jobs.values())
      .filter((job) => !campaignId || job.campaignId === campaignId)
      .map((job) => ({ ...job }));
  }

  async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.pending.length > 0 && this.active < this.concurrency) {
        const key = this.pending.shift();
        if (!key) break;
        const job = this.jobs.get(key);
        if (!job || job.status !== "pending") continue;
        this.active += 1;
        void this.process(job).finally(() => {
          this.active -= 1;
          void this.drain();
        });
      }
    } finally {
      this.draining = false;
    }
  }

  async waitForIdle(): Promise<void> {
    while (this.pending.length > 0 || this.active > 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  reset(): void {
    this.jobs.clear();
    this.pending.length = 0;
    this.active = 0;
  }

  private async process(job: VerificationJob): Promise<void> {
    job.status = "processing";
    job.attempts += 1;
    job.updatedAt = this.now();
    try {
      const result = await this.verifier.verify(job);
      job.transactionHash = result.transactionHash;
      job.status = "succeeded";
      job.lastError = undefined;
    } catch (error) {
      job.lastError = error instanceof Error ? error.message : String(error);
      if (job.attempts < this.maxAttempts) {
        job.status = "pending";
        this.pending.push(job.idempotencyKey);
      } else {
        job.status = "failed";
      }
    } finally {
      job.updatedAt = this.now();
    }
  }
}

export const campaignVerificationQueue = new CampaignVerificationQueue({
  verifier: {
    async verify() {
      throw new Error("No campaign verifier is configured");
    },
  },
});
