import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app";

describe("админская сессия", () => {
  const app = buildApp({ logger: false });

  afterAll(async () => {
    await app.close();
  });

  it("вход ставит httpOnly cookie, выход его снимает", async () => {
    const denied = await app.inject({ method: "GET", url: "/api/v1/admin/me" });
    expect(denied.statusCode).toBe(401);

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/admin/login",
      payload: { login: "admin", password: "kromka-admin" },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.headers["set-cookie"];
    const header = Array.isArray(cookie) ? cookie.join(";") : String(cookie ?? "");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("kromka_admin=");

    const me = await app.inject({ method: "GET", url: "/api/v1/admin/me", headers: { cookie: header.split(";")[0] ?? "" } });
    expect(me.statusCode).toBe(200);
    expect(me.json().admin.login).toBe("admin");

    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/admin/logout",
      headers: { cookie: header.split(";")[0] ?? "" },
    });
    expect(logout.statusCode).toBe(200);
    const cleared = String(logout.headers["set-cookie"] ?? "");
    expect(cleared).toContain("Max-Age=0");
  });
});
