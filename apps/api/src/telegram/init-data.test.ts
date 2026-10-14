import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyInitData } from "./init-data.js";

const token = "123456:TEST";

function sign(fields: Record<string, string>): string {
  const dataCheckString = Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

describe("initData", () => {
  it("принимает подпись Telegram", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");
    const initData = sign({
      auth_date: String(Math.floor(now / 1000)),
      query_id: "AAE",
      user: JSON.stringify({ id: 42, first_name: "Иван", username: "ivan" }),
    });
    expect(verifyInitData(initData, token, now)).toMatchObject({ id: 42, first_name: "Иван" });
  });

  it("отклоняет подмену и старую сессию", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");
    const fresh = sign({
      auth_date: String(Math.floor(now / 1000)),
      user: JSON.stringify({ id: 42, first_name: "Иван" }),
    });
    const broken = fresh.replace(/hash=([0-9a-f])/, (_match, char: string) => `hash=${char === "a" ? "b" : "a"}`);
    expect(() => verifyInitData(broken, token, now)).toThrow(/не совпала/);

    const stale = sign({
      auth_date: String(Math.floor(now / 1000) - 60 * 60 * 48),
      user: JSON.stringify({ id: 42, first_name: "Иван" }),
    });
    expect(() => verifyInitData(stale, token, now)).toThrow(/устарела/);
  });
});
