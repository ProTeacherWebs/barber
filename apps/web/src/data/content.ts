/** Тексты и кадры лендинга. Услуги и барберы приходят из API. */

export const shop = {
  name: "Кромка",
  city: "Ташкент",
  address: "улица Амира Темура, 108",
  phone: "+998 71 200 19 30",
  phoneHref: "tel:+998712001930",
  hours: "Ежедневно, 10:00-21:00",
  instagram: "https://instagram.com/kromka.tashkent",
  instagramLabel: "@kromka.tashkent",
  telegram: "https://t.me/kromka_tashkent",
  telegramLabel: "@kromka_tashkent",
  mapLink:
    "https://www.openstreetmap.org/?mlat=41.3111&mlon=69.2797#map=17/41.3111/69.2797",
} as const;

export type Review = {
  id: string;
  quote: string;
  attribution: string;
};

export const reviews: Review[] = [
  {
    id: "rustam",
    quote: "Лучшее место, где мне стригли бороду в Ташкенте. Ничего лишнего.",
    attribution: "Рустам, клиент",
  },
  {
    id: "jasur",
    quote: "Пришёл со словами «короче». Ушёл с формой, которую не пришлось поправлять вечером.",
    attribution: "Жасур, клиент",
  },
  {
    id: "bekzod",
    quote: "Бритьё заняло сорок минут. Кожа после полотенца спокойная.",
    attribution: "Бекзод, клиент",
  },
];

export const frames = [
  {
    id: "room",
    src: "/images/room.jpg",
    alt: "Кресла и тёплый свет в зале",
    caption: "Зал",
  },
  {
    id: "cut",
    src: "/images/cut.jpg",
    alt: "Бритьё бороды",
    caption: "Бритьё",
  },
  {
    id: "still",
    src: "/images/still.jpg",
    alt: "Инструменты на камне",
    caption: "Инструменты",
  },
  {
    id: "detail",
    src: "/images/detail.jpg",
    alt: "Контур стрижки",
    caption: "Контур",
  },
] as const;

export function formatPrice(price: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(price)} сум`;
}

export function formatDuration(minutes: number): string {
  return `${minutes} мин`;
}
