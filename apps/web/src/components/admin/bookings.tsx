"use client";

import { AdminFrame } from "@/components/admin/frame";
import { AdminError, adminFetch, money, tashkentDay, visitLabel } from "@/lib/admin-api";
import { useEffect, useState } from "react";

type Booking = {
  id: string;
  status: string;
  startsAt: string;
  totalPrice: number;
  client: { name: string; phone: string };
  barber: { id: string; name: string };
  services: string[];
};

const statusLabel: Record<string, string> = {
  confirmed: "Подтверждена",
  completed: "Завершена",
  cancelled: "Отменена",
  no_show: "Не пришёл",
};

export function BookingsDesk({ span }: { span: "today" | "range" }) {
  const today = tashkentDay();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<Booking[]>([]);
  const [services, setServices] = useState<Array<{ id: string; name: string }>>([]);
  const [barbers, setBarbers] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [barberId, setBarberId] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("10:00");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+998");

  async function load(nextFrom = from, nextTo = to) {
    const query = span === "today" ? `from=${today}&to=${today}` : `from=${nextFrom}&to=${nextTo}`;
    const body = await adminFetch<{ bookings: Booking[] }>(`/api/v1/admin/bookings?${query}`);
    setRows(body.bookings);
  }

  useEffect(() => {
    let cancel = false;
    const query = `from=${today}&to=${today}`;
    adminFetch<{ bookings: Booking[] }>(`/api/v1/admin/bookings?${query}`)
      .then((body) => {
        if (!cancel) setRows(body.bookings);
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Ошибка");
      });
    adminFetch<{ services: Array<{ id: string; name: string }> }>("/api/v1/admin/services").then((body) => {
      if (cancel) return;
      setServices(body.services);
      setServiceId(body.services[0]?.id ?? "");
    });
    adminFetch<{ barbers: Array<{ id: string; name: string }> }>("/api/v1/admin/barbers").then((body) => {
      if (cancel) return;
      setBarbers(body.barbers);
      setBarberId(body.barbers[0]?.id ?? "");
    });
    return () => {
      cancel = true;
    };
  }, [span, today]);

  async function createVisit() {
    setError("");
    try {
      await adminFetch("/api/v1/admin/bookings", {
        method: "POST",
        body: JSON.stringify({
          serviceIds: [serviceId],
          barberId,
          startsAt: new Date(`${date}T${time}:00+05:00`).toISOString(),
          name,
          phone,
        }),
      });
      setName("");
      await load();
    } catch (reason) {
      setError(reason instanceof AdminError ? reason.message : "Не удалось создать запись");
    }
  }

  async function patch(id: string, body: { status?: string; startsAt?: string }) {
    setError("");
    try {
      await adminFetch(`/api/v1/admin/bookings/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      await load();
    } catch (reason) {
      setError(reason instanceof AdminError ? reason.message : "Не удалось изменить запись");
    }
  }

  return (
    <AdminFrame>
      <h1>{span === "today" ? "Сегодня" : "Записи"}</h1>
      {span === "range" ? (
        <div className="admin-row">
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <button type="button" onClick={() => void load()}>
            Показать
          </button>
        </div>
      ) : null}
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-table">
        {rows.length === 0 ? <p className="admin-note">Записей нет.</p> : null}
        {rows.map((row) => (
          <article key={row.id}>
            <strong>{visitLabel(row.startsAt)}</strong>
            <span>{row.client.name}, {row.client.phone}</span>
            <span>{row.barber.name}</span>
            <span>{row.services.join(", ")}</span>
            <span>{money(row.totalPrice)}</span>
            <span>{statusLabel[row.status] ?? row.status}</span>
            <div className="admin-row">
              <select value={row.status} onChange={(event) => void patch(row.id, { status: event.target.value })}>
                {Object.entries(statusLabel).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <button type="button" onClick={() => void patch(row.id, { status: "cancelled" })}>
                Отменить
              </button>
              <MoveButton onMove={(startsAt) => void patch(row.id, { startsAt })} />
            </div>
          </article>
        ))}
      </div>
      <form
        className="admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          void createVisit();
        }}
      >
        <h2>Новая запись</h2>
        <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
          {services.map((service) => (
            <option key={service.id} value={service.id}>{service.name}</option>
          ))}
        </select>
        <select value={barberId} onChange={(event) => setBarberId(event.target.value)}>
          {barbers.map((barber) => (
            <option key={barber.id} value={barber.id}>{barber.name}</option>
          ))}
        </select>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Имя" />
        <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+998" />
        <button type="submit">Создать</button>
      </form>
    </AdminFrame>
  );
}

function MoveButton({ onMove }: { onMove: (startsAt: string) => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(tashkentDay());
  const [time, setTime] = useState("11:00");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Перенести
      </button>
    );
  }
  return (
    <>
      <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
      <button type="button" onClick={() => onMove(new Date(`${date}T${time}:00+05:00`).toISOString())}>
        Сохранить
      </button>
    </>
  );
}
