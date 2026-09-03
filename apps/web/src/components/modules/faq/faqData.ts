export interface FaqItem {
  id: string;
  category: "General" | "For Sponsors" | "For Planters" | "Privacy & Verification";
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: "what-is-platform",
    category: "General",
    question: "What does this platform do?",
    answer:
      "Sponsors fund tree-planting and impact campaigns, and planters get paid for verified work over time. Funds move through on-chain payment streams and distributions on Stellar, so both sides can see exactly where the money goes.",
  },
  {
    id: "how-verification-works",
    category: "Privacy & Verification",
    question: "How does verification work?",
    answer:
      "Eligible donors and planters are enrolled into a verification set off-chain, then only a single summary value (a Merkle root) is published on-chain — never the underlying list of participants. To take an action, you prove you belong to that set using a cryptographic inclusion proof, without revealing which entry is yours. A one-time-use marker (a nullifier) is recorded to stop the same enrollment from being used twice, but that marker cannot be traced back to your identity or wallet.",
  },
  {
    id: "donate-anonymously",
    category: "Privacy & Verification",
    question: "Can I donate anonymously?",
    answer:
      "Yes. Anonymous donations use the same verification scheme described above: your eligibility is proven without revealing who you are, and only a nullifier (not your address or identity) is ever recorded on-chain. Your wallet still needs to authorize the transaction, but that authorization is never linked publicly to your donor commitment.",
  },
  {
    id: "withdraw-earnings",
    category: "For Planters",
    question: "How do I withdraw earnings?",
    answer:
      "Earnings arrive through a payment stream that vests gradually over the stream's schedule. Open the Payment Stream page to see what's currently claimable and withdraw it to your connected wallet. From there, use the Offramp page if you'd like to convert your tokens to fiat through a supported provider.",
  },
  {
    id: "stream-vesting",
    category: "For Planters",
    question: "Why can't I withdraw the full amount right away?",
    answer:
      "Streams release funds gradually between a start and end time rather than all at once, so the claimable amount grows over time. You can check exactly how much is currently claimable at any point from the Payment Stream page before you withdraw.",
  },
  {
    id: "cancel-sponsorship",
    category: "For Sponsors",
    question: "Can I cancel a sponsorship or stream I've funded?",
    answer:
      "Yes, a stream's sender can cancel it before it completes. Any amount already vested up to that point is paid out to the recipient, and the remaining, unvested balance is refunded back to you.",
  },
  {
    id: "distribution-vs-stream",
    category: "For Sponsors",
    question: "What's the difference between a distribution and a payment stream?",
    answer:
      "A distribution sends tokens to one or more recipients immediately, split equally or by custom weighted amounts. A payment stream instead releases a fixed total to a single recipient gradually over a start and end time. Use the Distribution page for one-off payouts and the Payment Stream page for ongoing sponsorships.",
  },
  {
    id: "track-history",
    category: "General",
    question: "Where can I see my past streams and distributions?",
    answer:
      "The History page lists every stream and distribution tied to your connected wallet, with filters by type and token so you can find a specific transaction quickly.",
  },
  {
    id: "offramp-tokens",
    category: "For Planters",
    question: "Which tokens can I convert to fiat?",
    answer:
      "The Offramp page currently supports converting USDC, USDT, and EURC. It shows a live quote — exchange rate, fees, and estimated amount received — before you confirm, and you can compare providers if more than one is available.",
  },
  {
    id: "verification-fails",
    category: "Privacy & Verification",
    question: "What happens if my verification proof is rejected?",
    answer:
      "If your proof doesn't match the current published verification root, or your enrollment has already been used, the action is rejected and no funds move. Double-check you're using the correct, current enrollment details; if the problem continues, reach out through the Help page so it can be looked into.",
  },
  {
    id: "wallet-required",
    category: "General",
    question: "Do I need a wallet to use the platform?",
    answer:
      "Yes. Every action that moves funds or claims earnings needs your wallet's authorization, so you'll need a supported Stellar wallet connected before sponsoring a campaign, claiming a stream, or verifying eligibility.",
  },
];
