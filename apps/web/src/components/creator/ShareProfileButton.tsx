"use client";

import { useState } from "react";

interface ShareProfileButtonProps {
  address: string;
}

export function ShareProfileButton({ address }: ShareProfileButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const profileUrl = `${window.location.origin}/creators/${address}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Creator Profile",
          text: `Check out this creator's profile on Fundable`,
          url: profileUrl,
        });
      } catch (err) {
        // User cancelled or share failed, fall back to copy
        copyToClipboard(profileUrl);
      }
    } else {
      copyToClipboard(profileUrl);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-md"
    >
      {copied ? (
        <>
          <span>✓</span>
          <span>Copied!</span>
        </>
      ) : (
        <>
          <span>🔗</span>
          <span>Share Profile</span>
        </>
      )}
    </button>
  );
}
