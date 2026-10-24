import CustomDomainWizard from "@/components/creator/CustomDomainWizard";

export const metadata = { title: "Custom Domain | Fundable", description: "Connect a branded campaign domain with managed SSL and canonical URLs." };

export default function DomainSettingsPage() {
  return <main className="min-h-full overflow-y-auto bg-[#101112] px-4 py-8 text-white md:px-8 lg:px-10"><CustomDomainWizard /></main>;
}
