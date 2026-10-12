import { SettingsDesk } from "@/components/admin/settings";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Настройки. Кромка" };

export default function AdminSettingsPage() {
  return (
    <main className="admin">
      <SettingsDesk />
    </main>
  );
}
