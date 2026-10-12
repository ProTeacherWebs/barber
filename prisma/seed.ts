import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const services = [
  {
    id: "11111111-1111-4111-8111-111111111101",
    name: "Мужская стрижка",
    description: "Ножницы, машинка и форма, которая держится до следующего визита.",
    durationMin: 45,
    price: 120_000,
    sortOrder: 1,
  },
  {
    id: "11111111-1111-4111-8111-111111111102",
    name: "Стрижка машинкой",
    description: "Одна длина или мягкий переход. Короче обычной стрижки.",
    durationMin: 30,
    price: 70_000,
    sortOrder: 2,
  },
  {
    id: "11111111-1111-4111-8111-111111111103",
    name: "Борода",
    description: "Линия, плотность и кожа под бородой.",
    durationMin: 30,
    price: 80_000,
    sortOrder: 3,
  },
  {
    id: "11111111-1111-4111-8111-111111111104",
    name: "Бритьё",
    description: "Горячее полотенце, опасная бритва, холодный компресс.",
    durationMin: 40,
    price: 90_000,
    sortOrder: 4,
  },
  {
    id: "11111111-1111-4111-8111-111111111105",
    name: "Стрижка и борода",
    description: "Оба пункта за один визит, без паузы между ними.",
    durationMin: 75,
    price: 180_000,
    sortOrder: 5,
  },
  {
    id: "11111111-1111-4111-8111-111111111106",
    name: "Детская стрижка",
    description: "Для мальчиков до 12 лет. Можно прийти с родителем.",
    durationMin: 30,
    price: 90_000,
    sortOrder: 6,
  },
] as const;

const barbers = [
  {
    id: "22222222-2222-4222-8222-222222222201",
    name: "Азиз Каримов",
    bio: "Старший барбер",
    experienceYears: 8,
    photoUrl: "/images/master-1.jpg",
    sortOrder: 1,
  },
  {
    id: "22222222-2222-4222-8222-222222222202",
    name: "Тимур Юсупов",
    bio: "Барбер",
    experienceYears: 5,
    photoUrl: "/images/master-2.jpg",
    sortOrder: 2,
  },
  {
    id: "22222222-2222-4222-8222-222222222203",
    name: "Шерзод Алиев",
    bio: "Мастер",
    experienceYears: 11,
    photoUrl: "/images/master-3.jpg",
    sortOrder: 3,
  },
  {
    id: "22222222-2222-4222-8222-222222222204",
    name: "Бехруз Рахимов",
    bio: "Барбер",
    experienceYears: 6,
    photoUrl: "/images/master-4.jpg",
    sortOrder: 4,
  },
  {
    id: "22222222-2222-4222-8222-222222222205",
    name: "Жахонгир Саидов",
    bio: "Мастер",
    experienceYears: 9,
    photoUrl: "/images/master-5.jpg",
    sortOrder: 5,
  },
  {
    id: "22222222-2222-4222-8222-222222222206",
    name: "Сардор Нурматов",
    bio: "Барбер",
    experienceYears: 7,
    photoUrl: "/images/master-6.jpg",
    sortOrder: 6,
  },
] as const;

const settings = [
  ["cancel_cutoff_min", "30"],
  ["slot_step_min", "15"],
  ["booking_horizon_days", "30"],
  ["min_notice_min", "30"],
  ["reminder_day_minutes", "1440"],
  ["reminder_short_minutes", "30"],
  ["review_delay_min", "60"],
  ["timezone", "Asia/Tashkent"],
  ["review_public_min_rating", "4"],
] as const;

function clock(hours: number, minutes = 0): Date {
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0));
}

async function main() {
  for (const service of services) {
    await prisma.service.upsert({
      where: { id: service.id },
      update: service,
      create: service,
    });
  }

  for (const barber of barbers) {
    await prisma.barber.upsert({
      where: { id: barber.id },
      update: barber,
      create: barber,
    });
  }

  await prisma.barberService.createMany({
    data: barbers.flatMap((barber) =>
      services.map((service) => ({
        barberId: barber.id,
        serviceId: service.id,
        isEnabled: true,
      })),
    ),
    skipDuplicates: true,
  });

  const open = clock(10, 0);
  const close = clock(21, 0);
  const breakStart = clock(13, 0);
  const breakEnd = clock(14, 0);

  await prisma.workingHour.createMany({
    data: barbers.flatMap((barber) =>
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        barberId: barber.id,
        weekday,
        startTime: open,
        endTime: close,
      })),
    ),
    skipDuplicates: true,
  });

  await prisma.break.createMany({
    data: barbers.flatMap((barber) =>
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        barberId: barber.id,
        weekday,
        startTime: breakStart,
        endTime: breakEnd,
      })),
    ),
    skipDuplicates: true,
  });

  for (const [key, value] of settings) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  const passwordHash = await hash("kromka-admin");
  await prisma.adminUser.upsert({
    where: { login: "admin" },
    update: { passwordHash },
    create: { login: "admin", passwordHash },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    return prisma.$disconnect().then(() => {
      throw error;
    });
  });
