import { AnalyticsDesk } from "@/components/admin/analytics";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Аналитика. Кромка" };

export default function AdminAnalyticsPage() {
  return (
    <main className="admin">
      <AnalyticsDesk />
    </main>
  );
}
