import { Atmosphere } from "@/components/atmosphere";
import { Finale } from "@/components/finale";
import { Hero } from "@/components/hero";
import { Masters } from "@/components/masters";
import { Nav } from "@/components/nav";
import { Philosophy } from "@/components/philosophy";
import { Reviews } from "@/components/reviews";
import { Services } from "@/components/services";
import { SiteFooter } from "@/components/site-footer";
import { Tashkent } from "@/components/tashkent";
import { loadCatalog } from "@/lib/catalog";

export default async function HomePage() {
  const catalog = await loadCatalog();

  return (
    <>
      <Nav />
      <main id="content">
        <div id="top" className="scroll-sentinel" />
        <Hero />
        <Philosophy />
        <Services services={catalog.services} error={catalog.error} />
        <Masters barbers={catalog.barbers} error={catalog.error} />
        <Atmosphere />
        <Tashkent />
        <Reviews />
        <Finale />
      </main>
      <SiteFooter />
    </>
  );
}
