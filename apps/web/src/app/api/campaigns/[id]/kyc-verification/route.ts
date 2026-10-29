import { zkKycVerificationService } from '@/services/zk-kyc-verification.service'
import type { SetCampaignKycConfigInput, SubmitZkProofInput } from '@/types/zk-kyc-verification'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const campaignId = params.id
  const url = new URL(request.url)
  if (url.searchParams.has('check')) {
    const walletAddress = url.searchParams.get('walletAddress')
    const pledgeAmountXlm = Number(url.searchParams.get('pledgeAmountXlm'))
    if (!walletAddress?.trim()) return Response.json({ error: 'walletAddress query param is required' }, { status: 400 })
    if (!Number.isFinite(pledgeAmountXlm) || pledgeAmountXlm <= 0) return Response.json({ error: 'pledgeAmountXlm must be a positive number' }, { status: 400 })
    try { const result = zkKycVerificationService.checkKycRequirement(walletAddress, campaignId, pledgeAmountXlm); return Response.json(result) }
    catch (err) { return Response.json({ error: (err as Error).message }, { status: 400 }) }
  }
  const config = zkKycVerificationService.getCampaignKycConfig(campaignId)
  if (!config) return Response.json({ kycEnabled: false, kycThresholdXlm: null, acceptedProviders: [] })
  return Response.json(config)
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const campaignId = params.id
  const url = new URL(request.url)
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (url.searchParams.has('proof')) {
    const input = body as SubmitZkProofInput
    if (!input.walletAddress?.trim()) return Response.json({ error: 'walletAddress is required' }, { status: 400 })
    try { const record = zkKycVerificationService.submitProof(input); return Response.json(record, { status: record.status === 'verified' ? 200 : 422 }) }
    catch (err) { return Response.json({ error: (err as Error).message }, { status: 400 }) }
  }
  const creatorAddress = (body.creatorAddress as string | undefined) ?? ''
  const input: SetCampaignKycConfigInput = { kycEnabled: Boolean(body.kycEnabled), kycThresholdXlm: (body.kycThresholdXlm as number | null | undefined) ?? null, acceptedProviders: (body.acceptedProviders as never) ?? undefined }
  try { const config = zkKycVerificationService.setCampaignKycConfig(campaignId, creatorAddress, input); return Response.json(config) }
  catch (err) { return Response.json({ error: (err as Error).message }, { status: 400 }) }
}