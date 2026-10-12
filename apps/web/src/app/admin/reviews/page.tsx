import { ReviewsDesk } from "@/components/admin/reviews";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Отзывы. Кромка" };

export default function AdminReviewsPage() {
  return (
    <main className="admin">
      <ReviewsDesk />
    </main>
  );
}
