import type { ReactNode } from "react";
import { SettingsNav } from "./SettingsNav";
import { TwoFactorGate } from "./security/TwoFactorGate";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto px-4 pt-8 md:pt-10">
      <SettingsNav />
      <TwoFactorGate>{children}</TwoFactorGate>
    </div>
  );
}
