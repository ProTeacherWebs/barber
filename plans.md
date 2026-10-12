# План деплоя на Vercel

Три проекта Vercel из одного репозитория: `apps/api`, `apps/web`, `apps/miniapp`. База и cron остаются в Supabase.

Порядок: код в файлах, затем GitHub, затем Vercel (API, сайт, Mini App), затем связка адресов, Telegram и проверка.

---

## Часть 1. Промпт для агента (изменения в файлах)

Вставить в режиме Agent:

```text
Монорепозиторий npm workspaces: apps/web (Next.js), apps/api (Fastify), apps/miniapp (Vite). Prisma в prisma/schema.prisma. Секреты в локальном .env: не читай, не коммить, не вставляй в код. Git, vercel, supabase и Telegram не вызывай. Маршруты, тексты, вёрстку и бизнес-логику не меняй. context.md устарел, не опирайся на него.

Подготовь код к ручному импорту трёх проектов на Vercel. Сначала прочитай текущие файлы, потом правь только перечисленное.

1. apps/api/src/index.ts
   - Оставить import Fastify из app.ts как сейчас (buildApp() не трогать, он нужен тестам).
   - listen оставить: app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3011) }). Порт по умолчанию 3011 не менять.
   - setupBotMenu() вызывать после listen в отдельном try/catch: ошибка пишется в лог и не завершает процесс. process.exit(1) оставить только для ошибки самого listen.

2. apps/api/src/routes/health.ts
   - GET /health отвечает { ok: true } и не трогает базу и Telegram. Проверить, что так и есть, и не менять, если так.

3. apps/api/src/prisma.ts
   - Использовать только process.env.DATABASE_URL. DIRECT_URL убрать из рантайма: он нужен только Prisma для миграций (directUrl в schema.prisma остаётся).

4. prisma/schema.prisma
   - В generator client добавить binaryTargets = ["native", "rhel-openssl-3.0.x"].

5. Корневой package.json
   - Добавить "postinstall": "prisma generate" в scripts, чтобы Prisma Client создавался при установке зависимостей на Vercel. Остальные скрипты не менять.

6. apps/api/src/app.ts, CORS
   - CORS_ORIGIN из env должен дополняться, а не заменяться: всегда добавлять http://localhost:3000, http://localhost:3010, http://localhost:5173, http://127.0.0.1:3000, http://127.0.0.1:5173. Дубли убрать.
   - Разрешённые заголовки: content-type и authorization. Credentials оставить.

7. apps/miniapp/src/api.ts
   - В функции request: если задан import.meta.env.VITE_API_URL, перед path подставлять этот origin без слэша в конце. Без переменной путь остаётся относительным, прокси Vite в vite.config.ts не менять.
   - Добавить типы для import.meta.env, если их нет (vite-env.d.ts).

8. .env.example в корне
   - Добавить пустые строки: API_PROXY_URL, NEXT_PUBLIC_API_URL, VITE_API_URL с комментарием, что это адреса API на проде. Реальные значения не писать.

Не менять: moduleResolution Bundler, импорты без .js, build-скрипты TypeScript, apps/web/next.config.ts, прокси apps/web/src/app/api/v1/[...path]/route.ts (читает API_PROXY_URL), apps/web/src/lib/catalog.ts (читает NEXT_PUBLIC_API_URL). Polling для Telegram не добавлять: бот остаётся на POST /telegram/webhook.

Проверки из корня: npx prisma generate, npm run lint -w api, npm test -w api, npm run lint -w miniapp, npm run lint -w web.
Живой /health не проверяй, деплой успешным не называй. Если проверка не выполнима, напиши какая и почему.

В конце выведи список изменённых файлов и по одной строке, зачем.
```

---

## Часть 2. Шаги на других площадках

### 1. GitHub

