import { useEffect, useState } from "react";
import {
  auth,
  cancelVisit,
  createVisit,
  getBarbers,
  getDays,
  getServices,
  getSlots,
  isCode,
  messageOf,
  moveVisit,
  myBookings,
  setInitData,
  type Barber,
  type BookingView,
  type ClientProfile,
  type Service,
} from "./api";
import { bootTelegram } from "./telegram";

type Step = "service" | "barber" | "date" | "time" | "confirm" | "done" | "mine" | "move";

const ANY = "any";

function money(price: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(price)} сум`;
}

function dayLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function visitLabel(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Tashkent",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function validPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  const local = digits.length === 9 ? `998${digits}` : digits;
  return /^998\d{9}$/.test(local);
}

const statusLabel = {
  confirmed: "Подтверждена",
  completed: "Завершена",
  cancelled: "Отменена",
  no_show: "Не пришёл",
} as const;

export function App() {
  const [ready, setReady] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [inTelegram, setInTelegram] = useState(false);
  const [bootError, setBootError] = useState("");
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [days, setDays] = useState<Array<{ date: string; available: boolean }>>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<BookingView | null>(null);
  const [bookings, setBookings] = useState<BookingView[]>([]);
  const [moving, setMoving] = useState<BookingView | null>(null);

  useEffect(() => {
    let cancel = false;
    bootTelegram()
      .then(async (session) => {
        if (!session.initData) throw new Error("Откройте мини-приложение в Telegram.");
        setInitData(session.initData);
        setInTelegram(session.inTelegram);
        const [profile, serviceList, barberList] = await Promise.all([auth(), getServices(), getBarbers()]);
        if (cancel) return;
        setClient(profile);
        setName(profile.name);
        setPhone(profile.phone);
        setServices(serviceList);
        setBarbers(barberList);
        setReady(true);
      })
      .catch((reason: unknown) => {
        if (!cancel) setBootError(messageOf(reason));
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    fetch("/api/v1/telegram/bot")
      .then((response) => response.json())
      .then((body: { username?: string | null }) => {
        if (body.username) setBotUsername(body.username);
      })
      .catch(() => undefined);
  }, [ready]);

  async function openDates(nextBarber: string, serviceIds: string[], token?: string) {
    setPending(true);
    setError("");
    try {
      const next = await getDays(serviceIds, nextBarber, token);
      setDays(next);
      setDate(null);
      setTime(null);
      setStep(token ? "move" : "date");
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setPending(false);
    }
  }

  async function openSlots(nextDate: string, serviceIds: string[], nextBarber: string, token?: string) {
    setDate(nextDate);
    setTime(null);
    setPending(true);
    setError("");
    try {
      setSlots(await getSlots(serviceIds, nextBarber, nextDate, token));
      setStep("time");
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setPending(false);
    }
  }

  async function submit() {
    if (!serviceId || !barberId || !date || !time) return;
    if (name.trim().length < 2 || !validPhone(phone)) {
      setError("Проверьте имя и телефон в формате +998 71 200 19 30.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const booking = await createVisit({
        serviceIds: [serviceId],
        barberId,
        startsAt: new Date(`${date}T${time}:00+05:00`).toISOString(),
        name: name.trim(),
        phone,
      });
      setDone(booking);
      setStep("done");
    } catch (reason) {
      setError(messageOf(reason));
      if (isCode(reason, "SLOT_TAKEN") && serviceId && barberId && date) {
        setSlots(await getSlots([serviceId], barberId, date).catch(() => []));
        setTime(null);
        setStep("time");
      }
    } finally {
      setPending(false);
    }
  }

  async function loadMine() {
    setPending(true);
    setError("");
    try {
      const body = await myBookings();
      setBookings(body.bookings);
      setStep("mine");
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setPending(false);
    }
  }

  async function cancel(token: string) {
    setPending(true);
    setError("");
    try {
      await cancelVisit(token);
      setBookings((await myBookings()).bookings);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setPending(false);
    }
  }

  async function saveMove() {
    if (!moving || !date || !time) return;
    setPending(true);
    setError("");
    try {
      await moveVisit(moving.manageToken, new Date(`${date}T${time}:00+05:00`).toISOString());
      setMoving(null);
      setBookings((await myBookings()).bookings);
      setStep("mine");
    } catch (reason) {
      setError(messageOf(reason));
      if (isCode(reason, "SLOT_TAKEN")) {
        const ids = moving.services.map((service) => service.serviceId);
        setSlots(await getSlots(ids, moving.barber.id, date, moving.manageToken).catch(() => []));
        setTime(null);
        setStep("time");
      }
    } finally {
      setPending(false);
    }
  }

  if (bootError) {
    return (
      <main className="app">
        <h1>Кромка</h1>
        <p className="error">{bootError}</p>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="app">
        <h1>Кромка</h1>
        <p className="note">Загружаем запись.</p>
      </main>
    );
  }

  const service = services.find((item) => item.id === serviceId) ?? null;
  const activeIds = moving ? moving.services.map((item) => item.serviceId) : serviceId ? [serviceId] : [];
  const activeBarber = moving?.barber.id ?? barberId ?? ANY;

  return (
    <main className="app">
      <header className="top">
        <h1>Кромка</h1>
        <div className="tabs">
          <button type="button" className={step === "mine" ? "" : "is-on"} onClick={() => setStep("service")}>
            Запись
          </button>
          <button type="button" className={step === "mine" ? "is-on" : ""} onClick={() => void loadMine()}>
            Мои
          </button>
        </div>
      </header>
      {!inTelegram ? <p className="note">Локальный режим, без Telegram.</p> : null}
      {client ? <p className="note">{client.name}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {step === "service" ? (
        <div className="list">
          {services.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === serviceId ? "choice is-on" : "choice"}
              onClick={() => {
                setServiceId(item.id);
                setBarberId(null);
                setStep("barber");
              }}
            >
              <strong>{item.name}</strong>
              <small>
                {item.durationMin} мин, {money(item.price)}
              </small>
            </button>
          ))}
        </div>
      ) : null}

      {step === "barber" ? (
        <div className="list">
          <button
            type="button"
            className={barberId === ANY ? "choice is-on" : "choice"}
            onClick={() => {
              setBarberId(ANY);
              if (serviceId) void openDates(ANY, [serviceId]);
            }}
          >
            <strong>Любой свободный</strong>
            <small>Подберём мастера на выбранное время</small>
          </button>
          {barbers.map((barber) => (
            <button
              key={barber.id}
              type="button"
              className={barber.id === barberId ? "choice is-on" : "choice"}
              onClick={() => {
                setBarberId(barber.id);
                if (serviceId) void openDates(barber.id, [serviceId]);
              }}
            >
              <strong>{barber.name}</strong>
              <small>
                {barber.bio}. Опыт {barber.experienceYears} лет
              </small>
            </button>
          ))}
        </div>
      ) : null}

      {step === "date" || step === "move" ? (
        <div className="list">
          {days.filter((day) => day.available).length === 0 ? <p className="note">Свободных дней нет.</p> : null}
          {days.map((day) => (
            <button
              key={day.date}
              type="button"
              className="choice"
              disabled={!day.available || pending}
              onClick={() => void openSlots(day.date, activeIds, activeBarber, moving?.manageToken)}
            >
              {dayLabel(day.date)}
            </button>
          ))}
        </div>
      ) : null}

      {step === "time" ? (
        <div className="stack">
          {slots.length === 0 ? <p className="note">На этот день свободного времени нет.</p> : null}
          <div className="times">
            {slots.map((slot) => (
              <button
                key={slot}
                type="button"
                className={slot === time ? "slot is-on" : "slot"}
                onClick={() => {
                  setTime(slot);
                  setStep("confirm");
                }}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === "confirm" ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (moving) void saveMove();
            else void submit();
          }}
        >
          {moving ? (
            <p>
              {moving.services.map((item) => item.name).join(", ")}, {moving.barber.name}, {date} {time}
            </p>
          ) : (
            <p>
              {service?.name}, {date} {time}
            </p>
          )}
          <label className="field">
            Имя
            <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
          </label>
          <label className="field">
            Телефон
            <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" />
          </label>
          <button type="submit" className="primary" disabled={pending || !time}>
            {pending ? "Сохраняем" : moving ? "Перенести" : "Подтвердить"}
          </button>
        </form>
      ) : null}

      {step === "done" && done ? (
        <div className="stack">
          <p>Ждём вас в Кромке.</p>
          <p>
            {done.services.map((item) => item.name).join(", ")}, {done.barber.name}
          </p>
          <p>{visitLabel(done.startsAt)}</p>
          <button type="button" className="primary" onClick={() => void loadMine()}>
            Мои записи
          </button>
          {botUsername ? (
            <a className="primary" href={`https://t.me/${botUsername}?start=b_${done.manageToken}`}>
              Открыть в Telegram
            </a>
          ) : null}
        </div>
      ) : null}

      {step === "mine" ? (
        <div className="list">
          {bookings.length === 0 ? <p className="note">Записей пока нет.</p> : null}
          {bookings.map((booking) => (
            <article key={booking.id} className="choice">
              <strong>{booking.services.map((item) => item.name).join(", ")}</strong>
              <span>
                {booking.barber.name}, {visitLabel(booking.startsAt)}
              </span>
              <span className="status">{statusLabel[booking.status]}</span>
              {booking.status === "confirmed" ? (
                <div className="row">
                  <button
                    type="button"
                    className="ghost"
                    disabled={pending}
                    onClick={() => {
                      setMoving(booking);
                      setName(booking.client.name);
                      setPhone(booking.client.phone);
                      void openDates(
                        booking.barber.id,
                        booking.services.map((item) => item.serviceId),
                        booking.manageToken,
                      );
                    }}
                  >
                    Перенести
                  </button>
                  <button type="button" className="primary" disabled={pending} onClick={() => void cancel(booking.manageToken)}>
                    Отменить
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </main>
  );
}
