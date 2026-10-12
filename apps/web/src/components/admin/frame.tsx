"use client";

import { adminFetch } from "@/lib/admin-api";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const links = [
  ["/admin", "Сегодня"],
  ["/admin/bookings", "Записи"],
  ["/admin/barbers", "Барберы"],
  ["/admin/services", "Услуги"],
  ["/admin/schedule", "График"],
  ["/admin/time-off", "Исключения"],
  ["/admin/reviews", "Отзывы"],
  ["/admin/analytics", "Аналитика"],
  ["/admin/settings", "Настройки"],
];

export function AdminFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [login, setLogin] = useState("");

  useEffect(() => {
    adminFetch<{ admin: { login: string } }>("/api/v1/admin/me")
      .then((body) => setLogin(body.admin.login))
      .catch(() => router.replace("/admin/login"));
  }, [router]);

  async function logout() {
    await adminFetch("/api/v1/admin/logout", { method: "POST" });
    router.replace("/admin/login");
  }

  if (!login) return <p className="admin-note">Проверяем сессию</p>;

  return (
    <div className="admin-shell">
      <header className="admin-bar">
        <Link href="/admin">Кромка</Link>
        <nav>
          {links.map(([href, label]) => (
            <Link key={href} href={href} data-current={pathname === href ? "true" : "false"}>
              {label}
            </Link>
          ))}
        </nav>
        <button type="button" onClick={() => void logout()}>
          Выйти
        </button>
      </header>
      {children}
    </div>
  );
}
