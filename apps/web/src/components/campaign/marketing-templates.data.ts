export type MarketingSectionId = "email" | "social" | "deck";

export interface MarketingTemplateItem {
  id: string;
  title: string;
  description: string;
  filename: string;
  mimeType: string;
  content: string;
}

export interface MarketingTemplateSection {
  id: MarketingSectionId;
  title: string;
  description: string;
  templates: MarketingTemplateItem[];
}

interface SocialGraphicSpec {
  width: number;
  height: number;
  eyebrow: string;
  headline: string;
  subline: string;
}

function buildSocialGraphic({
  width,
  height,
  eyebrow,
  headline,
  subline,
}: SocialGraphicSpec): string {
  const padding = Math.round(Math.min(width, height) * 0.08);
  const eyebrowSize = Math.round(Math.min(width, height) * 0.035);
  const headlineSize = Math.round(Math.min(width, height) * 0.085);
  const sublineSize = Math.round(Math.min(width, height) * 0.04);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${headline}">`,
    `<defs>`,
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0%" stop-color="#0b0b0f"/>`,
    `<stop offset="55%" stop-color="#2b1055"/>`,
    `<stop offset="100%" stop-color="#7597de"/>`,
    `</linearGradient>`,
    `</defs>`,
    `<rect width="${width}" height="${height}" fill="url(#bg)"/>`,
    `<circle cx="${width - padding}" cy="${padding}" r="${Math.round(
      Math.min(width, height) * 0.18,
    )}" fill="#a855f7" fill-opacity="0.25"/>`,
    `<circle cx="${padding}" cy="${height - padding}" r="${Math.round(
      Math.min(width, height) * 0.14,
    )}" fill="#10b981" fill-opacity="0.2"/>`,
    `<text x="${padding}" y="${
      padding + eyebrowSize * 2
    }" fill="#c4b5fd" font-family="Arial, Helvetica, sans-serif" font-size="${eyebrowSize}" font-weight="700" letter-spacing="4">${eyebrow}</text>`,
    `<text x="${padding}" y="${
      padding + eyebrowSize * 2 + headlineSize * 1.4
    }" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${headlineSize}" font-weight="800">${headline}</text>`,
    `<text x="${padding}" y="${
      padding + eyebrowSize * 2 + headlineSize * 2.5
    }" fill="#e4e4e7" font-family="Arial, Helvetica, sans-serif" font-size="${sublineSize}" font-weight="500">${subline}</text>`,
    `<text x="${padding}" y="${
      height - padding
    }" fill="#f5f3ff" font-family="Arial, Helvetica, sans-serif" font-size="${sublineSize}" font-weight="700">fundable.finance</text>`,
    `</svg>`,
  ].join("");
}

const EMAIL_TEMPLATES: MarketingTemplateItem[] = [
  {
    id: "email-launch",
    title: "Campaign Launch Email",
    description: "Announce your campaign to your existing mailing list on day one.",
    filename: "email-launch.txt",
    mimeType: "text/plain",
    content: `Subject: Introducing {{campaignTitle}} — help us reach {{goalAmount}}

Hi {{recipientName}},

I'm excited to share {{campaignTitle}}, a campaign I just launched on Fundable.

Why this matters:
- {{missionStatement}}
- Every contribution moves us closer to {{goalAmount}}.
- Funds are transparent and tracked on-chain.

Back the campaign: {{campaignLink}}

If you can't contribute, sharing this email with one friend who might helps more than you'd think.

Thank you for being part of this,
{{yourName}}

--
P.S. Reply to this email with any questions — I read every response.`,
  },
  {
    id: "email-update",
    title: "Mid-Campaign Update",
    description: "Re-engage past donors and keep momentum halfway through.",
    filename: "email-update.txt",
    mimeType: "text/plain",
    content: `Subject: {{campaignTitle}} is {{percentFunded}} funded — here's what's next

Hi {{recipientName}},

Quick update on {{campaignTitle}}: we're {{percentFunded}} of the way to {{goalAmount}}, thanks to {{backerCount}} backers.

What we've accomplished so far:
- {{milestoneOne}}
- {{milestoneTwo}}

What's still needed:
- {{remainingNeed}}

See the progress: {{campaignLink}}

Know someone who'd care about this? Forward this email — it's the single easiest way to help.

With gratitude,
{{yourName}}`,
  },
  {
    id: "email-thankyou",
    title: "Thank You Email",
    description: "Close the loop with donors after a contribution or campaign end.",
    filename: "email-thankyou.txt",
    mimeType: "text/plain",
    content: `Subject: Thank you — you helped make {{campaignTitle}} real

Hi {{recipientName}},

Your contribution of {{amount}} to {{campaignTitle}} is confirmed. Thank you.

Because of you:
- {{impactStatement}}
- We're now {{percentFunded}} funded with {{backerCount}} supporters.

Track the impact: {{campaignLink}}

You'll get an update when {{nextMilestone}}. Until then, thank you for backing this.

Gratefully,
{{yourName}}`,
  },
];

