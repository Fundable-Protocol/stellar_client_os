// Copyright 2024 Fundable-Protocol Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Campaign Social Sharing Service
 * 
 * Issue #999: Campaign social sharing - pre-filled social posts
 * 
 * Generate shareable links with pre-filled Twitter/Facebook/LinkedIn posts
 * showing: campaign name, tree count, CO2 impact, call-to-action for sponsors.
 */

export interface SocialShareConfig {
  campaignId: string;
  campaignName: string;
  treesPlanted: number;
  co2Sequestered: number; // tons
  region: string;
  projectType: string;
  campaignUrl: string;
  sponsorName?: string;
  customMessage?: string;
  hashtags?: string[];
}

export interface SocialPostContent {
  platform: 'twitter' | 'facebook' | 'linkedin' | 'whatsapp' | 'email' | 'linkedin';
  text: string;
  url: string;
  hashtags: string[];
  imageUrl?: string;
}

export interface ShareableLink {
  platform: string;
  label: string;
  url: string;
  icon: string;
  color: string;
}

export const SOCIAL_PLATFORMS = {
  twitter: { label: 'Twitter', icon: 'Twitter', color: '#1DA1F2' },
  facebook: { label: 'Facebook', icon: 'Facebook', color: '#1877F2' },
  linkedin: { label: 'LinkedIn', icon: 'Linkedin', color: '#0A66C2' },
  whatsapp: { label: 'WhatsApp', icon: 'MessageCircle', color: '#25D366' },
  email: { label: 'Email', icon: 'Mail', color: '#EA4335' },
} as const;

export type PlatformKey = keyof typeof SOCIAL_PLATFORMS;

/**
 * Campaign Social Sharing Service
 */
export class CampaignSocialSharingService {
  private baseUrl: string;

  constructor(baseUrl: string = typeof window !== 'undefined' ? window.location.origin : 'https://fundable.protocol') {
    this.baseUrl = baseUrl;
  }

  /**
   * Generate social share content for a campaign
   */
  generateShareContent(config: SocialShareConfig): Record<PlatformKey, SocialPostContent> {
    const { campaignName, treesPlanted, co2Sequestered, region, projectType, campaignUrl, sponsorName, customMessage, hashtags = [] } = config;

    const defaultHashtags = ['CarbonOffset', 'ClimateAction', 'Reforestation', 'Sustainability'];
    const allHashtags = [...defaultHashtags, ...hashtags];

    const sponsorText = sponsorName ? ` by ${sponsorName}` : '';
    const impactText = `${treesPlanted.toLocaleString()} trees planted${sponsorText}, ${co2Sequestered.toLocaleString()} tons CO₂ sequestered in ${region}`;

    const baseText = customMessage || `I just supported "${campaignName}"! ${impactText} 🌱 Join me in making an impact!`;

    const twitterText = this.truncateForTwitter(baseText, campaignUrl, allHashtags);
    const facebookText = `${baseText}\n\nLearn more: ${campaignUrl}`;
    const linkedinText = `${baseText}\n\nCampaign: ${campaignName}\nLocation: ${region}\nType: ${projectType}\nImpact: ${impactText}\n\n${campaignUrl}`;
    const whatsappText = `${baseText}\n\n${campaignUrl}`;
    const emailSubject = `Join me in supporting ${campaignName}!`;
    const emailBody = `${baseText}\n\nCampaign Details:\n- Trees Planted: ${treesPlanted.toLocaleString()}\n- CO₂ Sequestered: ${co2Sequestered.toLocaleString()} tons\n- Region: ${region}\n- Project Type: ${projectType}\n\nJoin me: ${campaignUrl}`;

    return {
      twitter: {
        platform: 'twitter',
        text: twitterText,
        url: this.buildTwitterUrl(twitterText, campaignUrl, allHashtags),
        hashtags: allHashtags,
      },
      facebook: {
        platform: 'facebook',
        text: facebookText,
        url: this.buildFacebookUrl(campaignUrl),
        hashtags: allHashtags,
      },
      linkedin: {
        platform: 'linkedin',
        text: linkedinText,
        url: this.buildLinkedInUrl(campaignUrl, campaignName, linkedinText),
        hashtags: allHashtags,
      },
      whatsapp: {
        platform: 'whatsapp',
        text: whatsappText,
        url: this.buildWhatsAppUrl(whatsappText),
        hashtags: allHashtags,
      },
      email: {
        platform: 'email',
        text: emailBody,
        url: this.buildEmailUrl(emailSubject, emailBody),
        hashtags: allHashtags,
      },
    };
  }

