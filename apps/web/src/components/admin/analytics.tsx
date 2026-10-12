"use client";

import { AdminFrame } from "@/components/admin/frame";
import { AdminError, adminFetch, money, tashkentDay } from "@/lib/admin-api";
import { useEffect, useState } from "react";

type Revenue = { revenue: number; bookingCount: number; completedCount: number };
type Services = { services: Array<{ name: string; count: number; revenue: number }> };
type Load = { barbers: Array<{ barberId: string; name: string; visits: number; minutes: number; revenue: number }> };
type Heat = { cells: Array<{ weekday: number; hour: number; count: number }> };
type Cancels = { cancelled: number; noShow: number; total: number; cancelRate: number; noShowRate: number };
type Retention = { clients: number; returning: number; rate: number };

const days = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const hours = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function AnalyticsDesk() {
  const today = tashkentDay();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [services, setServices] = useState<Services["services"]>([]);
  const [load, setLoad] = useState<Load["barbers"]>([]);
  const [cells, setCells] = useState<Heat["cells"]>([]);
  const [cancels, setCancels] = useState<Cancels | null>(null);
  const [retention, setRetention] = useState<Retention | null>(null);
  const [error, setError] = useState("");

  function loadPeriod(nextFrom: string, nextTo: string) {
    const query = `from=${nextFrom}&to=${nextTo}`;
    return Promise.all([
      adminFetch<Revenue>(`/api/v1/admin/analytics/revenue?${query}`),
      adminFetch<Services>(`/api/v1/admin/analytics/services?${query}`),
      adminFetch<Load>(`/api/v1/admin/analytics/load?${query}`),
      adminFetch<Heat>(`/api/v1/admin/analytics/heatmap?${query}`),
      adminFetch<Cancels>(`/api/v1/admin/analytics/cancellations?${query}`),
      adminFetch<Retention>(`/api/v1/admin/analytics/retention?${query}`),
    ]);
  }

  useEffect(() => {
    let cancel = false;
    loadPeriod(from, to)
      .then(([moneyRow, serviceRow, loadRow, heatRow, cancelRow, returnRow]) => {
        if (cancel) return;
        setRevenue(moneyRow);
        setServices(serviceRow.services);
        setLoad(loadRow.barbers);
        setCells(heatRow.cells);
        setCancels(cancelRow);
        setRetention(returnRow);
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof AdminError ? reason.message : "Не удалось посчитать аналитику");
      });
    return () => {
      cancel = true;
    };
  }, [from, to]);

  const maxHeat = Math.max(1, ...cells.map((cell) => cell.count));

  return (
    <AdminFrame>
      <h1>Аналитика</h1>
      <form
        className="admin-row"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          void loadPeriod(from, to)
            .then(([moneyRow, serviceRow, loadRow, heatRow, cancelRow, returnRow]) => {
              setRevenue(moneyRow);
              setServices(serviceRow.services);
              setLoad(loadRow.barbers);
              setCells(heatRow.cells);
              setCancels(cancelRow);
              setRetention(returnRow);
            })
            .catch((reason: unknown) => setError(reason instanceof AdminError ? reason.message : "Не удалось посчитать аналитику"));
        }}
      >
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <button type="submit">Показать</button>
      </form>
      {error ? <p className="admin-error">{error}</p> : null}
      <dl className="admin-figures">
        <div>
          <dt>Выручка</dt>
          <dd>{money(revenue?.revenue ?? 0)}</dd>
        </div>
        <div>
          <dt>Записи</dt>
          <dd>{revenue?.bookingCount ?? 0}</dd>
        </div>
        <div>
          <dt>Завершены</dt>
          <dd>{revenue?.completedCount ?? 0}</dd>
        </div>
        <div>
          <dt>Отмены</dt>
          <dd>{cancels ? `${cancels.cancelled} · ${percent(cancels.cancelRate)}` : "0"}</dd>
        </div>
        <div>
          <dt>Неявки</dt>
          <dd>{cancels ? `${cancels.noShow} · ${percent(cancels.noShowRate)}` : "0"}</dd>
        </div>
        <div>
          <dt>Возвращаемость</dt>
          <dd>{retention ? `${retention.returning} из ${retention.clients} · ${percent(retention.rate)}` : "0"}</dd>
        </div>
      </dl>
      <h2>Услуги</h2>
      <div className="admin-table">
        {services.length === 0 ? <p className="admin-note">Завершённых услуг в этом периоде нет.</p> : null}
        {services.map((service) => (
          <article key={service.name}>
            <strong>{service.name}</strong>
            <span>{service.count}</span>
            <span>{money(service.revenue)}</span>
          </article>
        ))}
      </div>
      <h2>Барберы</h2>
      <div className="admin-table">
        {load.length === 0 ? <p className="admin-note">Завершённых визитов нет.</p> : null}
        {load.map((barber) => (
          <article key={barber.barberId}>
            <strong>{barber.name}</strong>
            <span>{barber.visits} визитов</span>
            <span>{barber.minutes} мин</span>
            <span>{money(barber.revenue)}</span>
          </article>
        ))}
      </div>
      <h2>День и час</h2>
      <div className="admin-heat-wrap">
        <table className="admin-heat">
          <thead>
            <tr>
              <th />
              {hours.map((hour) => (
                <th key={hour}>{hour}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((label, weekday) => (
              <tr key={label}>
                <th>{label}</th>
                {hours.map((hour) => {
                  const count = cells.find((cell) => cell.weekday === weekday && cell.hour === hour)?.count ?? 0;
                  return (
                    <td key={hour} style={{ background: `rgba(154, 123, 79, ${count / maxHeat})` }}>
                      {count || ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminFrame>
  );
}
