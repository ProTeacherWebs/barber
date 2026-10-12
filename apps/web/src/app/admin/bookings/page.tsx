import { BookingsDesk } from "@/components/admin/bookings";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Записи. Кромка" };

export default function AdminBookingsPage() {
  return (
    <main className="admin">
      <BookingsDesk span="range" />
    </main>
  );
}
