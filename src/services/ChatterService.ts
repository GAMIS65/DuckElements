import { Effect, Context, Layer } from "effect";
import { eq, sql, and, desc } from "drizzle-orm";
import { messagesTable, chattersTable, channelsTable } from "../db/schema.ts";
import type { TwitchMessage } from "../util/messageparser.ts";
import { Database, DatabaseError } from "./Database.ts";

export class ChatterService extends Context.Tag("ChatterService")<
  ChatterService,
  {
    readonly upsertChatter: (
      channelId: string,
      twitchId: string,
      username: string,
    ) => Effect.Effect<{ id: string }, DatabaseError>;
    readonly insertMessage: (
      channelId: string,
      userId: string,
      message: TwitchMessage,
      twitchUserId: string,
    ) => Effect.Effect<void, DatabaseError>;
    readonly getChatterChatMessages: (
      channelId: string,
      twitchId: string,
      limit?: number,
      offset?: number,
    ) => Effect.Effect<
      ReadonlyArray<{ readonly id: string; readonly message: string; readonly timestamp: string }>,
      DatabaseError
    >;
  }
>() {}

export const ChatterServiceLive = Layer.effect(
  ChatterService,
  Effect.gen(function* () {
    const db = yield* Database;

    return ChatterService.of({
      upsertChatter: (channelId, userId, username) =>
        Effect.tryPromise({
          try: async () => {
            const result = await db
              .insert(chattersTable)
              .values({ id: crypto.randomUUID(), twitchId: userId, channelId, username })
              .onConflictDoUpdate({
                target: [chattersTable.twitchId, chattersTable.channelId],
                set: { messageCount: sql`${chattersTable.messageCount} + 1` },
              })
              .returning({ id: chattersTable.id });

            await db
              .update(channelsTable)
              .set({ totalMessages: sql`${channelsTable.totalMessages} + 1` })
              .where(eq(channelsTable.twitchId, channelId));

            return result[0]!;
          },
          catch: (e) => new DatabaseError({ reason: "Failed to upsert chatter", cause: e }),
        }),

      insertMessage: (channelId, userId, message, twitchUserId) =>
        Effect.tryPromise({
          try: async () =>
            db.insert(messagesTable).values({
              id: crypto.randomUUID(),
              channelId,
              userId,
              twitchId: twitchUserId,
              message: message.message,
              timestamp: new Date().toISOString(),
            }),
          catch: (e) => new DatabaseError({ reason: "Failed to insert message", cause: e }),
        }).pipe(Effect.asVoid),

      getChatterChatMessages: (channelId, twitchId, limit = 100, offset = 0) =>
        Effect.tryPromise({
          try: async () =>
            db
              .select()
              .from(messagesTable)
              .where(
                and(eq(messagesTable.channelId, channelId), eq(messagesTable.twitchId, twitchId)),
              )
              .orderBy(desc(messagesTable.timestamp))
              .limit(limit)
              .offset(offset),
          catch: (e) => new DatabaseError({ reason: "Failed to fetch chatter messages", cause: e }),
        }),
    });
  }),
);
