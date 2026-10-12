"use client";

import { AdminFrame } from "@/components/admin/frame";
import { AdminError, adminFetch } from "@/lib/admin-api";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type Barber = {
  id: string;
  name: string;
  bio: string;
  experienceYears: number;
  photoUrl: string;
  isActive: boolean;
  sortOrder: number;
};

export function BarbersDesk() {
  const [rows, setRows] = useState<Barber[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const body = await adminFetch<{ barbers: Barber[] }>("/api/v1/admin/barbers");
    setRows(body.barbers);
  }

  useEffect(() => {
    let cancel = false;
    adminFetch<{ barbers: Barber[] }>("/api/v1/admin/barbers")
      .then((body) => {
        if (!cancel) setRows(body.barbers);
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Ошибка");
      });
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <AdminFrame>
      <h1>Барберы</h1>
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-table">
        {rows.map((row) => (
          <article key={row.id}>
            <Image src={row.photoUrl} alt="" width={72} height={88} unoptimized />
            <Link href={`/admin/barbers/${row.id}`}>{row.name}</Link>
            <span>{row.isActive ? "На сайте" : "Скрыт"}</span>
          </article>
        ))}
      </div>
      <form
        className="admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          void adminFetch("/api/v1/admin/barbers", { method: "POST", body: JSON.stringify({ name }) })
            .then(() => {
              setName("");
              return load();
            })
            .catch((reason: unknown) => setError(reason instanceof AdminError ? reason.message : "Не удалось добавить"));
        }}
      >
        <h2>Новый барбер</h2>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Имя" />
        <button type="submit">Добавить</button>
      </form>
    </AdminFrame>
  );
}
