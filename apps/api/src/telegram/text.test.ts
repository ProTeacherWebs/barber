import { describe, expect, it } from "vitest";
import { confirmationText, parseStartPayload } from "./text.js";

describe("telegram payload", () => {
  it("разбирает deep link записи и барбера", () => {
    expect(parseStartPayload("b_abcdefghijklmnopqrstuvwxyz12")).toEqual({
      kind: "booking",
      token: "abcdefghijklmnopqrstuvwxyz12",
    });
    expect(parseStartPayload("barber_abcd1234")).toEqual({ kind: "barber", code: "abcd1234" });
    expect(parseStartPayload("hello")).toEqual({ kind: "none" });
  });

  it("собирает текст подтверждения", () => {
    const text = confirmationText({
      services: ["Мужская стрижка"],
      barberName: "Азиз Каримов",
      startsAt: "2026-10-12T05:00:00.000Z",
    });
    expect(text).toContain("подтверждена");
    expect(text).toContain("Азиз Каримов");
    expect(text).toContain("10:00");
  });
});
