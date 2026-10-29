function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Не задана переменная окружения ${name}`);
  }
  return value;
}

export const config = {
  telegramToken: required("TELEGRAM_BOT_TOKEN"),
  // Telegram ID сотрудников, которым разрешено писать боту.
  allowedUserIds: new Set(
    (process.env.ALLOWED_USER_IDS ?? "")
      .split(",")
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isInteger(id) && id > 0),
  ),
  dataDir: process.env.DATA_DIR?.trim() || "./data",
  // Сколько последних сообщений диалога бот помнит.
  maxHistoryMessages: Number(process.env.MAX_HISTORY_MESSAGES) || 30,
};
