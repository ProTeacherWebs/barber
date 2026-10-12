"use client";

import { AdminFrame } from "@/components/admin/frame";
import { AdminError, adminFetch, money } from "@/lib/admin-api";
import { useEffect, useState } from "react";

type Service = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
  isActive: boolean;
  sortOrder: number;
};

const empty = { name: "", description: "", durationMin: 45, price: 150000, isActive: true, sortOrder: 0 };

export function ServicesDesk() {
  const [rows, setRows] = useState<Service[]>([]);
  const [draft, setDraft] = useState(empty);
  const [error, setError] = useState("");

  async function load() {
    const body = await adminFetch<{ services: Service[] }>("/api/v1/admin/services");
    setRows(body.services);
  }

  useEffect(() => {
    let cancel = false;
    adminFetch<{ services: Service[] }>("/api/v1/admin/services")
      .then((body) => {
        if (!cancel) setRows(body.services);
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Ошибка");
      });
    return () => {
      cancel = true;
    };
  }, []);

  async function save(service: Partial<Service> & { id?: string }) {
    setError("");
    try {
      if (service.id) {
        await adminFetch(`/api/v1/admin/services/${service.id}`, { method: "PATCH", body: JSON.stringify(service) });
      } else {
        await adminFetch("/api/v1/admin/services", { method: "POST", body: JSON.stringify(service) });
        setDraft(empty);
      }
      await load();
    } catch (reason) {
      setError(reason instanceof AdminError ? reason.message : "Не удалось сохранить услугу");
    }
  }

  return (
    <AdminFrame>
      <h1>Услуги</h1>
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-table">
        {rows.map((row) => (
          <article key={row.id}>
            <input value={row.name} onChange={(event) => setRows(rows.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item))} />
            <input value={row.description} onChange={(event) => setRows(rows.map((item) => item.id === row.id ? { ...item, description: event.target.value } : item))} />
            <input type="number" value={row.durationMin} onChange={(event) => setRows(rows.map((item) => item.id === row.id ? { ...item, durationMin: Number(event.target.value) } : item))} />
            <input type="number" value={row.price} onChange={(event) => setRows(rows.map((item) => item.id === row.id ? { ...item, price: Number(event.target.value) } : item))} />
            <span>{money(row.price)}</span>
            <label>
              <input type="checkbox" checked={row.isActive} onChange={(event) => setRows(rows.map((item) => item.id === row.id ? { ...item, isActive: event.target.checked } : item))} />
              На сайте
            </label>
            <button type="button" onClick={() => void save(row)}>Сохранить</button>
            <button type="button" onClick={() => void adminFetch(`/api/v1/admin/services/${row.id}`, { method: "DELETE" }).then(load).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Ошибка"))}>
              Удалить
            </button>
          </article>
        ))}
      </div>
      <form className="admin-form" onSubmit={(event) => { event.preventDefault(); void save(draft); }}>
        <h2>Новая услуга</h2>
        <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Название" />
        <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Описание" />
        <input type="number" value={draft.durationMin} onChange={(event) => setDraft({ ...draft, durationMin: Number(event.target.value) })} />
        <input type="number" value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} />
        <button type="submit">Добавить</button>
      </form>
    </AdminFrame>
  );
}
