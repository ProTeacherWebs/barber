import { describe, expect, it } from "vitest";
import { classifySlot, totalDuration, visibleSlots, type SlotInput } from "./slots";
import { canCancel } from "./time";

const open: Pick<SlotInput, "working" | "breaks" | "timeOff" | "bookings"> = {
  working: [{ startMin: 10 * 60, endMin: 21 * 60 }],
  breaks: [{ startMin: 13 * 60, endMin: 14 * 60 }],
  timeOff: [],
  bookings: [],
};

function input(overrides: Partial<SlotInput> = {}): SlotInput {
  return {
    date: "2026-10-12",
    now: new Date("2026-10-05T05:00:00Z"),
    durationMin: 45,
    stepMin: 15,
    minNoticeMin: 30,
    horizonDays: 30,
    ...open,
    ...overrides,
  };
}

describe("слоты", () => {
  it("складывает длительность услуг", () => {
    expect(totalDuration([45, 30])).toBe(75);
  });

  it("не ставит услугу на обед и после закрытия", () => {
    const slots = visibleSlots(input());
    expect(slots).toContain("10:00");
    expect(slots).toContain("12:15");
    expect(slots).not.toContain("12:30");
    expect(slots).toContain("14:00");
    expect(slots).toContain("20:15");
    expect(slots).not.toContain("20:30");
  });

  it("короткая услуга занимает слот ближе к закрытию", () => {
    const slots = visibleSlots(input({ durationMin: 30 }));
    expect(slots).toContain("20:30");
    expect(slots).not.toContain("20:45");
  });

  it("убирает слоты поверх подтверждённой записи", () => {
    const slots = visibleSlots(
      input({ bookings: [{ startMin: 10 * 60, endMin: 10 * 60 + 45 }] }),
    );
    expect(slots).not.toContain("10:00");
    expect(slots).not.toContain("10:15");
    expect(slots).not.toContain("10:30");
    expect(slots).toContain("10:45");
  });

  it("закрывает день исключением", () => {
    const slots = visibleSlots(
      input({ timeOff: [{ startMin: 0, endMin: 24 * 60 }] }),
    );
    expect(slots).toEqual([]);
  });

  it("прячет слоты ближе min_notice_min", () => {
    const slots = visibleSlots(
      input({
        date: "2026-10-05",
        now: new Date("2026-10-05T05:00:00Z"),
        minNoticeMin: 30,
        durationMin: 30,
      }),
    );
    expect(slots).not.toContain("10:00");
    expect(slots).toContain("10:30");
  });

  it("отличает занятый слот, обед и горизонт", () => {
    expect(
      classifySlot(input({ bookings: [{ startMin: 10 * 60, endMin: 11 * 60 }] }), "10:00"),
    ).toBe("SLOT_TAKEN");
    expect(classifySlot(input(), "13:00")).toBe("OUTSIDE_WORKING_HOURS");
    expect(classifySlot(input({ date: "2026-12-01" }), "10:00")).toBe("TOO_FAR");
    expect(classifySlot(input({ date: "2026-10-01" }), "10:00")).toBe("TOO_SOON");
  });

  it("запрещает отмену внутри cutoff", () => {
    const startsAt = new Date("2026-10-12T05:00:00Z");
    expect(canCancel(startsAt, new Date("2026-10-12T04:00:00Z"), 30)).toBe(true);
    expect(canCancel(startsAt, new Date("2026-10-12T04:40:00Z"), 30)).toBe(false);
  });
});