1. Создать пустой репозиторий (без README).
2. Локально выполнить `git remote add origin <url>` и `git push -u origin main`.
3. Открыть репозиторий на GitHub и убедиться, что файла `.env` там нет.

### 2. Vercel: проект API

1. Add New → Project, выбрать репозиторий.
2. **Root Directory:** `apps/api`.
3. **Framework Preset:** Fastify. Entrypoint `src/index.ts` Vercel найдёт сам.
4. Включить **Include source files outside of the Root Directory in the Build Step**.
5. Environment Variables (значения из локального `.env`):
   - `DATABASE_URL` — порт `6543`, `pgbouncer=true`
   - `DIRECT_URL` — порт `5432`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_BOT_USERNAME`
   - `TELEGRAM_WEBHOOK_SECRET` — длинная случайная строка
   - `CRON_SECRET`
6. Deploy.
7. Открыть `https://<api>/health`: ждём `{"ok":true}`. Затем `https://<api>/api/v1/services`: ждём список услуг.
8. Записать адрес API.

### 3. Vercel: проект сайта

1. Add New → Project, тот же репозиторий.
2. **Root Directory:** `apps/web`, **Framework Preset:** Next.js.
3. Environment Variables:
   - `API_PROXY_URL` = адрес API без слэша в конце
   - `NEXT_PUBLIC_API_URL` = тот же адрес
4. Deploy.
5. Открыть сайт: должны быть услуги и барберы из базы.
6. Записать адрес сайта.

### 4. Vercel: проект Mini App

1. Add New → Project, тот же репозиторий.
2. **Root Directory:** `apps/miniapp`, **Framework Preset:** Vite, **Output Directory:** `dist`.
3. Environment Variable: `VITE_API_URL` = адрес API без слэша в конце.
4. Deploy.
5. Записать адрес Mini App.

### 5. Vercel: связка адресов (проект API)

Добавить переменные и сделать **Redeploy**:

| Переменная | Значение |
|---|---|
| `APP_URL` | адрес сайта |
| `MINIAPP_URL` | адрес Mini App |
| `CORS_ORIGIN` | адрес сайта и адрес Mini App через запятую, без слэшей |
| `TELEGRAM_WEBHOOK_URL` | `https://<api>/telegram/webhook` |

Если менялись переменные сайта или Mini App, пересобрать и их: значения `NEXT_PUBLIC_*` и `VITE_*` попадают в сборку.

### 6. BotFather

1. `/mybots` → бот → Bot Settings → Menu Button (или Configure Mini App).
2. Указать адрес проекта **Mini App** (не адрес API).

### 7. Webhook Telegram (локально)

1. В локальном `.env` вписать `TELEGRAM_WEBHOOK_URL` и тот же `TELEGRAM_WEBHOOK_SECRET`, что на Vercel.
2. Выполнить `npm run bot:webhook`. Ждём в консоли `Webhook: https://...`.
3. Вернуть `.env` к локальным значениям, если нужно.

### 8. Supabase

1. Проверить, что `CRON_SECRET` на Vercel совпадает с тем, что лежит в Supabase (Vault / Edge Function).
2. Database → Cron: задача `notifications` активна.
3. Edge Functions → `notifications` → Logs: вызовы без ошибок.

### 9. Проверка

- [ ] Сайт: услуга → барбер → слот → запись сохраняется
- [ ] Повторная запись на тот же слот → `SLOT_TAKEN`
- [ ] `/booking/[token]`: отмена и перенос
- [ ] Админка: вход, список записей
- [ ] Бот: `/start`, сообщение о записи
- [ ] Mini App открывается из Telegram, не из браузера (иначе `UNAUTHORIZED`)
- [ ] Напоминание приходит один раз
- [ ] Сайт и админка читаются с телефона

### Если снова 500

Vercel → проект API → Deployments → последний → **Logs**. Скопировать текст ошибки: «Внутренняя ошибка» в ответе API ничего не показывает, настоящая причина только в логах.
