export type PledgePaymentStatus = "FAILED" | "RETRY_SCHEDULED" | "CONFIRMED" | "CANCELLED";

export interface PledgePaymentAttempt {
  attempt: number;
  attemptedAt: number;
  error: string;
  nextRetryAt?: number;
}

export interface PledgePayment {
  id: string;
  campaignId: string;
  backerAddress: string;
  amount: string;
  status: PledgePaymentStatus;
  retryCount: number;
  nextRetryAt?: number;
  attempts: PledgePaymentAttempt[];
  createdAt: number;
  updatedAt: number;
}

export interface PledgeNotification {
  paymentId: string;
  backerAddress: string;
  type: "PAYMENT_FAILED" | "PAYMENT_RETRY_SCHEDULED" | "PAYMENT_CANCELLED" | "PAYMENT_CONFIRMED";
  message: string;
  createdAt: number;
  manualRetryAvailable: boolean;
}

export const RETRY_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const MAX_PAYMENT_RETRIES = 3;

class PledgeRetryService {
  private payments = new Map<string, PledgePayment>();
  private notifications: PledgeNotification[] = [];

  createFailedPayment(input: { id: string; campaignId: string; backerAddress: string; amount: string; error: string; now?: number }): PledgePayment {
    const now = input.now ?? Date.now();
    const payment: PledgePayment = {
      id: input.id, campaignId: input.campaignId, backerAddress: input.backerAddress, amount: input.amount,
      status: "RETRY_SCHEDULED", retryCount: 0, nextRetryAt: now + RETRY_INTERVAL_MS,
      attempts: [{ attempt: 0, attemptedAt: now, error: input.error, nextRetryAt: now + RETRY_INTERVAL_MS }], createdAt: now, updatedAt: now,
    };
    this.payments.set(payment.id, payment);
    this.notify(payment, "PAYMENT_FAILED", `Pledge payment failed: ${input.error}. We will retry automatically in 6 hours.`, now, true);
    this.notify(payment, "PAYMENT_RETRY_SCHEDULED", "Your pledge is scheduled for an automatic retry. You can retry manually now.", now, true);
    return { ...payment, attempts: [...payment.attempts] };
  }

  retry(paymentId: string, result: { ok: boolean; error?: string; now?: number }): PledgePayment {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error("Pledge payment not found");
    const now = result.now ?? Date.now();
    if (payment.status === "CONFIRMED" || payment.status === "CANCELLED") return { ...payment, attempts: [...payment.attempts] };
    const attempt = payment.retryCount + 1;
    if (result.ok) {
      payment.status = "CONFIRMED";
      payment.nextRetryAt = undefined;
      payment.updatedAt = now;
      this.notify(payment, "PAYMENT_CONFIRMED", "Your pledge payment was confirmed.", now, false);
    } else {
      payment.retryCount = attempt;
      const finalAttempt = attempt >= MAX_PAYMENT_RETRIES;
      payment.status = finalAttempt ? "CANCELLED" : "RETRY_SCHEDULED";
      payment.nextRetryAt = finalAttempt ? undefined : now + RETRY_INTERVAL_MS;
      payment.updatedAt = now;
      payment.attempts.push({ attempt, attemptedAt: now, error: result.error ?? "Payment failed", nextRetryAt: payment.nextRetryAt });
      this.notify(payment, finalAttempt ? "PAYMENT_CANCELLED" : "PAYMENT_FAILED", finalAttempt ? "Your pledge was cancelled after three failed payment attempts." : `Pledge retry ${attempt} failed. We will try again in 6 hours.`, now, !finalAttempt);
    }
    return { ...payment, attempts: [...payment.attempts] };
  }

  get(paymentId: string): PledgePayment | undefined {
    const payment = this.payments.get(paymentId);
    return payment ? { ...payment, attempts: [...payment.attempts] } : undefined;
  }

  notificationsFor(address: string): PledgeNotification[] {
    return this.notifications.filter((notification) => notification.backerAddress.toLowerCase() === address.toLowerCase()).map((notification) => ({ ...notification }));
  }

  reset(): void { this.payments.clear(); this.notifications = []; }

  private notify(payment: PledgePayment, type: PledgeNotification["type"], message: string, createdAt: number, manualRetryAvailable: boolean): void {
    this.notifications.push({ paymentId: payment.id, backerAddress: payment.backerAddress, type, message, createdAt, manualRetryAvailable });
  }
}

export const pledgeRetryService = new PledgeRetryService();
export { PledgeRetryService };
