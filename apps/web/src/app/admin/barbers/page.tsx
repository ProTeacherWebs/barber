import { BarbersDesk } from "@/components/admin/barbers";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Барберы. Кромка" };

export default function AdminBarbersPage() {
  return (
    <main className="admin">
      <BarbersDesk />
    </main>
  );
}
