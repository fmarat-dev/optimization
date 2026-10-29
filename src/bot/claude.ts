import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "./history.ts";

const client = new Anthropic();

const SYSTEM_PROMPT = `Ты — ассистент для сотрудников компании «Камснаб». Сотрудники пишут тебе в Telegram:
задают рабочие вопросы, присылают фото, PDF и текстовые файлы и просят их разобрать.

Как отвечать:
- Отвечай на языке вопроса, по умолчанию по-русски.
- Пиши по делу и коротко, подробнее — только если просят или задача этого требует.
- Ответ показывается в Telegram как обычный текст: не используй Markdown-разметку
  (**, #, таблицы). Для списков используй «-» или нумерацию.
- Если в присланном файле или фото чего-то не видно или не хватает данных — так и скажи,
  не придумывай.`;

export type Answer = { text: string; refused: boolean };

export async function ask(messages: Message[]): Promise<Answer> {
  const response = await client.beta.messages
    .stream({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium" },
      // Если основная модель откажется отвечать, запрос автоматически повторится на запасной.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: SYSTEM_PROMPT,
      messages,
    })
    .finalMessage();

  if (response.stop_reason === "refusal") {
    return { text: "", refused: true };
  }
  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return { text, refused: false };
}
