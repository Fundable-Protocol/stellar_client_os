import { CreatorProfile } from "@/components/modules/profile/CreatorProfile";

export const metadata = {
  title: "Creator Profile | Fundable",
  description:
    "View a campaign creator's profile showcasing all created campaigns, total trees planted, total sponsors, and total CO2 sequestered.",
};

export default function ProfilePage() {
  return (
    <main className="h-full overflow-y-auto px-4 py-8 md:py-10">
      <CreatorProfile />
    </main>
  );
}
