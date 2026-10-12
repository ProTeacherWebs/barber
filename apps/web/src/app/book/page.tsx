import { BookFlow } from "@/components/book/book-flow";
import { Nav } from "@/components/nav";
import { loadCatalog } from "@/lib/catalog";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Запись. Кромка",
  description: "Запись в барбершоп Кромка: услуга, мастер, дата и время.",
};

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const [params, catalog] = await Promise.all([searchParams, loadCatalog()]);
  return (
    <>
      <Nav />
      <main id="content">
        <BookFlow
          services={catalog.services}
          barbers={catalog.barbers}
          catalogError={catalog.error}
          initialServiceId={params.service}
        />
      </main>
    </>
  );
}
