'use client';

import { SocialLink } from '@/types/creator-portfolio';
import { ExternalLink } from 'lucide-react';

interface SocialLinksProps {
  links: SocialLink[];
}

const SOCIAL_ICONS: Record<SocialLink['platform'], string> = {
  twitter: '𝕏',
  instagram: '📷',
  facebook: '👤',
  linkedin: '💼',
  website: '🌐',
  github: '💻',
};

const SOCIAL_COLORS: Record<SocialLink['platform'], string> = {
  twitter: 'hover:text-black',
  instagram: 'hover:text-pink-600',
  facebook: 'hover:text-blue-600',
  linkedin: 'hover:text-blue-700',
  website: 'hover:text-blue-500',
  github: 'hover:text-gray-800',
};

export function SocialLinks({ links }: SocialLinksProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {links.map((link, idx) => (
        <a
          key={idx}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-gray-200 text-gray-700 text-sm font-medium transition-colors ${SOCIAL_COLORS[link.platform]}`}
          title={`${link.platform}${link.username ? ': ' + link.username : ''}`}
        >
          <span className="text-lg">{SOCIAL_ICONS[link.platform]}</span>
          {link.username && <span>{link.username}</span>}
          <ExternalLink className="w-3 h-3" />
        </a>
      ))}
    </div>
  );
}
