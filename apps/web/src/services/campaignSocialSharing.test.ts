/**
 * Campaign Social Sharing Tests
 * Issue #999
 */

import { 
  CampaignSocialSharingService, 
  SocialShareConfig, 
  ShareableLink, 
  SOCIAL_PLATFORMS 
} from './campaignSocialSharing';

describe('CampaignSocialSharingService', () => {
  let service: CampaignSocialSharingService;

  beforeEach(() => {
    service = new CampaignSocialSharingService('https://example.com');
  });

  const sampleConfig: SocialShareConfig = {
    campaignId: 'camp-001',
    campaignName: 'Amazon Reforestation Project',
    treesPlanted: 125000,
    co2Sequestered: 45000,
    region: 'Amazon Basin',
    projectType: 'reforestation',
    campaignUrl: 'https://example.com/campaigns/camp-001',
    sponsorName: 'Green Corp',
    customMessage: 'Join me in supporting this amazing project!',
    hashtags: ['ClimateAction', 'Sustainability'],
  };

  describe('generateShareContent', () => {
    it('should generate content for all platforms', () => {
      const content = service.generateShareContent(sampleConfig);
      
      expect(content).toHaveProperty('twitter');
      expect(content).toHaveProperty('facebook');
      expect(content).toHaveProperty('linkedin');
      expect(content).toHaveProperty('whatsapp');
      expect(content).toHaveProperty('email');
    });

    it('should include campaign name in all posts', () => {
      const content = service.generateShareContent(sampleConfig);
      
      for (const platformContent of Object.values(content)) {
        expect(platformContent.text).toContain('Amazon Reforestation Project');
      }
    });

    it('should include tree count and CO2 in posts', () => {
      const content = service.generateShareContent(sampleConfig);
      
      for (const platformContent of Object.values(content)) {
        expect(platformContent.text).toContain('125,000');
        expect(platformContent.text).toContain('45,000');
      }
    });

    it('should include region in posts', () => {
      const content = service.generateShareContent(sampleConfig);
      
      for (const platformContent of Object.values(content)) {
        expect(platformContent.text).toContain('Amazon Basin');
      }
    });

    it('should include sponsor name when provided', () => {
      const content = service.generateShareContent(sampleConfig);
      
      for (const platformContent of Object.values(content)) {
        expect(platformContent.text).toContain('Green Corp');
      }
    });

    it('should include custom message', () => {
      const content = service.generateShareContent(sampleConfig);
      
      for (const platformContent of Object.values(content)) {
        expect(platformContent.text).toContain('Join me in supporting this amazing project!');
      }
    });

    it('should include default hashtags', () => {
      const content = service.generateShareContent(sampleConfig);
      
      for (const platformContent of Object.values(content)) {
        expect(platformContent.hashtags).toContain('CarbonOffset');
        expect(platformContent.hashtags).toContain('ClimateAction');
        expect(platformContent.hashtags).toContain('Reforestation');
        expect(platformContent.hashtags).toContain('Sustainability');
      }
    });

    it('should include custom hashtags', () => {
      const content = service.generateShareContent(sampleConfig);
      
      for (const platformContent of Object.values(content)) {
        expect(platformContent.hashtags).toContain('ClimateAction');
        expect(platformContent.hashtags).toContain('Sustainability');
      }
    });

    it('should include campaign URL in all platforms', () => {
      const content = service.generateShareContent(sampleConfig);
      
      for (const platformContent of Object.values(content)) {
        expect(platformContent.url).toContain('example.com/campaigns/camp-001');
      }
    });

    it('should generate valid Twitter URL', () => {
      const content = service.generateShareContent(sampleConfig);
      expect(content.twitter.url).toContain('twitter.com/intent/tweet');
      expect(content.twitter.url).toContain('text=');
      expect(content.twitter.url).toContain('url=');
    });

    it('should generate valid Facebook URL', () => {
      const content = service.generateShareContent(sampleConfig);
      expect(content.facebook.url).toContain('facebook.com/sharer/sharer.php');
      expect(content.facebook.url).toContain('u=');
    });

    it('should generate valid LinkedIn URL', () => {
      const content = service.generateShareContent(sampleConfig);
      expect(content.linkedin.url).toContain('linkedin.com/sharing/share-offsite');
      expect(content.linkedin.url).toContain('url=');
    });

    it('should generate valid WhatsApp URL', () => {
      const content = service.generateShareContent(sampleConfig);
      expect(content.whatsapp.url).toContain('wa.me/');
      expect(content.whatsapp.url).toContain('text=');
    });

    it('should generate valid Email URL', () => {
      const content = service.generateShareContent(sampleConfig);
      expect(content.email.url).toContain('mailto:');
      expect(content.email.url).toContain('subject=');
      expect(content.email.url).toContain('body=');
    });
  });

  describe('generateShareableLinks', () => {
    it('should return links for all platforms', () => {
      const links = service.generateShareableLinks(sampleConfig);
      
      expect(links.length).toBe(5);
      
      const platforms = links.map(l => l.platform);
      expect(platforms).toContain('twitter');
      expect(platforms).toContain('facebook');
      expect(platforms).toContain('linkedin');
      expect(platforms).toContain('whatsapp');
      expect(platforms).toContain('email');
    });

    it('should have correct structure for each link', () => {
      const links = service.generateShareableLinks(sampleConfig);
      
      for (const link of links) {
        expect(link).toHaveProperty('platform');
        expect(link).toHaveProperty('label');
        expect(link).toHaveProperty('url');
        expect(link).toHaveProperty('icon');
        expect(link).toHaveProperty('color');
        
        expect(link.url).toBeTruthy();
        expect(link.label).toBeTruthy();
      }
    });
  });

  describe('generateShareWidget', () => {
    it('should generate HTML for share widget', () => {
      const widgetHtml = service.generateShareWidget(sampleConfig);
      
      expect(widgetHtml).toContain('social-share-widget');
      expect(widgetHtml).toContain('social-share-btn');
      expect(widgetHtml).toContain('twitter');
      expect(widgetHtml).toContain('facebook');
      expect(widgetHtml).toContain('linkedin');
    });

    it('should filter platforms when specified', () => {
      const widgetHtml = service.generateShareWidget(sampleConfig, {
        platforms: ['twitter', 'linkedin'],
      });
      
      expect(widgetHtml).toContain('twitter');
      expect(widgetHtml).toContain('linkedin');
      expect(widgetHtml).not.toContain('facebook');
      expect(widgetHtml).not.toContain('whatsapp');
      expect(widgetHtml).not.toContain('email');
    });

    it('should support different sizes', () => {
      const smallWidget = service.generateShareWidget(sampleConfig, { size: 'small' });
      const largeWidget = service.generateShareWidget(sampleConfig, { size: 'large' });
      
      expect(smallWidget).toContain('w-8 h-8');
      expect(largeWidget).toContain('w-12 h-12');
    });

    it('should support dark theme', () => {
      const lightWidget = service.generateShareWidget(sampleConfig, { theme: 'light' });
      const darkWidget = service.generateShareWidget(sampleConfig, { theme: 'dark' });
      
      expect(darkWidget).toContain('dark');
    });
  });

  describe('SOCIAL_PLATFORMS constant', () => {
    it('should have all required platforms', () => {
      expect(SOCIAL_PLATFORMS).toHaveProperty('twitter');
      expect(SOCIAL_PLATFORMS).toHaveProperty('facebook');
      expect(SOCIAL_PLATFORMS).toHaveProperty('linkedin');
      expect(SOCIAL_PLATFORMS).toHaveProperty('whatsapp');
      expect(SOCIAL_PLATFORMS).toHaveProperty('email');
    });

    it('should have correct structure for each platform', () => {
      for (const [key, config] of Object.entries(SOCIAL_PLATFORMS)) {
        expect(config).toHaveProperty('label');
        expect(config).toHaveProperty('icon');
        expect(config).toHaveProperty('color');
        expect(config.label).toBeTruthy();
        expect(config.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle missing sponsor name', () => {
      const configWithoutSponsor = { ...sampleConfig, sponsorName: undefined };
      const content = service.generateShareContent(configWithoutSponsor);
      
      for (const platformContent of Object.values(content)) {
        // Should not crash and should still generate valid content
        expect(platformContent.text).toBeTruthy();
        expect(platformContent.url).toBeTruthy();
      }
    });

    it('should handle missing custom message', () => {
      const configWithoutMessage = { ...sampleConfig, customMessage: undefined };
      const content = service.generateShareContent(configWithoutMessage);
      
      for (const platformContent of Object.values(content)) {
        expect(platformContent.text).toBeTruthy();
        expect(platformContent.text).toContain('Amazon Reforestation Project');
      }
    });

    it('should handle empty hashtags array', () => {
      const configWithoutHashtags = { ...sampleConfig, hashtags: [] };
      const content = service.generateShareContent(configWithoutHashtags);
      
      for (const platformContent of Object.values(content)) {
        expect(platformContent.hashtags).toContain('CarbonOffset');
        expect(platformContent.hashtags).toContain('ClimateAction');
      }
    });

    it('should handle very long custom messages by truncating for Twitter', () => {
      const longMessage = 'A'.repeat(500);
      const configWithLongMessage = { ...sampleConfig, customMessage: longMessage };
      const content = service.generateShareContent(configWithLongMessage);
      
      // Twitter text should be truncated to fit within 280 chars (with URL and hashtags)
      expect(content.twitter.text.length).toBeLessThanOrEqual(280);
    });
  });
});