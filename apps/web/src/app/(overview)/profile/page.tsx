import { PlanterProfile } from "@/components/modules/profile/PlanterProfile";

export const metadata = {
  title: "Planter Profile & Referral Rewards | Fundable",
  description:
    "View your planter profile, manage your embedded referral link, and earn 5 XLM bonus for every new sponsor onboarded to Fundable.",
};

export default function ProfilePage() {
  return (
    <main className="h-full overflow-y-auto px-4 py-8 md:py-10">
      <PlanterProfile />
    </main>
  );
}
