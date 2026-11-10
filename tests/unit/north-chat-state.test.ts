import { describe, expect, it } from "vitest";
import {
  chatSummary,
  northChatLimit,
  readNorthChats,
  rememberNorthChat,
  type NorthChat,
} from "../../src/components/careos/north-chat-state";
import { contextOf, type CareTurn } from "../../src/lib/careos/contracts";
import { demoData } from "../../src/lib/demo/fixtures";

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context = contextOf({
  twin: demoData.twins[0],
  product: demoData.products[0],
});
const chat: NorthChat = {
  id: uuid(1),
  title: "Find my receipt",
  preview: "Only the dated headphones",
  context,
  explicit: true,
  draft: "Keep this exact\ndraft.",
  activeResultId: uuid(2),
  order: [uuid(2)],
  dismissed: [],
  channels: { care: uuid(3), records: uuid(4), insights: [uuid(7)] },
  updatedAt: 1000,
};
const index = { version: 1, activeChatId: chat.id, chats: [chat] };

describe("bounded North chat metadata", () => {
  it("preserves each chat's exact context, draft, result and independent channel IDs", () => {
    expect(readNorthChats(JSON.stringify(index), 2000)).toEqual(index);
    const second = {
      ...chat,
      id: uuid(5),
      context: null,
      draft: "Another draft",
      channels: { care: null, records: uuid(6), insights: [] },
    };
    const saved = rememberNorthChat([chat], second);
    expect(saved).toHaveLength(2);
    expect(saved.find((value) => value.id === chat.id)).toEqual(chat);
    expect(saved.find((value) => value.id === second.id)).toEqual(second);
  });

  it("never accepts a transcript, provider plan, token or accounting grant", () => {
    for (const injection of [
      { turns: [] },
      { history: [] },
      { token: "not-a-secret" },
      { remaining: 300 },
      { plan: {} },
    ]) {
      expect(
        readNorthChats(
          JSON.stringify({ ...index, chats: [{ ...chat, ...injection }] }),
          2000,
        ),
      ).toBeNull();
    }
    expect(
      readNorthChats(JSON.stringify({ ...index, turns: [] }), 2000),
    ).toBeNull();
    expect(
      readNorthChats(
        JSON.stringify({
          ...index,
          chats: [
            {
              ...chat,
              channels: { ...chat.channels, care: "../../other-owner" },
            },
          ],
        }),
        2000,
      ),
    ).toBeNull();
  });

  it("expires hints after 24 hours and never restores a dangling active selection", () => {
    expect(readNorthChats(JSON.stringify(index), 999)?.activeChatId).toBeNull();
    expect(
      readNorthChats(JSON.stringify(index), 1000 + 86400000)?.chats,
    ).toEqual([]);
    expect(
      readNorthChats(JSON.stringify({ ...index, activeChatId: uuid(9) }), 2000)
        ?.activeChatId,
    ).toBeNull();
    expect(
      readNorthChats(JSON.stringify({ ...index, chats: [chat, chat] }), 2000),
    ).toBeNull();
  });

  it("bounds index, text and raw storage without storing answers", () => {
    const chats = Array.from({ length: northChatLimit }, (_, n) => ({
      ...chat,
      id: uuid(n + 10),
      updatedAt: n,
    }));
    const newest = { ...chat, id: uuid(99), updatedAt: 2000 };
    const bounded = rememberNorthChat(chats, newest);
    expect(bounded).toHaveLength(northChatLimit);
    expect(bounded[0]).toEqual(newest);
    expect(chats).toHaveLength(northChatLimit);
    expect(readNorthChats(" ".repeat(200001), 2000)).toBeNull();
    for (const change of [
      { draft: "x".repeat(2001) },
      { preview: "x".repeat(181) },
      { order: Array(81).fill(uuid(2)) },
    ]) {
      expect(
        readNorthChats(
          JSON.stringify({ ...index, chats: [{ ...chat, ...change }] }),
          2000,
        ),
      ).toBeNull();
    }
  });

  it("does not churn timestamps or reorder chats for unchanged presentation", () => {
    const original = [chat];
    expect(rememberNorthChat(original, { ...chat, updatedAt: 2000 })).toBe(
      original,
    );
  });

  it("uses bounded meaningful user text, never answer content, for previews", () => {
    const turns = [
      {
        message: "Find my\nreceipt",
        answer: { text: "Must not be persisted" },
      },
      { message: "Only Audio" },
    ] as CareTurn[];
    expect(chatSummary(turns)).toEqual({
      title: "Find my receipt",
      preview: "Only Audio",
    });
    expect(chatSummary([], "  Keep\nmy draft  ")).toEqual({
      title: "Keep my draft",
      preview: "Keep my draft",
    });
    expect(chatSummary([], "x".repeat(2000)).title).toHaveLength(100);
    expect(chatSummary([], "x".repeat(2000)).preview).toHaveLength(180);
  });
});
