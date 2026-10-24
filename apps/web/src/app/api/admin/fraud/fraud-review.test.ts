import { beforeEach, describe, expect, it } from 'vitest';
import { GET as getReviewQueue } from './review-queue/route';
import { POST as postReviewDecision } from './review-queue/[id]/decision/route';
import { GET as getMetrics, POST as postRetrain } from './metrics/route';
import { fraudDetectionService } from '@/services/fraud-detection.service';

const ADMIN_KEY = 'test-admin-secret-key';

function adminRequest(url: string, options: RequestInit = {}): any {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${ADMIN_KEY}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return new Request(url, { ...options, headers });
}

describe('Admin Fraud Review Queue & Metrics Endpoints', () => {
  beforeEach(() => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    fraudDetectionService.reset();
  });

  describe('GET /api/admin/fraud/review-queue', () => {
    it('returns 401 when not authorized', async () => {
      const unauthorized = new Request('http://localhost/api/admin/fraud/review-queue');
      const response = await getReviewQueue(unauthorized as any);
      expect(response.status).toBe(401);
    });

    it('returns empty queue initially', async () => {
      const req = adminRequest('http://localhost/api/admin/fraud/review-queue');
      const response = await getReviewQueue(req);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data).toEqual([]);
      expect(data.total).toBe(0);
    });

    it('returns queued items when campaigns are flagged', async () => {
      await fraudDetectionService.reviewCampaignListing({
        id: 'camp-q-1',
        title: 'Guaranteed Profit Forestry',
        description: 'guaranteed 100% returns',
      });

      const req = adminRequest('http://localhost/api/admin/fraud/review-queue?status=PENDING');
      const response = await getReviewQueue(req);
      const json = await response.json();
      expect(json.total).toBe(1);
      expect(json.data[0].campaignId).toBe('camp-q-1');
      expect(json.data[0].status).toBe('PENDING');
    });
  });

  describe('POST /api/admin/fraud/review-queue/[id]/decision', () => {
    it('processes approval decision and updates queue status', async () => {
      await fraudDetectionService.reviewCampaignListing({
        id: 'camp-approve-api',
        title: 'Flagged Project',
        description: 'guaranteed 100% returns',
      });

      const req = adminRequest('http://localhost/api/admin/fraud/review-queue/camp-approve-api/decision', {
        method: 'POST',
        body: JSON.stringify({
          decision: 'APPROVE',
          reviewedBy: 'officer-1',
          notes: 'Legit NGO reviewed and accepted.',
        }),
      });

      const response = await postReviewDecision(req, { params: { id: 'camp-approve-api' } });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.reviewItem.status).toBe('APPROVED');
      expect(json.reviewItem.reviewedBy).toBe('officer-1');
    });

    it('rejects invalid decision payload', async () => {
      const req = adminRequest('http://localhost/api/admin/fraud/review-queue/camp-1/decision', {
        method: 'POST',
        body: JSON.stringify({
          decision: 'INVALID_CHOICE',
        }),
      });

      const response = await postReviewDecision(req, { params: { id: 'camp-1' } });
      expect(response.status).toBe(400);
    });
  });

  describe('GET & POST /api/admin/fraud/metrics', () => {
    it('returns model performance metrics including false positive rate', async () => {
      await fraudDetectionService.reviewCampaignListing({
        id: 'camp-m-1',
        title: 'Project 1',
        description: 'guaranteed 100% returns',
      });
      await fraudDetectionService.processManualReview('camp-m-1', {
        decision: 'APPROVE',
        reviewedBy: 'admin',
      });

      const req = adminRequest('http://localhost/api/admin/fraud/metrics');
      const response = await getMetrics(req);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.metrics.flaggedCount).toBe(1);
      expect(json.metrics.approvedCount).toBe(1);
      expect(json.metrics.falsePositiveRate).toBe(1);
      expect(json.isRetrainingDue).toBe(false);
    });

    it('triggers manual or quarterly model retraining', async () => {
      const req = adminRequest('http://localhost/api/admin/fraud/metrics', {
        method: 'POST',
        body: JSON.stringify({
          triggeredBy: 'MANUAL',
          notes: 'Ad-hoc model tuning',
        }),
      });

      const response = await postRetrain(req);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.log.newVersion).toBe('v1.1.0');
      expect(json.metrics.version).toBe('v1.1.0');
    });
  });
});
