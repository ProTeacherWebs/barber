"use client";

import { AdminFrame } from "@/components/admin/frame";
import { AdminError, adminFetch } from "@/lib/admin-api";
import { useEffect, useState } from "react";

const labels: Record<string, string> = {
  cancel_cutoff_min: "Отмена не позднее, минут",
  slot_step_min: "Шаг слота, минут",
  booking_horizon_days: "Горизонт записи, дней",
  min_notice_min: "Минимальное предупреждение, минут",
  reminder_day_minutes: "Напоминание за день, минут",
  reminder_short_minutes: "Короткое напоминание, минут",
  review_delay_min: "Просьба отзыва через, минут",
  timezone: "Часовой пояс",
  review_public_min_rating: "Публиковать отзыв от оценки",
};

export function SettingsDesk() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void adminFetch<{ settings: Record<string, string> }>("/api/v1/admin/settings")
      .then((body) => setSettings(body.settings))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Ошибка"));
  }, []);

  return (
    <AdminFrame>
      <h1>Настройки</h1>
      {error ? <p className="admin-error">{error}</p> : null}
      {saved ? <p className="admin-note">Сохранено</p> : null}
      <form
        className="admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(false);
          void adminFetch("/api/v1/admin/settings", { method: "PUT", body: JSON.stringify({ settings }) })
            .then(() => setSaved(true))
            .catch((reason: unknown) => setError(reason instanceof AdminError ? reason.message : "Не удалось сохранить"));
        }}
      >
        {Object.keys(labels).map((key) => (
          <label key={key}>
            {labels[key]}
            <input value={settings[key] ?? ""} onChange={(event) => setSettings({ ...settings, [key]: event.target.value })} />
          </label>
        ))}
        <button type="submit">Сохранить</button>
      </form>
    </AdminFrame>
  );
}
