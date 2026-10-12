"use client";

import { AdminFrame } from "@/components/admin/frame";
import { adminFetch, visitLabel } from "@/lib/admin-api";
import { useEffect, useState } from "react";

type Review = {
  id: string;
  rating: number;
  comment: string;
  isPublic: boolean;
  createdAt: string;
  clientName: string;
  barberName: string;
};

export function ReviewsDesk() {
  const [rows, setRows] = useState<Review[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const body = await adminFetch<{ reviews: Review[] }>("/api/v1/admin/reviews");
    setRows(body.reviews);
  }

  useEffect(() => {
    let cancel = false;
    adminFetch<{ reviews: Review[] }>("/api/v1/admin/reviews")
      .then((body) => {
        if (!cancel) setRows(body.reviews);
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Ошибка");
      });
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <AdminFrame>
      <h1>Отзывы</h1>
      {error ? <p className="admin-error">{error}</p> : null}
      {rows.length === 0 ? <p className="admin-note">Отзывов пока нет.</p> : null}
      <div className="admin-table">
        {rows.map((row) => (
          <article key={row.id}>
            <strong>{row.rating} из 5</strong>
            <span>{row.clientName}, {row.barberName}</span>
            <span>{visitLabel(row.createdAt)}</span>
            <p>{row.comment || "Без текста"}</p>
            <label>
              <input
                type="checkbox"
                checked={row.isPublic}
                onChange={(event) => void adminFetch(`/api/v1/admin/reviews/${row.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ isPublic: event.target.checked }),
                }).then(load)}
              />
              Показывать на сайте
            </label>
          </article>
        ))}
      </div>
    </AdminFrame>
  );
}
