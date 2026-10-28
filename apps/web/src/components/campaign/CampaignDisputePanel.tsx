'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@apollo/client';
import {
  FILE_CAMPAIGN_DISPUTE,
  RESPOND_TO_CAMPAIGN_DISPUTE,
  RESOLVE_CAMPAIGN_DISPUTE,
} from '@/graphql/mutations/campaignDispute';
import { CampaignStatus, DisputeStatus, DisputeResolution } from '@/types/campaign';

export interface CampaignDispute {
  id: string;
  campaignId: string;
  backerId: string;
  reason: string;
  description: string;
  evidenceUrls: string[];
  status: DisputeStatus;
  createdAt: string;
  creatorResponseDeadline: string;
  creatorResponse?: string | null;
  creatorRespondedAt?: string | null;
  resolution?: DisputeResolution | null;
  refundAmount?: number | null;
  mediatorNotes?: string | null;
  resolvedAt?: string | null;
}

export interface CampaignDisputePanelProps {
  campaignId: string;
  campaignStatus: CampaignStatus;
  currentUserId: string;
  isCreator: boolean;
  isMediator: boolean;
  dispute?: CampaignDispute | null;
  onDisputeUpdated?: (dispute: CampaignDispute) => void;
}

const CLOSED_STATUSES: CampaignStatus[] = [
  CampaignStatus.Successful,
  CampaignStatus.Failed,
  CampaignStatus.Claimed,
];

const DISPUTE_REASONS = [
  { value: 'UNDELIVERED_REWARD', label: 'Reward not delivered' },
  { value: 'FRAUDULENT_CAMPAIGN', label: 'Fraudulent campaign' },
  { value: 'REWARD_NOT_AS_DESCRIBED', label: 'Reward not as described' },
  { value: 'CREATOR_UNRESPONSIVE', label: 'Creator unresponsive' },
  { value: 'OTHER', label: 'Other' },
];

