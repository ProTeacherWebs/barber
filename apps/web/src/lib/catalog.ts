export type Service = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
  image: string;
  imageAlt: string;
};

export type Barber = {
  id: string;
  name: string;
  role: string;
  experienceYears: number;
  image: string;
  alt: string;
};

type ApiService = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
};

type ApiBarber = {
  id: string;
  name: string;
  bio: string;
  experienceYears: number;
  photoUrl: string;
};

const servicePhotos: Record<string, { image: string; imageAlt: string }> = {
  "Мужская стрижка": {
    image: "/images/cut.jpg",
    imageAlt: "Бритьё бороды в полутёмном зале",
  },
  "Стрижка машинкой": {
    image: "/images/detail.jpg",
    imageAlt: "Мастер выводит контур машинкой",
  },
  Борода: {
    image: "/images/hero.jpg",
    imageAlt: "Руки мастера над короткой стрижкой",
  },
  "Бритьё": {
    image: "/images/still.jpg",
    imageAlt: "Ножницы, расчёска и машинки на тёмном камне",
  },
  "Стрижка и борода": {
    image: "/images/room.jpg",
    imageAlt: "Три кресла в зале барбершопа",
  },
  "Детская стрижка": {
    image: "/images/detail.jpg",
    imageAlt: "Мастер выводит контур машинкой",
  },
};

const fallbackPhoto = {
  image: "/images/room.jpg",
  imageAlt: "Зал барбершопа",
};

export function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3011";
  return `${base}${path}`;
}

async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path), { cache: "no-store" });
  if (!response.ok) throw new Error(`API ${path} ответил ${response.status}`);
  return (await response.json()) as T;
}

export async function getServices(): Promise<Service[]> {
  const body = await readJson<{ services: ApiService[] }>("/api/v1/services");
  return body.services.map((service) => ({
    ...service,
    ...(servicePhotos[service.name] ?? fallbackPhoto),
  }));
}

export async function getBarbers(): Promise<Barber[]> {
  const body = await readJson<{ barbers: ApiBarber[] }>("/api/v1/barbers");
  return body.barbers.map((barber) => ({
    id: barber.id,
    name: barber.name,
    role: barber.bio,
    experienceYears: barber.experienceYears,
    image: barber.photoUrl,
    alt: `Портрет ${barber.name}`,
  }));
}

export async function loadCatalog(): Promise<{
  services: Service[];
  barbers: Barber[];
  error: boolean;
}> {
  try {
    const [services, barbers] = await Promise.all([getServices(), getBarbers()]);
    return { services, barbers, error: false };
  } catch {
    return { services: [], barbers: [], error: true };
  }
}
