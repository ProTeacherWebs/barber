import { BookingsDesk } from "@/components/admin/bookings";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Сегодня. Кромка" };

export default function AdminTodayPage() {
  return (
    <main className="admin">
      <BookingsDesk span="today" />
    </main>
  );
}