const CREATOR_RESPONSE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return 'Expired';
  const totalSeconds = Math.floor(msRemaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

export default function CampaignDisputePanel({
  campaignId,
  campaignStatus,
  currentUserId,
  isCreator,
  isMediator,
  dispute,
  onDisputeUpdated,
}: CampaignDisputePanelProps) {
  const [reason, setReason] = useState<string>(DISPUTE_REASONS[0].value);
  const [description, setDescription] = useState('');
  const [evidenceInput, setEvidenceInput] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const [creatorResponse, setCreatorResponse] = useState('');
  const [now, setNow] = useState<number>(() => Date.now());

  const [refundType, setRefundType] = useState<'PARTIAL' | 'FULL'>('FULL');
  const [partialAmount, setPartialAmount] = useState('');
  const [mediatorNotes, setMediatorNotes] = useState('');
  const [mediatorError, setMediatorError] = useState<string | null>(null);

  const [fileDispute, { loading: filing }] = useMutation(FILE_CAMPAIGN_DISPUTE);
  const [respondToDispute, { loading: responding }] = useMutation(RESPOND_TO_CAMPAIGN_DISPUTE);
  const [resolveDispute, { loading: resolving }] = useMutation(RESOLVE_CAMPAIGN_DISPUTE);

  const isCampaignClosed = CLOSED_STATUSES.includes(campaignStatus);

  const deadlineMs = useMemo(() => {
    if (!dispute?.creatorResponseDeadline) return null;
    const parsed = new Date(dispute.creatorResponseDeadline).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }, [dispute?.creatorResponseDeadline]);

  const msRemaining = deadlineMs !== null ? deadlineMs - now : null;
  const responseWindowExpired = msRemaining !== null && msRemaining <= 0;

  useEffect(() => {
    if (deadlineMs === null) return;
    if (deadlineMs - Date.now() <= 0) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [deadlineMs]);

  const canFileDispute =
    isCampaignClosed && !dispute && !isCreator && !isMediator;

  const canCreatorRespond =
    !!dispute &&
    isCreator &&
    dispute.status === DisputeStatus.AwaitingCreatorResponse &&
    !dispute.creatorResponse &&
    !responseWindowExpired;

  const canMediate =
    !!dispute &&
    isMediator &&
    (dispute.status === DisputeStatus.AwaitingCreatorResponse ||
      dispute.status === DisputeStatus.UnderReview);

  const handleAddEvidence = () => {
    const trimmed = evidenceInput.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      setFormError('Evidence must be a valid URL starting with http:// or https://');
      return;
    }
    if (evidenceUrls.includes(trimmed)) {
      setFormError('This evidence URL has already been added');
      return;
    }
    setEvidenceUrls((prev) => [...prev, trimmed]);
    setEvidenceInput('');
    setFormError(null);
  };

  const handleRemoveEvidence = (url: string) => {
    setEvidenceUrls((prev) => prev.filter((item) => item !== url));
  };

  const handleFileDispute = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!description.trim()) {
      setFormError('Please describe the issue');
      return;
    }

    try {
      const { data } = await fileDispute({
        variables: {
          input: {
            campaignId,
            reason,
            description: description.trim(),
            evidenceUrls,
          },
        },
      });
      const created: CampaignDispute | undefined = data?.fileCampaignDispute?.dispute;
      if (created && onDisputeUpdated) onDisputeUpdated(created);
      setDescription('');
      setEvidenceUrls([]);
      setEvidenceInput('');
      setReason(DISPUTE_REASONS[0].value);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to file dispute');
    }
  };

  const handleCreatorResponse = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dispute) return;
    if (responseWindowExpired) {
      setFormError('The 7-day response window has expired');
      return;
    }
    if (!creatorResponse.trim()) {
      setFormError('Please provide a response');
      return;
    }

    try {
      const { data } = await respondToDispute({
        variables: {
          input: {
            disputeId: dispute.id,
            response: creatorResponse.trim(),
          },
        },
      });
      const updated: CampaignDispute | undefined = data?.respondToCampaignDispute?.dispute;
      if (updated && onDisputeUpdated) onDisputeUpdated(updated);
      setCreatorResponse('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to submit response');
    }
  };

  const handleResolve = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dispute) return;
    setMediatorError(null);

    let refundAmount: number | null = null;
    if (refundType === 'PARTIAL') {
      const parsed = Number(partialAmount);
      if (!partialAmount || Number.isNaN(parsed) || parsed <= 0) {
        setMediatorError('Enter a valid partial refund amount');
        return;
      }
      refundAmount = parsed;
    }

    try {
      const { data } = await resolveDispute({
        variables: {
          input: {
            disputeId: dispute.id,
            resolution:
              refundType === 'FULL'
                ? DisputeResolution.FullRefund
                : DisputeResolution.PartialRefund,
            refundAmount,
            mediatorNotes: mediatorNotes.trim() || null,
          },
        },
      });
      const updated: CampaignDispute | undefined = data?.resolveCampaignDispute?.dispute;
      if (updated && onDisputeUpdated) onDisputeUpdated(updated);
      setPartialAmount('');
      setMediatorNotes('');
    } catch (err) {
      setMediatorError(err instanceof Error ? err.message : 'Failed to resolve dispute');
    }
  };

  return (
    <div className="campaign-dispute-panel">
      <h2>Campaign Dispute Resolution</h2>

      {!isCampaignClosed && (
        <p className="dispute-notice">
          Disputes can only be filed after the campaign has closed.
        </p>
      )}

      {dispute && (
        <section className="dispute-summary">
          <h3>Dispute #{dispute.id}</h3>
          <p>
            <strong>Status:</strong> {dispute.status}
          </p>
          <p>
            <strong>Reason:</strong>{' '}
            {DISPUTE_REASONS.find((r) => r.value === dispute.reason)?.label ?? dispute.reason}
          </p>
          <p>
            <strong>Description:</strong> {dispute.description}
          </p>
          {dispute.evidenceUrls.length > 0 && (
            <div>
              <strong>Evidence:</strong>
              <ul>
                {dispute.evidenceUrls.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {dispute.creatorResponse && (
            <div className="creator-response">
              <strong>Creator response:</strong>
              <p>{dispute.creatorResponse}</p>
            </div>
          )}
          {dispute.resolution && (
            <div className="dispute-resolution">
              <strong>Resolution:</strong> {dispute.resolution}
              {dispute.refundAmount != null && (
                <span> — Refund: {dispute.refundAmount}</span>
              )}
              {dispute.mediatorNotes && <p>{dispute.mediatorNotes}</p>}
            </div>
          )}
        </section>
      )}

      {canFileDispute && (
        <section className="dispute-filing">
          <h3>File a Dispute</h3>
          <form onSubmit={handleFileDispute}>
            <label>
              Reason
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                {DISPUTE_REASONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue in detail"
                rows={4}
              />
            </label>

            <label>
              Evidence URL
              <div className="evidence-input-row">
                <input
                  type="url"
                  value={evidenceInput}
                  onChange={(e) => setEvidenceInput(e.target.value)}
                  placeholder="https://example.com/proof"
                />
                <button type="button" onClick={handleAddEvidence}>
                  Add
                </button>
              </div>
            </label>

            {evidenceUrls.length > 0 && (
              <ul className="evidence-list">
                {evidenceUrls.map((url) => (
                  <li key={url}>
                    <span>{url}</span>
                    <button type="button" onClick={() => handleRemoveEvidence(url)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {formError && <p className="form-error">{formError}</p>}

            <button type="submit" disabled={filing}>
              {filing ? 'Filing…' : 'File Dispute'}
            </button>
          </form>
        </section>
      )}

      {dispute && isCreator && dispute.status === DisputeStatus.AwaitingCreatorResponse && (
        <section className="creator-response-form">
          <h3>Respond to Dispute</h3>
          {msRemaining !== null && (
            <p className={`response-countdown ${responseWindowExpired ? 'expired' : ''}`}>
              {responseWindowExpired
                ? 'Response window expired'
                : `Time remaining to respond: ${formatCountdown(msRemaining)}`}
            </p>
          )}
          <form onSubmit={handleCreatorResponse}>
            <label>
              Your response
              <textarea
                value={creatorResponse}
                onChange={(e) => setCreatorResponse(e.target.value)}
                placeholder="Explain your side of the dispute"
                rows={4}
                disabled={responseWindowExpired}
              />
            </label>

            {formError && <p className="form-error">{formError}</p>}

            <button type="submit" disabled={responding || responseWindowExpired}>
              {responding ? 'Submitting…' : 'Submit Response'}
            </button>
          </form>
        </section>
      )}

      {canMediate && (
        <section className="mediator-review">
          <h3>Mediator Review</h3>
          <form onSubmit={handleResolve}>
            <fieldset>
              <legend>Refund decision</legend>
              <label>
                <input
                  type="radio"
                  name="refundType"
                  value="FULL"
                  checked={refundType === 'FULL'}
                  onChange={() => setRefundType('FULL')}
                />
                Full refund
              </label>
              <label>
                <input
                  type="radio"
                  name="refundType"
                  value="PARTIAL"
                  checked={refundType === 'PARTIAL'}
                  onChange={() => setRefundType('PARTIAL')}
                />
                Partial refund
              </label>
            </fieldset>

            {refundType === 'PARTIAL' && (
              <label>
                Partial refund amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  placeholder="0.00"
                />
              </label>
            )}

            <label>
              Mediator notes
              <textarea
                value={mediatorNotes}
                onChange={(e) => setMediatorNotes(e.target.value)}
                rows={3}
                placeholder="Optional notes on the decision"
              />
            </label>

            {mediatorError && <p className="form-error">{mediatorError}</p>}

            <button type="submit" disabled={resolving}>
              {resolving ? 'Issuing refund…' : 'Issue Refund'}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}