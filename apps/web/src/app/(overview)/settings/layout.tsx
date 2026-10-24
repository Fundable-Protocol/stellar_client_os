import type { ReactNode } from "react";
import { SettingsNav } from "./SettingsNav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto px-4 pt-8 md:pt-10">
      <SettingsNav />
      {children}
    </div>
  );
}
