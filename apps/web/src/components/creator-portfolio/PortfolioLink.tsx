'use client';

import Link from 'next/link';
import { Award } from 'lucide-react';

interface PortfolioLinkProps {
  creatorAddress: string;
  variant?: 'button' | 'link';
}

export function PortfolioLink({ creatorAddress, variant = 'link' }: PortfolioLinkProps) {
  const href = `/creators/${creatorAddress}/portfolio`;

  if (variant === 'button') {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg font-semibold hover:shadow-lg transition-shadow"
      >
        <Award className="w-5 h-5" />
        View Portfolio
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-green-600 hover:text-green-700 font-medium transition-colors"
    >
      <Award className="w-4 h-4" />
      Portfolio
    </Link>
  );
}
