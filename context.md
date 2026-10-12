# Контекст для следующего агента

Учебный проект барбершопа. Спеки: `prd-final.md`, `spec-final.md`, чеклист: `tasks-final.md`.

Сделан только этап 1. Этап 2 не начат.

## Что уже сделано

Лендинг без backend и базы. Данные — моки.

- Корень: npm workspaces, `workspaces: ["apps/*"]`.
- `apps/web`: Next.js 16.3.8, React 19, TypeScript, App Router, `src/`.
- Скрипты из корня: `npm run dev`, `npm run build`, `npm run lint`.
- В `tasks-final.md` все пункты этапа 1 отмечены `[x]`.

После первой сборки лендинг переделан по брифу: Editorial Luxury × Modern Barber Culture, Ташкент, не шаблонный барбершоп.

Страница `/` по порядку:

1. Nav — Услуги, Мастера, О нас, Контакты, CTA «Записаться». На мобиле полноэкранное меню.
2. Hero — «Стиль — это детали.» Фото справа, при скролле на desktop раскрывается на весь экран.
3. Философия `#o-nas` — фраза светлеет по словам при скролле.
4. Услуги `#uslugi` — нумерованный список, цена, превью фото при hover (desktop).
5. Мастера `#mastera`.
6. Атмосфера — горизонтальная галерея. Desktop: GSAP pin. Телефон: нативный snap-scroll.
7. Ташкент — «Создано в Ташкенте.»
8. Отзывы — крупные цитаты, без карточек.
9. Финал `#zapis` — «Твой новый образ начинается здесь.» Кнопка звонит на `tel:+998712001930`.
10. Footer `#kontakty` — адрес, телефон, Instagram, Telegram, часы, ссылка «Карта», «Crafted in Tashkent.»

## Ключевые решения

- Бренд: **Кромка**. Ташкент, улица Амира Темура, 108. Телефон `+998 71 200 19 30`. Часы ежедневно 10:00–21:00. Часовой пояс продукта по спеке: `Asia/Tashkent`. Язык интерфейса: русский. Короткие английские метки допустимы (`Tashkent`, `Crafted in Tashkent`).
- Палитра одна, тёмная. Светлой темы нет: редизайн явно задал `#0B0B0A` / `#F2F0EA` / muted bronze `#9A7B4F`. Не возвращать barber pole, gold gradient, карточки 3×3.
- Шрифты: Literata (заголовки, отдельно italic) + Golos Text (текст). Кириллица обязательна.
- В `next/font` нельзя передавать массив `weight` для этих шрифтов в Turbopack dev: ошибка `next/font/google queries have exactly one entry`. Один weight на вызов или variable font без массива. Production `next build` при старом варианте собирался, dev — нет.
- Анимация: GSAP 3.15 + ScrollTrigger + Lenis 1.3. Регистрация только в `apps/web/src/lib/gsap.ts`. Lenis крутится от `gsap.ticker`, `autoRaf: false`, `syncTouch: false`. `useLenis()` не класть в dependencies `useGSAP`.
- Один signature-момент: pin hero на `min-width: 1024px`. На телефоне pin нет. `prefers-reduced-motion` отключает pin, scrub и параллакс. `html { scroll-behavior: auto }` — иначе ломается Lenis.
- `pinType: "transform"`. Не ставить `overflow: hidden` на `body`: ломает pin.
- Карта этапа 1 — ссылка на OpenStreetMap в футере, не iframe. Светлый iframe ломал тёмный экран.
- CTA «Записаться» в шапке и hero ведёт на `#zapis`. Строки услуг тоже ведут на `#zapis`. Финальная кнопка — звонок. Страницы `/book` нет: это первая задача этапа 2.
- Моки: `apps/web/src/data/content.ts`. Комментарий в файле: на этапе 4 их заменит API. Не выдумывать новых мастеров без запроса.
- Фото: `apps/web/public/images/`. Hero — реальный кадр стрижки. Город — вечерний проспект с платанами, не Регистан и не чужой скайлайн. Галерея использует сырой `<img>` из‑за parallax шире кадра (`eslint-disable` точечно). Остальные картинки — `next/image`.
- Вложенный git в `apps/web` удалён. Репозиторий в корне на момент работы не был обязателен.

## Как запускать

```bash
npm run dev
```

Проверенный адрес: http://localhost:3010. Если порт занят, смотреть лог Next: он не даёт поднять второй `next dev` в той же папке.

`npm run lint` проходит. `npm run build` проходил после редизайна.

## Куда смотреть в коде

| Что | Где |
|---|---|
| Моки, цены, контакты | `apps/web/src/data/content.ts` |
| Сборка страницы | `apps/web/src/app/page.tsx` |
| Стили и токены | `apps/web/src/app/globals.css` |
| Шрифты | `apps/web/src/app/layout.tsx` |
| Hero pin | `apps/web/src/components/hero.tsx` |
| Скролл | `apps/web/src/components/scroll/smooth-scroll.tsx` |
| GSAP | `apps/web/src/lib/gsap.ts` |

## Выжимка: что делать дальше

Следующий шаг — **этап 2** из `tasks-final.md`: страница `/book`, весь UX записи на моках, без backend.

Сценарий: услуга → барбер → дата → время → имя и телефон → подтверждение. Слоты пока фиксированные: `10:00`, `11:00`, `12:00`, `14:00`, `15:00`. Нужен вариант «Любой свободный» и состояния loading / empty / error. Мобильная версия обязательна.

Не ломать визуальный язык лендинга. `/book` должна ощущаться тем же брендом: те же токены, Literata + Golos, тёмный фон, без карточной сетки «SaaS».

Кнопки «Записаться» с лендинга сейчас не ведут на `/book`. Когда страница появится, переключить шапку, hero, список услуг и финал с `#zapis` / `tel:` на `/book`. Телефон в футере оставить.

Не начинать Supabase, Prisma, Fastify и Telegram. Это этапы 3+.
