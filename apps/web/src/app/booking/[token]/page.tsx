import { ManageBooking } from "@/components/book/manage-booking";
import { Nav } from "@/components/nav";
import { BookingError, fetchBooking } from "@/lib/booking";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Запись. Кромка",
  description: "Просмотр, перенос и отмена записи в барбершоп Кромка.",
};

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let booking = null;
  try {
    booking = await fetchBooking(token);
  } catch (error) {
    if (error instanceof BookingError && error.code === "NOT_FOUND") notFound();
    return (
      <>
        <Nav />
        <main id="content">
          <p className="catalog-status">Не удалось загрузить запись.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main id="content">
        <ManageBooking token={token} initial={booking} />
      </main>
    </>
  );
}
