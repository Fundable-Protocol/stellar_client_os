// Copyright 2024 Fundable-Protocol Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Campaign Social Sharing Component
 * 
 * Issue #999: Campaign social sharing - pre-filled social posts
 * 
 * Generate shareable links with pre-filled Twitter/Facebook/LinkedIn posts
 * showing: campaign name, tree count, CO2 impact, call-to-action for sponsors.
 */

'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Twitter, 
  Facebook, 
  Linkedin, 
  MessageCircle, 
  Mail, 
  Copy, 
  Check,
  ExternalLink,
  Twitter as TwitterIcon,
  Facebook as FacebookIcon,
  Linkedin as LinkedinIcon,
  MessageCircle as MessageCircleIcon,
  Mail as MailIcon,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { 
  CampaignSocialSharingService, 
  SocialShareConfig, 
  ShareableLink, 
  SOCIAL_PLATFORMS 
} from '@/services/campaignSocialSharing';

interface CampaignSocialSharingProps {
  campaignId: string;
  campaignName: string;
  treesPlanted: number;
  co2Sequestered: number;
  region: string;
  projectType: string;
  campaignUrl?: string;
  sponsorName?: string;
  className?: string;
}

export function CampaignSocialSharing({ 
  campaignId,
  campaignName,
  treesPlanted,
  co2Sequestered,
  region,
  projectType,
  campaignUrl,
  sponsorName,
  className 
}: CampaignSocialSharingProps) {
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const shareConfig: SocialShareConfig = {
    campaignId,
    campaignName,
    treesPlanted,
    co2Sequestered,
    region,
    projectType,
    campaignUrl: campaignUrl || (typeof window !== 'undefined' ? window.location.href : ''),
    sponsorName,
    customMessage,
    hashtags: hashtags.split(',').map(h => h.trim()).filter(Boolean),
  };

  const shareLinks = React.useMemo(() => 
    campaignSocialSharingService.generateShareableLinks(shareConfig), 
    [shareConfig]
  );

  const widgetHtml = React.useMemo(() => 
    campaignSocialSharingService.generateShareWidget(shareConfig, { 
      size: 'medium', 
      showLabels: true, 
      theme: 'light' 
    }), 
    [shareConfig]
  );

  const handleCopy = useCallback((platform: string, url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedPlatform(platform);
      setTimeout(() => setCopiedPlatform(null), 2000);
    });
  }, []);

  const handleShare = useCallback((url: string) => {
    if (navigator.share) {
      navigator.share({ url }).catch(console.error);
    } else {
      window.open(url, '_blank', 'width=600,height=400');
    }
  }, []);

  const formatNumber = (num: number) => new Intl.NumberFormat().format(num);

  const platformLabels = {
    twitter: 'Twitter',
    facebook: 'Facebook',
    linkedin: 'LinkedIn',
    whatsapp: 'WhatsApp',
    email: 'Email',
  };

  const platformIcons = {
    twitter: <Twitter className="w-5 h-5" />,
    facebook: <Facebook className="w-5 h-5" />,
    linkedin: <Linkedin className="w-5 h-5" />,
    whatsapp: <MessageCircle className="w-5 h-5" />,
    email: <Mail className="w-5 h-5" />,
  };

  const platformColors = {
    twitter: '#1DA1F2',
    facebook: '#1877F2',
    linkedin: '#0A66C2',
    whatsapp: '#25D366',
    email: '#EA4335',
  };

  const platformLabelsMap = {
    twitter: 'Twitter',
    facebook: 'Facebook',
    linkedin: 'LinkedIn',
    whatsapp: 'WhatsApp',
    email: 'Email',
  };

  return (
    <Card className={cn('space-y-6', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span className="w-5 h-5">📤</span>
              Share Campaign
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              Share your impact and invite others to join
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Campaign Summary */}
        <div className="p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">{campaignName}</h3>
            <span className="text-sm text-muted-foreground">{formatNumber(treesPlanted)} trees • {formatNumber(co2Sequestered)} tons CO₂</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatNumber(treesPlanted)} trees planted • {formatNumber(co2Sequestered)} tons CO₂ sequestered in {region}
          </p>
        </div>

        {/* Quick Share Buttons */}
        <div>
          <h4 className="font-medium mb-3">Quick Share</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(SOCIAL_PLATFORMS).map(([platform, config]) => {
              const link = shareLinks.find(l => l.platform === platform);
              if (!link) return null;

              return (
                <TooltipProvider key={platform}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleShare(link.url)}
                        className="gap-2"
                        style={{ borderColor: config.color, color: config.color }}
                      >
                        <span 
                          style={{ 
                            width: 20, 
                            height: 20, 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            backgroundColor: config.color,
                            borderRadius: 4,
                            color: 'white'
                          }}
                        >
                          {platform === 'twitter' && <span style={{fontSize: 14}}>𝕏</span>}
                          {platform === 'facebook' && <span style={{fontSize: 14}}>f</span>}
                          {platform === 'linkedin' && <span style={{fontSize: 14}}>in</span>}
                          {platform === 'whatsapp' && <span style={{fontSize: 14}}>💬</span>}
                          {platform === 'email' && <span style={{fontSize: 14}}>✉️</span>}
                        </span>
                        <span className="hidden sm:inline">{config.label}</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="center">
                      Share on {config.label}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Copy Links Section */}
        <div>
          <h4 className="font-medium mb-3">Copy Links</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {Object.entries(SOCIAL_PLATFORMS).map(([platform, config]) => {
              const link = shareLinks.find(l => l.platform === platform);
              if (!link) return null;

              const isCopied = copiedPlatform === platform;

              return (
                <div key={platform} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-muted/50">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: config.color + '20' }}
                    >
                      <span style={{ fontSize: 18 }}>{platform === 'twitter' ? '𝕏' : platform === 'facebook' ? 'f' : platform === 'linkedin' ? 'in' : platform === 'whatsapp' ? '💬' : '✉️'}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{config.label}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-xs">{link.url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(platform, link.url)}
                      disabled={isCopied}
                      className="gap-1"
                    >
                      {isCopied ? (
                        <>
                          <span className="w-4 h-4 text-green-600">✓</span>
                          <span className="text-green-600 text-sm">Copied!</span>
                        </>
                      ) : (
                        <>
                          <span className="w-4 h-4">📋</span>
                          <span className="text-sm">Copy</span>
                        </>
                      )}
                    </Button>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(link.url, '_blank', 'width=600,height=400')}
                            className="gap-1"
                          >
                            <ExternalLink className="w-4 h-4" />
                            <span className="hidden sm:inline">Open</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="center">
                          Open {platformLabels[platform]}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Advanced Options */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium">Customize Your Post</h4>
            <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)}>
              {showAdvanced ? 'Hide Options' : 'Show Advanced Options'}
            </Button>
          </div>

          {showAdvanced && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg border border-muted/50">
              <div>
                <Label htmlFor="customMessage" className="block text-sm font-medium mb-1">
                  Custom Message (optional)
                </Label>
                <textarea
                  id="customMessage"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Add your personal message..."
                  rows={3}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                />
              </div>

              <div>
                <Label htmlFor="hashtags" className="block text-sm font-medium mb-1">
                  Additional Hashtags (comma-separated)
                </Label>
                <Input
                  id="hashtags"
                  value={hashtags}
                  onChange={(e) => setHashtags(e.target.value)}
                  placeholder="#ClimateAction, #Sustainability"
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Default hashtags: #CarbonOffset #ClimateAction #Reforestation #Sustainability
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={true}
                    disabled
                    className="rounded border-input"
                  />
                  <span>Include default hashtags (#CarbonOffset #ClimateAction #Reforestation #Sustainability)</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={true}
                    disabled
                    className="rounded border-input"
                  />
                  <span>Include campaign link</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!sponsorName}
                    disabled
                    className="rounded border-input"
                  />
                  <span>{sponsorName ? `Include sponsor name: ${sponsorName}` : 'Include sponsor name (if available)'}</span>
                </label>
              </div>
            </div>
          )}

        <Separator />

        {/* Embed Code */}
        <div>
          <h4 className="font-medium mb-3">Embed Share Widget</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Copy this HTML to embed a share widget on your website:
          </p>
          <div className="relative">
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-xs max-h-40 overflow-y-auto">
              {widgetHtml}
            </pre>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(widgetHtml);
                alert('Widget HTML copied to clipboard!');
              }}
              className="mt-2"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Widget HTML
            </Button>
          </div>
        </div>

        {/* Preview Section */}
        <Separator />
        <div>
          <h4 className="font-medium mb-3">Preview Posts</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(SOCIAL_PLATFORMS).map(([platform, config]) => {
              const content = campaignSocialSharingService.generateShareContent({
                campaignId,
                campaignName,
                treesPlanted,
                co2Sequestered,
                region,
                projectType,
                campaignUrl: campaignUrl || (typeof window !== 'undefined' ? window.location.href : ''),
                sponsorName,
                customMessage,
                hashtags: hashtags.split(',').map(h => h.trim()).filter(Boolean),
              })[platform as keyof typeof SOCIAL_PLATFORMS];

              if (!content) return null;

              return (
                <div key={platform} className="p-4 bg-muted/50 rounded-lg border border-muted/50">
                  <div className="flex items-center gap-2 mb-2">
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: config.color + '20' }}
                    >
                      <span style={{ fontSize: 16 }}>{platform === 'twitter' ? '𝕏' : platform === 'facebook' ? 'f' : platform === 'linkedin' ? 'in' : platform === 'whatsapp' ? '💬' : '✉️'}</span>
                    </div>
                    <span className="font-medium" style={{ color: config.color }}>{config.label}</span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-3">{content.text}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {content.hashtags.slice(0, 5).map(h => (
                      <span key={h} className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded">{h}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CampaignSocialSharing;