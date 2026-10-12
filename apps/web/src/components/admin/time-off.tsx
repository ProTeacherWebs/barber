"use client";

import { AdminFrame } from "@/components/admin/frame";
import { AdminError, adminFetch, visitLabel } from "@/lib/admin-api";
import { useEffect, useState } from "react";

type Item = {
  id: string;
  barberId: string | null;
  barberName: string;
  startsAt: string;
  endsAt: string;
  type: string;
  note: string;
};

const types = [
  ["vacation", "Отпуск"],
  ["sick", "Болезнь"],
  ["closed", "Закрыто"],
  ["exception", "Исключение"],
] as const;

export function TimeOffDesk() {
  const [items, setItems] = useState<Item[]>([]);
  const [barbers, setBarbers] = useState<Array<{ id: string; name: string }>>([]);
  const [barberId, setBarberId] = useState("");
  const [type, setType] = useState<(typeof types)[number][0]>("closed");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const body = await adminFetch<{ items: Item[] }>("/api/v1/admin/time-off");
    setItems(body.items);
  }

  useEffect(() => {
    let cancel = false;
    adminFetch<{ items: Item[] }>("/api/v1/admin/time-off")
      .then((body) => {
        if (!cancel) setItems(body.items);
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Ошибка");
      });
    adminFetch<{ barbers: Array<{ id: string; name: string }> }>("/api/v1/admin/barbers").then((body) => {
      if (!cancel) setBarbers(body.barbers);
    });
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <AdminFrame>
      <h1>Выходные и исключения</h1>
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-table">
        {items.map((item) => (
          <article key={item.id}>
            <strong>{item.barberName}</strong>
            <span>{types.find((entry) => entry[0] === item.type)?.[1] ?? item.type}</span>
            <span>{visitLabel(item.startsAt)} - {visitLabel(item.endsAt)}</span>
            <span>{item.note}</span>
            <button type="button" onClick={() => void adminFetch(`/api/v1/admin/time-off/${item.id}`, { method: "DELETE" }).then(load)}>
              Удалить
            </button>
          </article>
        ))}
      </div>
      <form
        className="admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          void adminFetch("/api/v1/admin/time-off", {
            method: "POST",
            body: JSON.stringify({
              barberId: barberId || null,
              type,
              startsAt: new Date(startsAt).toISOString(),
              endsAt: new Date(endsAt).toISOString(),
              note,
            }),
          })
            .then(load)
            .catch((reason: unknown) => setError(reason instanceof AdminError ? reason.message : "Не удалось сохранить"));
        }}
      >
        <h2>Новое исключение</h2>
        <select value={barberId} onChange={(event) => setBarberId(event.target.value)}>
          <option value="">Весь барбершоп</option>
          {barbers.map((barber) => (
            <option key={barber.id} value={barber.id}>{barber.name}</option>
          ))}
        </select>
        <select value={type} onChange={(event) => setType(event.target.value as (typeof types)[number][0])}>
          {types.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
        <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Заметка" />
        <button type="submit">Добавить</button>
      </form>
    </AdminFrame>
  );
}
