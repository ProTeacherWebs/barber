"use client";

import { AdminFrame } from "@/components/admin/frame";
import { AdminError, adminFetch } from "@/lib/admin-api";
import Image from "next/image";
import { useEffect, useState } from "react";

type Detail = {
  id: string;
  name: string;
  bio: string;
  experienceYears: number;
  photoUrl: string;
  isActive: boolean;
  sortOrder: number;
  services: Array<{ serviceId: string; isEnabled: boolean }>;
  portfolio: Array<{ id: string; imageUrl: string }>;
};

type Service = { id: string; name: string };

export function BarberEdit({ id }: { id: string }) {
  const [barber, setBarber] = useState<Detail | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const [detail, catalog] = await Promise.all([
      adminFetch<{ barber: Detail }>(`/api/v1/admin/barbers/${id}`),
      adminFetch<{ services: Service[] }>("/api/v1/admin/services"),
    ]);
    setBarber(detail.barber);
    setServices(catalog.services);
  }

  useEffect(() => {
    let cancel = false;
    Promise.all([
      adminFetch<{ barber: Detail }>(`/api/v1/admin/barbers/${id}`),
      adminFetch<{ services: Service[] }>("/api/v1/admin/services"),
    ])
      .then(([detail, catalog]) => {
        if (cancel) return;
        setBarber(detail.barber);
        setServices(catalog.services);
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Ошибка");
      });
    return () => {
      cancel = true;
    };
  }, [id]);

  async function upload(file: File) {
    const body = new FormData();
    body.set("file", file);
    const saved = await adminFetch<{ url: string }>("/api/v1/admin/uploads", { method: "POST", body });
    return saved.url;
  }

  if (!barber) {
    return (
      <AdminFrame>
        <p className="admin-note">{error || "Загружаем барбера"}</p>
      </AdminFrame>
    );
  }

  const enabled = new Set(barber.services.filter((item) => item.isEnabled).map((item) => item.serviceId));

  return (
    <AdminFrame>
      <h1>{barber.name}</h1>
      {error ? <p className="admin-error">{error}</p> : null}
      <form
        className="admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          void adminFetch(`/api/v1/admin/barbers/${id}`, {
            method: "PATCH",
            body: JSON.stringify({
              name: barber.name,
              bio: barber.bio,
              experienceYears: barber.experienceYears,
              photoUrl: barber.photoUrl,
              isActive: barber.isActive,
              sortOrder: barber.sortOrder,
              serviceIds: [...enabled],
            }),
          })
            .then(load)
            .catch((reason: unknown) => setError(reason instanceof AdminError ? reason.message : "Не удалось сохранить"));
        }}
      >
        <input value={barber.name} onChange={(event) => setBarber({ ...barber, name: event.target.value })} />
        <textarea value={barber.bio} onChange={(event) => setBarber({ ...barber, bio: event.target.value })} />
        <input type="number" value={barber.experienceYears} onChange={(event) => setBarber({ ...barber, experienceYears: Number(event.target.value) })} />
        <label>
          <input type="checkbox" checked={barber.isActive} onChange={(event) => setBarber({ ...barber, isActive: event.target.checked })} />
          Показывать на сайте
        </label>
        <Image src={barber.photoUrl} alt="" width={120} height={150} unoptimized />
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void upload(file)
              .then((url) => setBarber({ ...barber, photoUrl: url }))
              .catch((reason: unknown) => setError(reason instanceof AdminError ? reason.message : "Фото не загрузилось"));
          }}
        />
        <fieldset>
          <legend>Услуги</legend>
          {services.map((service) => (
            <label key={service.id}>
              <input
                type="checkbox"
                checked={enabled.has(service.id)}
                onChange={(event) => {
                  const next = barber.services.filter((item) => item.serviceId !== service.id);
                  if (event.target.checked) next.push({ serviceId: service.id, isEnabled: true });
                  setBarber({ ...barber, services: next });
                }}
              />
              {service.name}
            </label>
          ))}
        </fieldset>
        <button type="submit">Сохранить</button>
        <button
          type="button"
          onClick={() => void adminFetch(`/api/v1/admin/barbers/${id}`, { method: "DELETE" }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Ошибка"))}
        >
          Удалить
        </button>
      </form>
      <section>
        <h2>Портфолио</h2>
        <div className="admin-photos">
          {barber.portfolio.map((item) => (
            <figure key={item.id}>
              <Image src={item.imageUrl} alt="" width={140} height={180} unoptimized />
              <button type="button" onClick={() => void adminFetch(`/api/v1/admin/portfolio/${item.id}`, { method: "DELETE" }).then(load)}>
                Убрать
              </button>
            </figure>
          ))}
        </div>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void upload(file)
              .then((imageUrl) => adminFetch(`/api/v1/admin/barbers/${id}/portfolio`, { method: "POST", body: JSON.stringify({ imageUrl }) }))
              .then(load)
              .catch((reason: unknown) => setError(reason instanceof AdminError ? reason.message : "Фото не загрузилось"));
          }}
        />
      </section>
    </AdminFrame>
  );
}
