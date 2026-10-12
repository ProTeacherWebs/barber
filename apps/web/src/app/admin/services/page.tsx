import { ServicesDesk } from "@/components/admin/services";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Услуги. Кромка" };

export default function AdminServicesPage() {
  return (
    <main className="admin">
      <ServicesDesk />
    </main>
  );
}
