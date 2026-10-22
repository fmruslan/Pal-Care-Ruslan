import { randomUUID } from "node:crypto";
import {
  CareError,
  type CareTurn,
  type Conversation,
  type TurnInput,
} from "./contracts";

export interface ConversationStore {
  create(owner: string): Promise<Conversation>;
  get(id: string, owner: string): Promise<Conversation>;
  clear(id: string, owner: string): Promise<void>;
  claim(id: string, owner: string, input: TurnInput): Promise<CareTurn | null>;
  finish(id: string, owner: string, turn: CareTurn): Promise<void>;
}
type Entry = Conversation & { owner: string; pending?: string };

// Credential-free preview only. No paid inference is allowed with this store.
export class MemoryStore implements ConversationStore {
  private entries = new Map<string, Entry>();
  private counts = new Map<string, { minute: number; count: number }>();
  async create(owner: string) {
    const now = Date.now();
    for (const [id, entry] of this.entries)
      if (Date.parse(entry.expiresAt) <= now) this.entries.delete(id);
    if (
      this.entries.size >= 500 ||
      [...this.entries.values()].filter((e) => e.owner === owner).length >= 5
    )
      throw new CareError("careos_limit", 429);
    const entry = {
      id: randomUUID(),
      owner,
      expiresAt: new Date(now + 86400000).toISOString(),
      turns: [],
    };
    this.entries.set(entry.id, entry);
    return this.get(entry.id, owner);
  }
  async get(id: string, owner: string): Promise<Conversation> {
    const entry = this.entries.get(id);
    if (
      !entry ||
      entry.owner !== owner ||
      Date.parse(entry.expiresAt) <= Date.now()
    )
      throw new CareError("careos_conversation_not_found", 404);
    return { id: entry.id, expiresAt: entry.expiresAt, turns: entry.turns };
  }
  async clear(id: string, owner: string) {
    await this.get(id, owner);
    this.entries.delete(id);
  }
  async claim(id: string, owner: string, input: TurnInput) {
    const conversation = await this.get(id, owner);
    const prior = conversation.turns.find(
      (t) => t.requestId === input.requestId,
    );
    if (prior) return prior;
    const entry = this.entries.get(id)!;
    if (entry.pending) throw new CareError("careos_turn_in_progress", 409);
    if (entry.turns.length >= 40)
      throw new CareError("careos_conversation_full", 429);
    const minute = Math.floor(Date.now() / 60000);
    const count = this.counts.get(owner);
    if (count?.minute === minute && count.count >= 6)
      throw new CareError("careos_limit", 429);
    if (this.counts.size > 1000) this.counts.clear();
    this.counts.set(owner, {
      minute,
      count: count?.minute === minute ? count.count + 1 : 1,
    });
    entry.pending = input.requestId;
    return null;
  }
  async finish(id: string, owner: string, turn: CareTurn) {
    await this.get(id, owner);
    const entry = this.entries.get(id)!;
    if (entry.pending !== turn.requestId)
      throw new CareError("careos_request_conflict", 409);
    entry.turns.push(turn);
    entry.pending = undefined;
  }
}
