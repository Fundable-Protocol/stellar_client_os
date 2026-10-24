/**
 * Creator Profile Layout
 * 
 * Provides shared layout for creator pages with navigation between
 * profile, portfolio, and analytics views.
 */

import { ReactNode } from 'react';
import Link from 'next/link';

interface CreatorLayoutProps {
  children: ReactNode;
  params: Promise<{
    address: string;
  }>;
}

export default async function CreatorLayout({
  children,
  params,
}: CreatorLayoutProps) {
  const { address } = await params;

  return (
    <>
      {/* Navigation tabs for creator pages */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex gap-8">
            <Link
              href={`/creators/${address}`}
              className="px-4 py-4 font-medium text-gray-700 hover:text-gray-900 border-b-2 border-transparent hover:border-green-500 transition-colors"
            >
              Profile
            </Link>
            <Link
              href={`/creators/${address}/portfolio`}
              className="px-4 py-4 font-medium text-gray-700 hover:text-gray-900 border-b-2 border-transparent hover:border-green-500 transition-colors"
            >
              Portfolio
            </Link>
            <Link
              href={`/creators/${address}/analytics`}
              className="px-4 py-4 font-medium text-gray-700 hover:text-gray-900 border-b-2 border-transparent hover:border-green-500 transition-colors"
            >
              Analytics
            </Link>
          </div>
        </div>
      </div>

      {/* Page content */}
      {children}
    </>
  );
}