# Оптимизация

Проект для задач по оптимизации Kamsnab.

## Telegram-бот для сотрудников

Сотрудники пишут боту в личные сообщения — вопрос, фото, PDF или текстовый файл
(txt, csv, md, json), — бот отвечает с помощью Claude. Бот помнит последние сообщения
каждого сотрудника, поэтому можно уточнять. Команда `/new` начинает диалог заново.

Отвечает только сотрудникам из списка `ALLOWED_USER_IDS`. Остальным бот присылает их
Telegram ID, чтобы его можно было передать администратору.

### Запуск

1. Создайте бота у [@BotFather](https://t.me/BotFather) (`/newbot`) и скопируйте токен.
2. Получите ключ Claude API на https://platform.claude.com/settings/keys.
3. Скопируйте `.env.example` в `.env` и заполните.
4. Запустите:

   ```sh
   docker compose up -d --build
   ```

   или без Docker (нужен Node.js 22.18+):

   ```sh
   pnpm install
   pnpm bot
   ```

5. Каждый сотрудник пишет боту `/id` и присылает ID вам; добавьте ID в `ALLOWED_USER_IDS`
   через запятую и перезапустите бота (`docker compose up -d`).

История переписки хранится в папке `data/`.

### Автодеплой на сервер сайта

Workflow `.github/workflows/deploy.yml` при каждом пуше в `main` копирует файлы бота
на сервер по SSH и перезапускает контейнер. Сайт и его `docker compose` он не трогает.

Один раз:

1. В репозитории `optimization` → Settings → Secrets and variables → Actions добавьте
   те же секреты, что у `kamsnab`: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` и, если порт
   не 22, `VPS_PORT`. Необязательно: `BOT_DEPLOY_PATH` (по умолчанию
   `/opt/kamsnab-assistant-bot`).
2. На сервере создайте папку и `.env`:

   ```sh
   mkdir -p /opt/kamsnab-assistant-bot && cd /opt/kamsnab-assistant-bot
   nano .env   # содержимое — по образцу .env.example
   ```

3. Запустите деплой: пуш в `main` или Actions → Deploy bot to VPS → Run workflow.

### Код

- `src/bot/main.ts` — обработка сообщений Telegram, файлы, доступ.
- `src/bot/claude.ts` — запрос к Claude и системная инструкция для бота.
- `src/bot/history.ts` — память переписки.
- `src/bot/config.ts` — настройки из переменных окружения.

## Прочее

- `src/index.ts` — утилиты для замеров (`measure`).

```sh
pnpm typecheck
```
