export async function bootTelegram(): Promise<{ initData: string; inTelegram: boolean }> {
  try {
    const { default: WebApp } = await import("@twa-dev/sdk");
    WebApp.ready();
    WebApp.expand();
    const theme = WebApp.themeParams;
    const root = document.documentElement;
    const pairs: Array<[string, string | undefined]> = [
      ["--bg", theme.bg_color],
      ["--text", theme.text_color],
      ["--hint", theme.hint_color],
      ["--btn", theme.button_color],
      ["--btn-text", theme.button_text_color],
      ["--card", theme.secondary_bg_color],
    ];
    for (const [key, value] of pairs) {
      if (value) root.style.setProperty(key, value);
    }
    if (WebApp.initData) return { initData: WebApp.initData, inTelegram: true };
  } catch {
    // Браузер без Telegram WebApp.
  }
  if (import.meta.env.DEV) return { initData: "dev", inTelegram: false };
  return { initData: "", inTelegram: false };
}
