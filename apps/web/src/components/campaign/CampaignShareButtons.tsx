'use client';

interface CampaignShareButtonsProps {
  campaignId: string;
  campaignName: string;
  description?: string;
  raisedAmount?: string;
  goalAmount?: string;
  shareUrl?: string;
}

export function buildCampaignShareMessage({
  campaignName,
  description,
  raisedAmount,
  goalAmount,
}: Pick<CampaignShareButtonsProps, 'campaignName' | 'description' | 'raisedAmount' | 'goalAmount'>): string {
  const progress = raisedAmount && goalAmount ? ` ${raisedAmount}/${goalAmount} raised.` : '';
  const impact = description ? ` ${description}` : '';
  return `Support ${campaignName}!${impact}${progress}`;
}

export function buildCampaignShareLinks(props: CampaignShareButtonsProps) {
  const url = props.shareUrl ?? `${window.location.origin}/campaigns/${encodeURIComponent(props.campaignId)}`;
  const message = buildCampaignShareMessage(props);
  return {
    twitter: `https://twitter.com/intent/tweet?${new URLSearchParams({ text: message, url }).toString()}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: url, quote: message }).toString()}`,
    whatsapp: `https://wa.me/?${new URLSearchParams({ text: `${message} ${url}` }).toString()}`,
  };
}

export default function CampaignShareButtons(props: CampaignShareButtonsProps) {
  const links = buildCampaignShareLinks(props);
  const items = [
    { name: 'Twitter', href: links.twitter, className: 'bg-sky-500 hover:bg-sky-600' },
    { name: 'Facebook', href: links.facebook, className: 'bg-blue-600 hover:bg-blue-700' },
    { name: 'WhatsApp', href: links.whatsapp, className: 'bg-green-600 hover:bg-green-700' },
  ];

  return (
    <div aria-label="Share campaign" className="flex flex-wrap gap-2">
      {items.map((item) => (
        <a
          key={item.name}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`rounded-md px-3 py-2 text-sm font-medium text-white transition-colors ${item.className}`}
        >
          Share on {item.name}
        </a>
      ))}
    </div>
  );
}
