import Anthropic from "@anthropic-ai/sdk";
import { Bot, type Context } from "grammy";
import { ask } from "./claude.ts";
import { config } from "./config.ts";
import { clearHistory, loadHistory, saveHistory } from "./history.ts";

type ContentBlock = Anthropic.Beta.BetaContentBlockParam;

const TELEGRAM_MESSAGE_LIMIT = 4000;
// Bot API не отдаёт ботам файлы больше 20 МБ.
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const TEXT_EXTENSIONS = new Set([".txt", ".csv", ".md", ".json", ".xml", ".log", ".tsv"]);

class UserFacingError extends Error {}

const bot = new Bot(config.telegramToken);

// Бот работает только в личных сообщениях и только для сотрудников из списка.
const dm = bot.chatType("private");

dm.command("start", (ctx) =>
  ctx.reply(
    isAllowed(ctx)
      ? "Здравствуйте! Пришлите вопрос, фото, PDF или текстовый файл — отвечу.\n\n/new — начать новый диалог (забыть переписку)."
      : accessDeniedText(ctx),
  ),
);

dm.command("id", (ctx) => ctx.reply(`Ваш Telegram ID: ${ctx.from.id}`));

dm.use(async (ctx, next) => {
  if (!isAllowed(ctx)) {
    await ctx.reply(accessDeniedText(ctx));
    return;
  }
  await next();
});

dm.command("new", async (ctx) => {
  await clearHistory(ctx.from.id);
  await ctx.reply("Начали новый диалог. Предыдущую переписку я забыл.");
});

dm.on(["message:text", "message:photo", "message:document"], (ctx) =>
  enqueue(ctx.from.id, () => handleMessage(ctx)),
);

dm.on("message", (ctx) =>
  ctx.reply("Я понимаю текст, фото, PDF и текстовые файлы (txt, csv, md, json)."),
);

function isAllowed(ctx: Context): boolean {
  return ctx.from !== undefined && config.allowedUserIds.has(ctx.from.id);
}

function accessDeniedText(ctx: Context): string {
  return `У вас нет доступа к боту. Передайте администратору ваш Telegram ID: ${ctx.from?.id}`;
}

// Сообщения одного сотрудника обрабатываются по очереди, чтобы не перепутать историю.
const queues = new Map<number, Promise<void>>();

function enqueue(userId: number, task: () => Promise<void>): void {
  const previous = queues.get(userId) ?? Promise.resolve();
  const current = previous.then(task, task).finally(() => {
    if (queues.get(userId) === current) queues.delete(userId);
  });
  queues.set(userId, current);
}

async function handleMessage(ctx: Context): Promise<void> {
  const userId = ctx.from!.id;
  const typing = keepTyping(ctx);
  try {
    const content = await buildContent(ctx);
    const history = await loadHistory(userId);
    history.push({ role: "user", content });

    const answer = await ask(history);
    if (answer.refused) {
      // Не сохраняем вопрос, на который модель отказалась отвечать.
      await ctx.reply("С этим запросом я помочь не могу.");
      return;
    }
    const text = answer.text || "Не получилось сформулировать ответ, попробуйте переформулировать вопрос.";
    history.push({ role: "assistant", content: text });
    await saveHistory(userId, history);
    for (const part of splitMessage(text)) {
      await ctx.reply(part);
    }
  } catch (error) {
    await ctx.reply(errorText(error));
  } finally {
    clearInterval(typing);
  }
}

async function buildContent(ctx: Context): Promise<ContentBlock[]> {
  const message = ctx.message!;
  const caption = message.caption ?? message.text ?? "";
  const blocks: ContentBlock[] = [];

  if (message.photo) {
    const photo = message.photo[message.photo.length - 1];
    const data = await downloadFile(photo.file_id, photo.file_size);
    blocks.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: data.toString("base64") },
    });
  } else if (message.document) {
    blocks.push(await documentBlock(message.document));
  }

  blocks.push({
    type: "text",
    text: caption || (blocks.length > 0 ? "Разбери вложение." : "(пустое сообщение)"),
  });
  return blocks;
}

async function documentBlock(document: {
  file_id: string;
  file_size?: number;
  file_name?: string;
  mime_type?: string;
}): Promise<ContentBlock> {
  const name = document.file_name ?? "файл";
  const mime = document.mime_type ?? "";
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";

  if (mime === "application/pdf") {
    const data = await downloadFile(document.file_id, document.file_size);
    return {
      type: "document",
      title: name,
      source: { type: "base64", media_type: "application/pdf", data: data.toString("base64") },
    };
  }
  if (IMAGE_TYPES.has(mime)) {
    const data = await downloadFile(document.file_id, document.file_size);
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: data.toString("base64"),
      },
    };
  }
  if (mime.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) {
    const data = await downloadFile(document.file_id, document.file_size);
    return { type: "text", text: `Файл «${name}»:\n\n${data.toString("utf8")}` };
  }
  throw new UserFacingError(
    `Формат файла «${name}» я пока не читаю. Пришлите PDF, фото или текстовый файл (txt, csv, md, json). Документы Word и Excel можно сохранить как PDF.`,
  );
}

async function downloadFile(fileId: string, size: number | undefined): Promise<Buffer> {
  if (size !== undefined && size > MAX_FILE_BYTES) {
    throw new UserFacingError("Файл больше 20 МБ — Telegram не даёт ботам скачивать такие файлы.");
  }
  const file = await bot.api.getFile(fileId);
  const response = await fetch(
    `https://api.telegram.org/file/bot${config.telegramToken}/${file.file_path}`,
  );
  if (!response.ok) {
    throw new Error(`Не удалось скачать файл из Telegram: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function keepTyping(ctx: Context): NodeJS.Timeout {
  const send = () => ctx.replyWithChatAction("typing").catch(() => {});
  send();
  return setInterval(send, 4000);
}

function splitMessage(text: string): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > TELEGRAM_MESSAGE_LIMIT) {
    let cut = rest.lastIndexOf("\n", TELEGRAM_MESSAGE_LIMIT);
    if (cut < TELEGRAM_MESSAGE_LIMIT / 2) cut = TELEGRAM_MESSAGE_LIMIT;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

function errorText(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  console.error(error);
  if (error instanceof Anthropic.RateLimitError) {
    return "Сейчас слишком много запросов. Попробуйте через минуту.";
  }
  if (error instanceof Anthropic.BadRequestError) {
    return "Не получилось обработать запрос: возможно, файл слишком большой или переписка слишком длинная. Попробуйте /new и отправьте снова.";
  }
  return "Произошла ошибка. Попробуйте ещё раз чуть позже.";
}

bot.catch((error) => console.error("Ошибка бота:", error.error));

if (config.allowedUserIds.size === 0) {
  console.warn("ALLOWED_USER_IDS пуст: бот никому не будет отвечать, только сообщит ID.");
}
console.log("Бот запущен.");
await bot.start();
