import { BackerBadgeProfile } from "@/components/modules/profile/BackerBadgeProfile";

export const metadata = {
  title: "Backer Profile | Fundable",
  description: "Public backer milestone badges and community recognition.",
};

interface PublicBackerProfilePageProps {
  params: Promise<{ address: string }>;
}

export default async function PublicBackerProfilePage({ params }: PublicBackerProfilePageProps) {
  const { address } = await params;
  return (
    <main className="h-full overflow-y-auto px-4 py-8 md:py-10">
      <div className="max-w-3xl mx-auto space-y-4">
        <header>
          <h1 className="text-2xl font-semibold text-white">Backer profile</h1>
          <p className="mt-1 font-mono text-sm text-zinc-400 break-all">{address}</p>
        </header>
        <BackerBadgeProfile address={address} />
      </div>
    </main>
  );
}
