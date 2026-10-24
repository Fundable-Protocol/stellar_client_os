import { CreatorVerificationWizard } from "@/components/creator/CreatorVerificationWizard";

interface CreatorVerificationPageProps {
  params: Promise<{ address: string }>;
}

export async function generateMetadata({ params }: CreatorVerificationPageProps) {
  const { address } = await params;
  return {
    title: `Identity verification - ${address.slice(0, 8)}... | Fundable`,
    description: "Optionally verify your email, phone number and government ID to earn the Verified Creator badge.",
  };
}

/** Optional creator identity verification wizard (email, phone, government ID). */
export default async function CreatorVerificationPage({ params }: CreatorVerificationPageProps) {
  const { address } = await params;
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <CreatorVerificationWizard address={decodeURIComponent(address)} />
      </div>
    </div>
  );
}
