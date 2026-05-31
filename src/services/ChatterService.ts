import { Effect, Context, Layer } from "effect";
import { eq, sql, and, desc } from "drizzle-orm";
import { messagesTable, chattersTable, streamersTable } from "../db/schema.ts";
import type { TwitchMessage } from "../util/messageparser.ts";
import { Database, DatabaseError } from "./Database.ts";

interface IChatterService {
  readonly upsertChatter: (
    streamerTwitchId: string,
    twitchId: string,
    username: string,
  ) => Effect.Effect<{ id: string }, DatabaseError>;

  readonly insertMessage: (
    streamerTwitchId: string,
    userId: string,
    message: TwitchMessage,
    timestamp?: string,
  ) => Effect.Effect<void, DatabaseError>;

  readonly getChatterChatMessages: (
    streamerTwitchId: string,
    userTwitchId: string,
    limit?: number,
    offset?: number,
  ) => Effect.Effect<
    ReadonlyArray<{
      readonly id: string;
      readonly message: string;
      readonly timestamp: string;
    }>,
    DatabaseError
  >;
}

export class ChatterService extends Context.Tag("ChatterService")<
  ChatterService,
  IChatterService
>() {}

export const ChatterServiceLive = Layer.effect(
  ChatterService,
  Effect.gen(function* () {
    const db = yield* Database;

    return ChatterService.of({
      upsertChatter: (streamerTwitchId, userTwitchId, username) =>
        Effect.tryPromise({
          try: async () => {
            const result = await db
              .insert(chattersTable)
              .values({
                id: crypto.randomUUID(),
                userTwitchId: userTwitchId,
                streamerTwitchId: streamerTwitchId,
                username,
              })
              .onConflictDoUpdate({
                target: [chattersTable.userTwitchId, chattersTable.streamerTwitchId],
                set: { messageCount: sql`${chattersTable.messageCount} + 1` },
              })
              .returning({ id: chattersTable.id });

            await db
              .update(streamersTable)
              .set({ totalMessages: sql`${streamersTable.totalMessages} + 1` })
              .where(eq(streamersTable.twitchId, streamerTwitchId));

            return result[0]!;
          },
          catch: (e) => new DatabaseError({ reason: "Failed to upsert chatter", cause: e }),
        }),

      insertMessage: (channelId, userId, message, timestamp) =>
        Effect.tryPromise({
          try: async () =>
            await db.insert(messagesTable).values({
              id: message.tags.id,
              streamerTwitchId: channelId,
              userId,
              userTwitchId: message.tags.userId,
              message: message.message,
              timestamp: timestamp ?? new Date().toISOString(),
              badgeInfo: message.tags.badgeInfo,
              badges: message.tags.badges,
              color: message.tags.color,
            }),
          catch: (e) => new DatabaseError({ reason: "Failed to insert message", cause: e }),
        }).pipe(Effect.asVoid),

      getChatterChatMessages: (streamerTwitchId, userTwitchId, limit = 100, offset = 0) =>
        Effect.tryPromise({
          try: async () =>
            await db
              .select()
              .from(messagesTable)
              .where(
                and(
                  eq(messagesTable.streamerTwitchId, streamerTwitchId),
                  eq(messagesTable.userTwitchId, userTwitchId),
                ),
              )
              .orderBy(desc(messagesTable.timestamp))
              .limit(limit)
              .offset(offset),
          catch: (e) => new DatabaseError({ reason: "Failed to fetch chatter messages", cause: e }),
        }),
    });
  }),
);
