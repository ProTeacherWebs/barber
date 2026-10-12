import { TimeOffDesk } from "@/components/admin/time-off";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Исключения. Кромка" };

export default function AdminTimeOffPage() {
  return (
    <main className="admin">
      <TimeOffDesk />
    </main>
  );
}
