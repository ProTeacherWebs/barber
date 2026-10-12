import { ScheduleDesk } from "@/components/admin/schedule";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "График. Кромка" };

export default function AdminSchedulePage() {
  return (
    <main className="admin">
      <ScheduleDesk />
    </main>
  );
}
