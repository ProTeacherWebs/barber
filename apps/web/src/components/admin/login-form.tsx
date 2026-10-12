"use client";

import { AdminError, adminFetch } from "@/lib/admin-api";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const router = useRouter();
  const [login, setLogin] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await adminFetch("/api/v1/admin/login", {
        method: "POST",
        body: JSON.stringify({ login, password }),
      });
      router.replace("/admin");
    } catch (reason) {
      setError(reason instanceof AdminError ? reason.message : "Не удалось войти");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="admin-login" onSubmit={(event) => void submit(event)}>
      <h1>Вход</h1>
      <label>
        Логин
        <input value={login} onChange={(event) => setLogin(event.target.value)} autoComplete="username" />
      </label>
      <label>
        Пароль
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
      </label>
      {error ? <p className="admin-error">{error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Входим" : "Войти"}
      </button>
    </form>
  );
}
