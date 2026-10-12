"use client";

import { formatDuration, formatPrice } from "@/data/content";
import { formatBookDate } from "@/data/slots";
import { bookingMessage, BookingError, createBooking, fetchDays, fetchSlots, type DayAvailability } from "@/lib/booking";
import type { Barber, Service } from "@/lib/catalog";
import { apiUrl } from "@/lib/catalog";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

const STEPS = [
  { id: "service", label: "Услуга" },
  { id: "barber", label: "Барбер" },
  { id: "date", label: "Дата" },
  { id: "time", label: "Время" },
  { id: "contacts", label: "Контакты" },
] as const;

type StepId = (typeof STEPS)[number]["id"] | "done";
type SlotState = "idle" | "loading" | "ready" | "empty" | "error";

const ANY_BARBER = "any";

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 9) return `998${digits}`;
  return digits;
}

function isValidPhone(value: string): boolean {
  return /^998\d{9}$/.test(normalizePhone(value));
}

function formatPhone(value: string): string {
  const digits = normalizePhone(value);
  if (!/^998\d{9}$/.test(digits)) return value.trim();
  return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`;
}

export function BookFlow({
  services,
  barbers,
  catalogError,
  initialServiceId,
}: {
  services: Service[];
  barbers: Barber[];
  catalogError: boolean;
  initialServiceId?: string | null;
}) {
  const initialService = services.some((service) => service.id === initialServiceId) ? initialServiceId : null;
  const [step, setStep] = useState<StepId>("service");
  const [serviceId, setServiceId] = useState<string | null>(initialService ?? null);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotState, setSlotState] = useState<SlotState>("idle");
  const [attempt, setAttempt] = useState(0);
  const [days, setDays] = useState<DayAvailability[]>([]);
  const [dayState, setDayState] = useState<SlotState>("idle");
  const [dayAttempt, setDayAttempt] = useState(0);
  const [submitState, setSubmitState] = useState<"idle" | "loading">("idle");
  const [submitError, setSubmitError] = useState("");
  const [manageToken, setManageToken] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);

  const service = services.find((item) => item.id === serviceId) ?? null;
  const barber = barbers.find((item) => item.id === barberId) ?? null;
  const stepIndex = STEPS.findIndex((item) => item.id === step);

  useEffect(() => {
    if (step !== "done" || !manageToken) return;
    let cancel = false;
    fetch(apiUrl("/api/v1/telegram/bot"))
      .then((response) => response.json())
      .then((body: { username?: string | null }) => {
        if (!cancel && body.username) setBotUsername(body.username);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [step, manageToken]);

  useEffect(() => {
    if (step !== "date" || !serviceId || !barberId) return;
    let cancel = false;
    fetchDays([serviceId], barberId).then(
      (next) => {
        if (cancel) return;
        setDays(next);
        setDayState(next.some((day) => day.available) ? "ready" : "empty");
        setDate((current) => (current && next.some((day) => day.date === current && day.available) ? current : null));
      },
      () => {
        if (!cancel) setDayState("error");
      },
    );
    return () => {
      cancel = true;
    };
  }, [step, serviceId, barberId, dayAttempt]);

  useEffect(() => {
    if (step !== "time" || !date || !serviceId || !barberId) return;
    let cancel = false;
    fetchSlots([serviceId], barberId, date).then(
      (next) => {
        if (cancel) return;
        setSlots(next);
        setSlotState(next.length === 0 ? "empty" : "ready");
        setTime((current) => (current && next.includes(current) ? current : null));
      },
      () => {
        if (!cancel) setSlotState("error");
      },
    );
    return () => {
      cancel = true;
    };
  }, [step, date, serviceId, barberId, attempt]);

  function goNext() {
    if (step === "service" && serviceId) setStep("barber");
    else if (step === "barber" && barberId) {
      setDays([]);
      setDayState("loading");
      setStep("date");
    }
    else if (step === "date" && date) {
      setSlots([]);
      setSlotState("loading");
      setStep("time");
    }
    else if (step === "time" && time) setStep("contacts");
  }

  function goBack() {
    const index = STEPS.findIndex((item) => item.id === step);
    const previous = STEPS[index - 1];
    if (previous) setStep(previous.id);
  }

  async function submitContacts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextNameError = name.trim().length < 2 ? "Введите имя" : "";
    const nextPhoneError = isValidPhone(phone) ? "" : "Введите телефон в формате +998 71 200 19 30";
    setNameError(nextNameError);
    setPhoneError(nextPhoneError);
    if (nextNameError || nextPhoneError || !serviceId || !barberId || !date || !time) return;
    setSubmitState("loading");
    setSubmitError("");
    try {
      const booking = await createBooking({
        serviceIds: [serviceId],
        barberId,
        startsAt: new Date(`${date}T${time}:00+05:00`).toISOString(),
        name: name.trim(),
        phone,
      });
      setManageToken(booking.manageToken);
      setSubmitState("idle");
      setStep("done");
    } catch (error) {
      const message = bookingMessage(error);
      setSubmitState("idle");
      if (error instanceof BookingError && error.code === "SLOT_TAKEN") {
        setSubmitError(message);
        setTime(null);
        setSlots([]);
        setSlotState("loading");
        setAttempt((value) => value + 1);
        setStep("time");
        return;
      }
      setSubmitError(message);
    }
  }

  const canContinue =
    (step === "service" && Boolean(serviceId)) ||
    (step === "barber" && Boolean(barberId)) ||
    (step === "date" && Boolean(date)) ||
    (step === "time" && Boolean(time) && slotState === "ready");

  return (
    <div className="book">
      <header className="book-head">
        <h1>{step === "done" ? "Запись принята" : "Запись"}</h1>
        {step !== "done" ? (
          <ol className="book-steps">
            {STEPS.map((item, index) => (
              <li key={item.id} aria-current={item.id === step ? "step" : undefined}>
                <span>{index + 1}</span>
                {item.label}
              </li>
            ))}
          </ol>
        ) : (
          <p>Ждём вас в Кромке.</p>
        )}
      </header>

      <div className="book-layout">
        <div>
          {catalogError ? (
            <p className="book-status" role="alert">
              Не удалось загрузить услуги и барберов.
            </p>
          ) : null}
          {step === "service" && !catalogError ? (
            <ServiceStep
              services={services}
              selectedId={serviceId}
              onSelect={(id) => {
                setServiceId(id);
                setDate(null);
                setTime(null);
              }}
            />
          ) : null}
          {step === "barber" ? (
            <BarberStep
              barbers={barbers}
              selectedId={barberId}
              onSelect={(id) => {
                setBarberId(id);
                setDate(null);
                setTime(null);
              }}
            />
          ) : null}
          {step === "date" ? (
            <DateStep
              days={days}
              state={dayState}
              selected={date}
              onSelect={(next) => {
                setDate(next);
                setTime(null);
              }}
              onRetry={() => {
                setDayState("loading");
                setDayAttempt((value) => value + 1);
              }}
            />
          ) : null}
          {step === "time" ? (
            <>
              {submitError ? <p className="book-error">{submitError}</p> : null}
              <TimeStep
                state={slotState}
                slots={slots}
                selected={time}
              onSelect={setTime}
                onRetry={() => {
                  setSlots([]);
                  setSlotState("loading");
                  setAttempt((value) => value + 1);
                }}
              />
            </>
          ) : null}
          {step === "contacts" ? (
            <form className="book-form" onSubmit={submitContacts} noValidate>
              <div className="book-field">
                <label htmlFor="book-name">Имя</label>
                <input
                  id="book-name"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={nameError ? "book-name-error" : undefined}
                />
                {nameError ? (
                  <p id="book-name-error" className="book-error">
                    {nameError}
                  </p>
                ) : null}
              </div>
              <div className="book-field">
                <label htmlFor="book-phone">Телефон</label>
                <p id="book-phone-help">Номер, на который можно перезвонить.</p>
                <input
                  id="book-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  aria-invalid={Boolean(phoneError)}
                  aria-describedby={phoneError ? "book-phone-error book-phone-help" : "book-phone-help"}
                />
                {phoneError ? (
                  <p id="book-phone-error" className="book-error">
                    {phoneError}
                  </p>
                ) : null}
              </div>
              <div className="book-actions">
                <button type="button" className="book-back" onClick={goBack}>
                  Назад
                </button>
                <button type="submit" className="cta" disabled={submitState === "loading"}>
                  {submitState === "loading" ? "Записываем" : "Подтвердить"}
                </button>
              </div>
              {submitError ? <p className="book-error">{submitError}</p> : null}
            </form>
          ) : null}
          {step === "done" && service && barberId && date && time ? (
            <div className="book-done">
              <p>
                {service.name}, {formatDuration(service.durationMin)}, {formatPrice(service.price)}
              </p>
              <p>{barberId === ANY_BARBER ? "Любой свободный" : barber?.name}</p>
              <p>
                {formatBookDate(date)}, {time}
              </p>
              <p>
                {name.trim()}, {formatPhone(phone)}
              </p>
              <Link className="cta" href={manageToken ? `/booking/${manageToken}` : "/"}>
                Открыть запись
              </Link>
              {botUsername && manageToken ? (
                <a className="cta" href={`https://t.me/${botUsername}?start=b_${manageToken}`}>
                  Открыть в Telegram
                </a>
              ) : null}
            </div>
          ) : null}

          {step !== "contacts" && step !== "done" ? (
            <div className="book-actions">
              {stepIndex > 0 ? (
                <button type="button" className="book-back" onClick={goBack}>
                  Назад
                </button>
              ) : (
                <span />
              )}
              <button type="button" className="cta" onClick={goNext} disabled={!canContinue}>
                Дальше
              </button>
            </div>
          ) : null}
        </div>

        {step !== "done" ? (
          <aside className="book-summary" aria-label="Выбранная запись">
            <h2>Ваш визит</h2>
            <dl>
              <div>
                <dt>Услуга</dt>
                <dd>{service ? `${service.name}, ${formatPrice(service.price)}` : "Не выбрана"}</dd>
              </div>
              <div>
                <dt>Барбер</dt>
                <dd>{barberId === ANY_BARBER ? "Любой свободный" : barber?.name ?? "Не выбран"}</dd>
              </div>
              <div>
                <dt>Дата</dt>
                <dd>{date ? formatBookDate(date) : "Не выбрана"}</dd>
              </div>
              <div>
                <dt>Время</dt>
                <dd>{time ?? "Не выбрано"}</dd>
              </div>
            </dl>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function ServiceStep({
  services: items,
  selectedId,
  onSelect,
}: {
  services: Service[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="book-choices" role="listbox" aria-label="Услуги">
      {items.map((service) => (
        <button
          key={service.id}
          type="button"
          role="option"
          aria-selected={service.id === selectedId}
          className={service.id === selectedId ? "book-choice is-on" : "book-choice"}
          onClick={() => onSelect(service.id)}
        >
          <span className="book-choice-title">{service.name}</span>
          <span className="book-choice-meta">
            {formatDuration(service.durationMin)}, {formatPrice(service.price)}
          </span>
        </button>
      ))}
    </div>
  );
}

function BarberStep({
  barbers: items,
  selectedId,
  onSelect,
}: {
  barbers: Barber[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="book-choices" role="listbox" aria-label="Барберы">
      <button
        type="button"
        role="option"
        aria-selected={selectedId === ANY_BARBER}
        className={selectedId === ANY_BARBER ? "book-choice is-on" : "book-choice"}
        onClick={() => onSelect(ANY_BARBER)}
      >
        <span className="book-choice-title">Любой свободный</span>
        <span className="book-choice-meta">Подберём мастера на выбранное время</span>
      </button>
      {items.map((barber) => (
        <button
          key={barber.id}
          type="button"
          role="option"
          aria-selected={barber.id === selectedId}
          className={barber.id === selectedId ? "book-choice is-on" : "book-choice"}
          onClick={() => onSelect(barber.id)}
        >
          <span className="book-avatar">
            <Image src={barber.image} alt="" width={56} height={72} />
          </span>
          <span>
            <span className="book-choice-title">{barber.name}</span>
            <span className="book-choice-meta">
              {barber.role}. Опыт {barber.experienceYears} лет
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function DateStep({
  days,
  state,
  selected,
  onSelect,
  onRetry,
}: {
  days: DayAvailability[];
  state: SlotState;
  selected: string | null;
  onSelect: (iso: string) => void;
  onRetry: () => void;
}) {
  if (state === "loading" || state === "idle") {
    return (
      <div className="book-dates" aria-busy="true">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} className="book-skeleton" />
        ))}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="book-status" role="alert">
        <p>Не удалось загрузить даты.</p>
        <button type="button" className="cta" onClick={onRetry}>
          Повторить
        </button>
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="book-status" role="status">
        <p>В ближайшие дни нет свободного времени.</p>
      </div>
    );
  }

  return (
    <div className="book-dates" role="listbox" aria-label="Дата">
      {days.map((day) => (
        <button
          key={day.date}
          type="button"
          role="option"
          aria-selected={day.date === selected}
          className={day.date === selected ? "book-date is-on" : "book-date"}
          disabled={!day.available}
          onClick={() => onSelect(day.date)}
        >
          {formatBookDate(day.date)}
        </button>
      ))}
    </div>
  );
}

function TimeStep({
  state,
  slots,
  selected,
  onSelect,
  onRetry,
}: {
  state: SlotState;
  slots: string[];
  selected: string | null;
  onSelect: (slot: string) => void;
  onRetry: () => void;
}) {
  if (state === "loading" || state === "idle") {
    return (
      <div className="book-times" aria-busy="true" aria-live="polite">
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className="book-skeleton" />
        ))}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="book-status" role="alert">
        <p>Не удалось загрузить время.</p>
        <button type="button" className="cta" onClick={onRetry}>
          Повторить
        </button>
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="book-status" role="status">
        <p>На этот день свободного времени нет. Выберите другую дату.</p>
      </div>
    );
  }

  return (
    <div className="book-times" role="listbox" aria-label="Время">
      {slots.map((slot) => (
        <button
          key={slot}
          type="button"
          role="option"
          aria-selected={slot === selected}
          className={slot === selected ? "book-time is-on" : "book-time"}
          onClick={() => onSelect(slot)}
        >
          {slot}
        </button>
      ))}
    </div>
  );
}
