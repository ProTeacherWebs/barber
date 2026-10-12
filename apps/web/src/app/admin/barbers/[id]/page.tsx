import { BarberEdit } from "@/components/admin/barber-edit";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Барбер. Кромка" };

export default async function AdminBarberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="admin">
      <BarberEdit id={id} />
    </main>
  );
}
