"use client";

import { AdminFrame } from "@/components/admin/frame";
import { AdminError, adminFetch } from "@/lib/admin-api";
import { useEffect, useState } from "react";

const days = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

type Slot = { weekday: number; start: string; end: string };

export function ScheduleDesk() {
  const [barbers, setBarbers] = useState<Array<{ id: string; name: string }>>([]);
  const [barberId, setBarberId] = useState("");
  const [hours, setHours] = useState<Slot[]>([]);
  const [breaks, setBreaks] = useState<Slot[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void adminFetch<{ barbers: Array<{ id: string; name: string }> }>("/api/v1/admin/barbers").then((body) => {
      setBarbers(body.barbers);
      setBarberId(body.barbers[0]?.id ?? "");
    });
  }, []);

  useEffect(() => {
    if (!barberId) return;
    void adminFetch<{ barber: { workingHours: Slot[]; breaks: Slot[] } }>(`/api/v1/admin/barbers/${barberId}`).then((body) => {
      setHours(body.barber.workingHours);
      setBreaks(body.barber.breaks);
    });
  }, [barberId]);

  function edit(list: Slot[], setList: (next: Slot[]) => void, weekday: number, field: "start" | "end", value: string) {
    const current = list.find((item) => item.weekday === weekday) ?? { weekday, start: "10:00", end: "21:00" };
    setList([...list.filter((item) => item.weekday !== weekday), { ...current, [field]: value }].sort((a, b) => a.weekday - b.weekday));
  }

  return (
    <AdminFrame>
      <h1>График и обед</h1>
      {error ? <p className="admin-error">{error}</p> : null}
      <select value={barberId} onChange={(event) => setBarberId(event.target.value)}>
        {barbers.map((barber) => (
          <option key={barber.id} value={barber.id}>{barber.name}</option>
        ))}
      </select>
      <div className="admin-table">
        {days.map((label, weekday) => {
          const hour = hours.find((item) => item.weekday === weekday);
          const pause = breaks.find((item) => item.weekday === weekday);
          return (
            <article key={label}>
              <strong>{label}</strong>
              <label>
                Смена
                <input type="time" value={hour?.start ?? ""} onChange={(event) => edit(hours, setHours, weekday, "start", event.target.value)} />
                <input type="time" value={hour?.end ?? ""} onChange={(event) => edit(hours, setHours, weekday, "end", event.target.value)} />
              </label>
              <label>
                Обед
                <input type="time" value={pause?.start ?? ""} onChange={(event) => edit(breaks, setBreaks, weekday, "start", event.target.value)} />
                <input type="time" value={pause?.end ?? ""} onChange={(event) => edit(breaks, setBreaks, weekday, "end", event.target.value)} />
              </label>
              <button type="button" onClick={() => { setHours(hours.filter((item) => item.weekday !== weekday)); setBreaks(breaks.filter((item) => item.weekday !== weekday)); }}>
                Выходной
              </button>
            </article>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => void adminFetch(`/api/v1/admin/barbers/${barberId}/schedule`, {
          method: "PUT",
          body: JSON.stringify({
            hours: hours.filter((item) => item.start && item.end),
            breaks: breaks.filter((item) => item.start && item.end),
          }),
        }).catch((reason: unknown) => setError(reason instanceof AdminError ? reason.message : "Не удалось сохранить график"))}
      >
        Сохранить график
      </button>
    </AdminFrame>
  );
}
