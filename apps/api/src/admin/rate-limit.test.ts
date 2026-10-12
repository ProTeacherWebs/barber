import { describe, expect, it } from "vitest";
import { clearLoginLimit, loginLimited } from "./rate-limit";

describe("лимит входа", () => {
  it("пускает 8 попыток и блокирует девятую", () => {
    const key = "test-ip";
    clearLoginLimit(key);
    for (let attempt = 0; attempt < 8; attempt += 1) expect(loginLimited(key, 1_000 + attempt)).toBe(false);
    expect(loginLimited(key, 1_008)).toBe(true);
    clearLoginLimit(key);
    expect(loginLimited(key, 1_009)).toBe(false);
  });
});
