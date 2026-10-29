import { Metadata } from "next";
import { EditorialStaffPicksAdmin } from "@/components/modules/campaign/EditorialStaffPicksAdmin";

export const metadata: Metadata = {
  title: "Editorial Staff Picks Admin | Fundable Protocol",
  description: "Curate and manage platform Staff Picks featured on browse and home pages.",
};

export default function EditorialStaffPicksPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <EditorialStaffPicksAdmin />
    </div>
  );
}
