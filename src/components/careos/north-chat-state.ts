import { z } from "zod";
import { careContextSchema, type CareTurn } from "@/lib/careos/contracts";

export const northChatsKey = "palcare-north-chats-v1";
export const northChatLimit = 30;
const chatSchema = z.strictObject({
  id: z.uuid(),
  title: z.string().max(100),
  preview: z.string().max(180),
  context: careContextSchema.nullable(),
  explicit: z.boolean(),
  draft: z.string().max(2000),
  activeResultId: z.uuid().nullable(),
  order: z.array(z.uuid()).max(80),
  dismissed: z.array(z.uuid()).max(80),
  channels: z.strictObject({
    care: z.uuid().nullable(),
    records: z.uuid().nullable(),
    insights: z.array(z.uuid()).max(40),
  }),
  updatedAt: z.number().int().nonnegative(),
});
const indexSchema = z.strictObject({
  version: z.literal(1),
  activeChatId: z.uuid().nullable(),
  chats: z.array(chatSchema).max(northChatLimit),
});
export type NorthChat = z.infer<typeof chatSchema>;

/** A pre-index, never-dispatched hint may arrive beside a prepared draft. Only
 * an empty backend-free chat can adopt unclaimed UUIDs; other chats keep theirs.
 * This indexes existing editors, never copies answers or authorizes a send. */
export function adoptUnclaimedNorthHints(
  chat: NorthChat,
  chats: NorthChat[],
  requestIds: string[],
): NorthChat {
  if (
    chat.order.length ||
    chat.channels.care ||
    chat.channels.records ||
    chat.channels.insights.length
  )
    return chat;
  const claimed = new Set(chats.flatMap((value) => value.order));
  const order = [
    ...new Set(
      requestIds.filter(
        (id) => !claimed.has(id) && z.uuid().safeParse(id).success,
      ),
    ),
  ].slice(-80);
  return order.length ? { ...chat, order } : chat;
}

/** Bounded presentation metadata only; all answer content is restored by owned GET. */
export function readNorthChats(raw: string | null, now = Date.now()) {
  if (!raw || raw.length > 200000) return null;
  try {
    const index = indexSchema.parse(JSON.parse(raw));
    if (new Set(index.chats.map((chat) => chat.id)).size !== index.chats.length)
      return null;
    const chats = index.chats.filter(
      (chat) => chat.updatedAt <= now && now - chat.updatedAt < 86400000,
    );
    return {
      ...index,
      chats,
      activeChatId: chats.some((chat) => chat.id === index.activeChatId)
        ? index.activeChatId
        : null,
    };
  } catch {
    return null;
  }
}

export function chatSummary(turns: CareTurn[], draft = "") {
  const compact = (text: string, limit: number) =>
    text.replace(/\s+/g, " ").trim().slice(0, limit);
  return {
    title: compact(turns[0]?.message || draft || "New chat", 100),
    preview: compact(
      turns.at(-1)?.message || draft || "No questions sent yet",
      180,
    ),
  };
}

export function rememberNorthChat(chats: NorthChat[], chat: NorthChat) {
  const previous = chats.find((value) => value.id === chat.id);
  if (
    previous &&
    JSON.stringify({ ...previous, updatedAt: 0 }) ===
      JSON.stringify({ ...chat, updatedAt: 0 })
  )
    return chats;
  const next = [chat, ...chats.filter((value) => value.id !== chat.id)]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, northChatLimit);
  while (
    JSON.stringify({ version: 1, activeChatId: chat.id, chats: next }).length >
    200000
  )
    next.pop();
  return next;
}
