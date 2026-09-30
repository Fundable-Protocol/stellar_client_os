/**
 * Campaign Social Sharing Page
 * Issue #999: Campaign social sharing - pre-filled social posts
 */

import { CampaignSocialSharing } from '@/components/modules/campaign-social-sharing/CampaignSocialSharing';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';

interface PageProps {
  params: { campaignId: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return {
    title: 'Share Campaign | Fundable Protocol',
    description: 'Share your campaign impact on social media',
  };
}

export default function CampaignSharePage({ params }: PageProps) {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Share Campaign</h1>
        <p className="text-muted-foreground mt-2">
          Share your campaign impact on social media with pre-filled posts
        </p>
      </div>
      <CampaignSocialSharing campaignId={params.campaignId} />
    </div>
  );
}