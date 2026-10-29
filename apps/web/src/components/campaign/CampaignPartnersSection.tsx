import type { CampaignPartner } from "@/services/campaign.service";

export interface CampaignPartnersSectionProps {
  partners?: CampaignPartner[];
}

export function CampaignPartnersSection({ partners }: CampaignPartnersSectionProps) {
  if (!partners?.length) return null;

  return (
    <section
      aria-labelledby="campaign-partners-heading"
      className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2 id="campaign-partners-heading" className="text-xl font-bold text-zinc-950 dark:text-white">
        Official partners and sponsors
      </h2>
      <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {partners.map((partner, index) => (
          <li key={`${partner.name}-${partner.url}-${index}`}>
            <a
              href={partner.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-full min-h-28 flex-col items-center justify-center gap-3 rounded-lg border border-zinc-200 p-4 text-center transition-colors hover:border-fundable-purple-2 dark:border-zinc-800"
            >
              <img
                src={partner.logoUrl}
                alt={`${partner.name} logo`}
                className="max-h-12 max-w-full object-contain"
                loading="lazy"
              />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{partner.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
