import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.ts";

export type Message = Anthropic.Beta.BetaMessageParam;

const historyDir = path.join(config.dataDir, "history");

function fileFor(userId: number): string {
  return path.join(historyDir, `${userId}.json`);
}

export async function loadHistory(userId: number): Promise<Message[]> {
  try {
    return JSON.parse(await readFile(fileFor(userId), "utf8")) as Message[];
  } catch {
    return [];
  }
}

export async function saveHistory(userId: number, messages: Message[]): Promise<void> {
  let trimmed = messages.slice(-config.maxHistoryMessages);
  // Диалог для API должен начинаться с сообщения пользователя.
  while (trimmed.length > 0 && trimmed[0].role !== "user") {
    trimmed = trimmed.slice(1);
  }
  await mkdir(historyDir, { recursive: true });
  await writeFile(fileFor(userId), JSON.stringify(trimmed));
}

export async function clearHistory(userId: number): Promise<void> {
  await rm(fileFor(userId), { force: true });
}
