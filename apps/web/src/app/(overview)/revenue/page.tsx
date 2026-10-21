import CreatorRevenueDashboard from "@/components/creator/CreatorRevenueDashboard";

export const metadata = {
  title: "Revenue Dashboard | Fundable",
  description: "Review creator earnings, pending withdrawals, settled funds, and platform fees across every campaign.",
};

export default function RevenuePage() {
  return <main className="min-h-full overflow-y-auto bg-[#101112] px-4 py-8 text-white md:px-8 lg:px-10"><div className="mx-auto max-w-7xl"><CreatorRevenueDashboard /></div></main>;
}