const SOCIAL_CAPTION_PACK = `SOCIAL CAPTION PACK — {{campaignTitle}}
Replace the {{placeholders}} before posting.

LAUNCH POST
We just launched {{campaignTitle}} on Fundable 🌱
Goal: {{goalAmount}} | {{deadline}}
Every contribution is tracked on-chain, so you'll see exactly where it goes.
Back it here: {{campaignLink}}
{{hashtagOne}} {{hashtagTwo}} {{hashtagThree}}

MILESTONE POST
{{percentFunded}} funded on {{campaignTitle}} — thank you!
New here? It takes 30 seconds to back the campaign and share it:
{{campaignLink}}
{{hashtagOne}} {{hashtagTwo}} {{hashtagThree}}

THANK-YOU POST
We did it — {{campaignTitle}} closed at {{percentFunded}} of goal.
To every backer, sharer, and believer: this one was yours.
Final report: {{campaignLink}}
{{hashtagOne}} {{hashtagTwo}} {{hashtagThree}}`;

const SOCIAL_TEMPLATES: MarketingTemplateItem[] = [
  {
    id: "social-twitter",
    title: "Twitter / X Graphic",
    description: "1200×675 timeline card for launch and milestone posts.",
    filename: "social-twitter.svg",
    mimeType: "image/svg+xml",
    content: buildSocialGraphic({
      width: 1200,
      height: 675,
      eyebrow: "CAMPAIGN LAUNCH",
      headline: "[YOUR CAMPAIGN HEADLINE]",
      subline: "Help us reach [GOAL] — back the campaign today",
    }),
  },
  {
    id: "social-instagram",
    title: "Instagram Square Graphic",
    description: "1080×1080 feed post optimized for mobile crops.",
    filename: "social-instagram.svg",
    mimeType: "image/svg+xml",
    content: buildSocialGraphic({
      width: 1080,
      height: 1080,
      eyebrow: "JOIN THE CAMPAIGN",
      headline: "[YOUR CAMPAIGN HEADLINE]",
      subline: "Tap the link in bio to contribute",
    }),
  },
  {
    id: "social-facebook",
    title: "Facebook Cover Banner",
    description: "1640×856 cover photo for your page and campaign groups.",
    filename: "social-facebook.svg",
    mimeType: "image/svg+xml",
    content: buildSocialGraphic({
      width: 1640,
      height: 856,
      eyebrow: "NOW FUNDING",
      headline: "[YOUR CAMPAIGN HEADLINE]",
      subline: "Transparent, on-chain fundraising — learn more",
    }),
  },
  {
    id: "social-captions",
    title: "Social Caption Pack",
    description: "Ready-to-paste captions for launch, milestone, and thank-you posts.",
    filename: "social-caption-pack.txt",
    mimeType: "text/plain",
    content: SOCIAL_CAPTION_PACK,
  },
];

const DECK_TEMPLATES: MarketingTemplateItem[] = [
  {
    id: "pitch-deck-standard",
    title: "Standard Pitch Deck",
    description: "Ten-slide outline for pitching major donors and institutional backers.",
    filename: "pitch-deck-standard.md",
    mimeType: "text/markdown",
    content: `# {{campaignTitle}} — Pitch Deck Outline

## Slide 1 — Title
Campaign name, one-line promise, your name, contact, {{campaignLink}}.

## Slide 2 — The Problem
Who is affected, how many, and what it costs them today.

## Slide 3 — The Solution
What {{campaignTitle}} does differently, in one sentence.

## Slide 4 — Traction
{{percentFunded}} funded, {{backerCount}} backers, milestones already delivered.

## Slide 5 — Impact Model
How each unit of funding converts into measurable outcomes ({{impactMetric}}).

## Slide 6 — Budget
Line-item breakdown of {{goalAmount}} and what triggers each payout.

## Slide 7 — Timeline
Start, milestones, and completion date with owners.

## Slide 8 — Team
Relevant experience of the people executing this campaign.

## Slide 9 — Risks & Mitigations
The two or three biggest risks and how you handle them.

## Slide 10 — The Ask
Exact amount, exact use, and exactly how to contribute: {{campaignLink}}`,
  },
  {
    id: "pitch-deck-one-pager",
    title: "One-Pager Summary",
    description: "Single-page leave-behind for meetings and email follow-ups.",
    filename: "pitch-deck-one-pager.md",
    mimeType: "text/markdown",
    content: `# {{campaignTitle}} — One-Pager

**Goal:** {{goalAmount}}  **Deadline:** {{deadline}}  **Status:** {{percentFunded}} funded

## In one sentence
{{missionStatement}}

## The need
{{problemSummary}}

## The plan
{{solutionSummary}}

## Proof
- {{milestoneOne}}
- {{milestoneTwo}}
- {{backerCount}} backers to date

## Use of funds
| Line item | Amount | Outcome |
| --- | --- | --- |
| {{budgetLineOne}} | {{amountOne}} | {{outcomeOne}} |
| {{budgetLineTwo}} | {{amountTwo}} | {{outcomeTwo}} |

## Contact
{{yourName}} · {{email}} · {{campaignLink}}`,
  },
];

export const MARKETING_TEMPLATE_SECTIONS: MarketingTemplateSection[] = [
  {
    id: "email",
    title: "Email Templates",
    description:
      "Use these email templates to reach out to potential donors and supporters.",
    templates: EMAIL_TEMPLATES,
  },
  {
    id: "social",
    title: "Social Media Graphics",
    description: "Eye-catching graphics optimized for Twitter, Instagram, and Facebook.",
    templates: SOCIAL_TEMPLATES,
  },
  {
    id: "deck",
    title: "Fundraising Pitch Decks",
    description:
      "Professional presentation templates to pitch major donors or institutional investors.",
    templates: DECK_TEMPLATES,
  },
];
