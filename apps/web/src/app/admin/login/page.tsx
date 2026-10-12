import { LoginForm } from "@/components/admin/login-form";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Вход. Кромка" };

export default function AdminLoginPage() {
  return (
    <main className="admin">
      <LoginForm />
    </main>
  );
}
