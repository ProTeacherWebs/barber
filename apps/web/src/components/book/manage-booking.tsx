"use client";

import { formatPrice } from "@/data/content";
import { formatBookDate, formatVisit } from "@/data/slots";
import {
  bookingMessage,
  cancelBooking,
  fetchDays,
  fetchSlots,
  rescheduleBooking,
  type BookingView,
  type DayAvailability,
} from "@/lib/booking";
import { useEffect, useMemo, useState } from "react";

const statusLabel = {
  confirmed: "Подтверждена",
  completed: "Завершена",
  cancelled: "Отменена",
  no_show: "Не пришёл",
} as const;

export function ManageBooking({ token, initial }: { token: string; initial: BookingView }) {
  const [booking, setBooking] = useState(initial);
  const [mode, setMode] = useState<"view" | "move">("view");
  const [days, setDays] = useState<DayAvailability[]>([]);
  const [dayState, setDayState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotState, setSlotState] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [time, setTime] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const serviceKey = booking.services.map((service) => service.serviceId).join(",");
  const serviceIds = useMemo(() => (serviceKey ? serviceKey.split(",") : []), [serviceKey]);

  useEffect(() => {
    if (mode !== "move") return;
    let cancel = false;
    fetchDays(serviceIds, booking.barber.id, token).then(
      (next) => {
        if (cancel) return;
        setDays(next);
        setDayState(next.some((day) => day.available) ? "ready" : "empty");
      },
      () => {
        if (!cancel) setDayState("error");
      },
    );
    return () => {
      cancel = true;
    };
  }, [mode, booking.barber.id, token, serviceIds]);

  useEffect(() => {
    if (mode !== "move" || !date) return;
    let cancel = false;
    fetchSlots(serviceIds, booking.barber.id, date, token).then(
      (next) => {
        if (cancel) return;
        setSlots(next);
        setSlotState(next.length === 0 ? "empty" : "ready");
      },
      () => {
        if (!cancel) setSlotState("error");
      },
    );
    return () => {
      cancel = true;
    };
  }, [mode, date, booking.barber.id, token, serviceIds]);

  async function cancelVisit() {
    setPending(true);
    setError("");
    try {
      setBooking(await cancelBooking(token));
      setMode("view");
    } catch (reason) {
      setError(bookingMessage(reason));
    } finally {
      setPending(false);
    }
  }

  async function moveVisit() {
    if (!date || !time) return;
    setPending(true);
    setError("");
    try {
      setBooking(await rescheduleBooking(token, new Date(`${date}T${time}:00+05:00`).toISOString()));
      setMode("view");
      setTime(null);
    } catch (reason) {
      setError(bookingMessage(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="book">
      <header className="book-head">
        <h1>Ваша запись</h1>
        <p>{statusLabel[booking.status]}</p>
      </header>
      <div className="book-layout">
        <div>
          <dl className="book-summary">
            <div>
              <dt>Услуга</dt>
              <dd>
                {booking.services.map((service) => service.name).join(", ")}, {formatPrice(booking.totalPrice)}
              </dd>
            </div>
            <div>
              <dt>Барбер</dt>
              <dd>{booking.barber.name}</dd>
            </div>
            <div>
              <dt>Время</dt>
              <dd>{formatVisit(booking.startsAt)}</dd>
            </div>
            <div>
              <dt>Гость</dt>
              <dd>
                {booking.client.name}, {booking.client.phone}
              </dd>
            </div>
          </dl>

          {booking.status === "confirmed" && mode === "view" ? (
            <div className="book-actions">
              <button type="button" className="book-back" onClick={() => {
                setDayState("loading");
                setMode("move");
              }} disabled={pending}>
                Перенести
              </button>
              <button type="button" className="cta" onClick={cancelVisit} disabled={pending}>
                Отменить запись
              </button>
            </div>
          ) : null}

          {mode === "move" ? (
            <div className="book-form">
              {dayState === "loading" ? <p className="book-status">Загружаем даты.</p> : null}
              {dayState === "empty" ? <p className="book-status">Свободных дней нет.</p> : null}
              {dayState === "error" ? <p className="book-status">Не удалось загрузить даты.</p> : null}
              {dayState === "ready" ? (
                <div className="book-dates" role="listbox" aria-label="Новая дата">
                  {days.map((day) => (
                    <button
                      key={day.date}
                      type="button"
                      className={day.date === date ? "book-date is-on" : "book-date"}
                      disabled={!day.available}
                      onClick={() => {
                        setDate(day.date);
                        setTime(null);
                        setSlots([]);
                        setSlotState("loading");
                      }}
                    >
                      {formatBookDate(day.date)}
                    </button>
                  ))}
                </div>
              ) : null}
              {slotState === "ready" ? (
                <div className="book-times" role="listbox" aria-label="Новое время">
                  {slots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      className={slot === time ? "book-time is-on" : "book-time"}
                      onClick={() => setTime(slot)}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              ) : null}
              {slotState === "empty" ? <p className="book-status">На этот день свободного времени нет.</p> : null}
              <div className="book-actions">
                <button type="button" className="book-back" onClick={() => setMode("view")}>
                  Назад
                </button>
                <button type="button" className="cta" onClick={moveVisit} disabled={!time || pending}>
                  Перенести
                </button>
              </div>
            </div>
          ) : null}
          {error ? <p className="book-error">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