  private truncateForTwitter(text: string, url: string, hashtags: string[]): string {
    const maxLength = 280;
    const urlLength = 23; // t.co shortened URL length
    const hashtagText = ' ' + hashtags.map(h => `#${h}`).join(' ');
    const availableLength = maxLength - urlLength - hashtagText.length - 1; // -1 for space before URL

    if (text.length <= availableLength) {
      return text;
    }

    return text.substring(0, availableLength - 3) + '...';
  }

  private buildTwitterUrl(text: string, url: string, hashtags: string[]): string {
    const params = new URLSearchParams();
    params.append('text', text);
    params.append('url', url);
    if (hashtags.length > 0) {
      params.append('hashtags', hashtags.join(','));
    }
    return `https://twitter.com/intent/tweet?${params.toString()}`;
  }

  private buildFacebookUrl(url: string): string {
    return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  }

  private buildLinkedInUrl(url: string, title: string, summary: string): string {
    const params = new URLSearchParams();
    params.append('url', url);
    params.append('title', title);
    params.append('summary', summary);
    return `https://www.linkedin.com/sharing/share-offsite/?${params.toString()}`;
  }

  private buildWhatsAppUrl(text: string): string {
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  private buildEmailUrl(subject: string, body: string): string {
    const params = new URLSearchParams();
    params.append('subject', subject);
    params.append('body', body);
    return `mailto:?${params.toString()}`;
  }

  /**
   * Generate all shareable links for a campaign
   */
  generateShareableLinks(config: SocialShareConfig): ShareableLink[] {
    const content = this.generateShareContent(config);

    return Object.entries(content).map(([platform, content]) => ({
      platform,
      label: SOCIAL_PLATFORMS[platform as PlatformKey].label,
      url: content.url,
      icon: SOCIAL_PLATFORMS[platform as PlatformKey].icon,
      color: SOCIAL_PLATFORMS[platform as PlatformKey].color,
    }));
  }

  /**
   * Generate embeddable share widget HTML
   */
  generateShareWidget(config: SocialShareConfig, options: {
    platforms?: PlatformKey[];
    size?: 'small' | 'medium' | 'large';
    showLabels?: boolean;
    theme?: 'light' | 'dark';
  } = {}): string {
    const { platforms = ['twitter', 'facebook', 'linkedin', 'whatsapp', 'email'], size = 'medium', showLabels = true, theme = 'light' } = options;
    const links = this.generateShareableLinks(config).filter(l => platforms.includes(l.platform as PlatformKey));

    const sizeClasses = { small: 'w-8 h-8 text-sm', medium: 'w-10 h-10 text-base', large: 'w-12 h-12 text-lg' };
    const themeClass = theme === 'dark' ? 'dark' : '';

    const buttons = links.map(link => `
      <a href="${link.url}" target="_blank" rel="noopener noreferrer" 
         class="social-share-btn ${themeClass} ${sizeClasses[size]}"
         style="background-color: ${link.color}; color: white;"
         aria-label="Share on ${link.label}"
         title="Share on ${link.label}">
        <svg class="w-full h-full" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          ${this.getPlatformIcon(link.platform)}
        </svg>
        ${showLabels ? `<span class="sr-only">${link.label}</span>` : ''}
      </a>
    `).join('');

    return `
      <div class="social-share-widget ${themeClass}" style="display: flex; gap: 8px; align-items: center;">
        ${buttons}
      </div>
      <style>
        .social-share-btn { border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: transform 0.2s, opacity 0.2s; }
        .social-share-btn:hover { transform: scale(1.1); opacity: 0.9; }
        .social-share-btn:focus { outline: 2px solid currentColor; outline-offset: 2px; }
        .dark .social-share-btn { background-color: #374151; }
      </style>
    `;
  }

  private getPlatformIcon(platform: string): string {
    const icons = {
      twitter: '<path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/>',
      facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
      linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>',
      whatsapp: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
      email: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    };
    return icons[platform] || '';
  }
}

export const campaignSocialSharingService = new CampaignSocialSharingService();