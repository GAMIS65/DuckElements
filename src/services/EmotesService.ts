import { Context, Layer, Ref, Effect } from "effect";
import * as Option from "effect/Option";
import { Database, DatabaseError } from "./Database.ts";
import { emotesTable } from "../db/schema.ts";
import { eq, sql } from "drizzle-orm";

type EmoteId = string;
type EmoteName = string;
type ChannelId = string;

type Emote = Readonly<{
  id: EmoteId;
  name: EmoteName;
  url: string;
  channelId: ChannelId;
}>;

type EmoteCacheEntry = Readonly<{
  name: EmoteName;
  id: EmoteId;
}>;

interface EmoteRegistry {
  readonly addToCache: (entries: ReadonlyArray<EmoteCacheEntry>) => Effect.Effect<void>;
  readonly addToDb: (entries: ReadonlyArray<Emote>) => Effect.Effect<void, DatabaseError>;
  readonly get: (name: EmoteName) => Effect.Effect<Option.Option<EmoteId>>;
  readonly remove: (name: EmoteName) => Effect.Effect<void>;
  readonly getAll: () => Effect.Effect<ReadonlyMap<EmoteName, EmoteId>>;
  readonly incrementUseCount: (id: EmoteId) => Effect.Effect<void, DatabaseError>;
}

export class EmoteRegistryService extends Context.Tag("EmoteRegistryService")<
  EmoteRegistryService,
  EmoteRegistry
>() {}

export const EmoteRegistryLive = Layer.effect(
  EmoteRegistryService,
  Effect.gen(function* () {
    const db = yield* Database;
    const ref = yield* Ref.make(new Map<EmoteName, EmoteId>());

    return {
      addToCache: (entries) =>
        Ref.update(ref, (map) => {
          const next = new Map(map);
          for (const { name, id } of entries) {
            next.set(name, id);
          }
          return next;
        }),

      addToDb: (entries) =>
        Effect.tryPromise({
          try: async () => {
            await Promise.all(
              entries.map((entry) =>
                db
                  .insert(emotesTable)
                  .values({
                    name: entry.name,
                    id: entry.id,
                    url: entry.url,
                    streamerTwitchId: entry.channelId,
                    platform: "SevenTV",
                  })
                  .onConflictDoUpdate({
                    target: emotesTable.id,
                    set: {
                      name: entry.name,
                      url: entry.url,
                    },
                  }),
              ),
            );
          },
          catch: (error) =>
            new DatabaseError({
              reason: "Failed to upsert emote",
              cause: error,
            }),
        }).pipe(Effect.asVoid),

      get: (name) => Ref.get(ref).pipe(Effect.map((map) => Option.fromNullable(map.get(name)))),

      remove: (name) =>
        Ref.update(ref, (map) => {
          const next = new Map(map);
          next.delete(name);
          return next;
        }),

      getAll: () => Ref.get(ref),

      incrementUseCount: (id) =>
        Effect.tryPromise({
          try: async () =>
            await db
              .update(emotesTable)
              .set({
                usecount: sql`${emotesTable.usecount} + 1`,
              })
              .where(eq(emotesTable.id, id)),
          catch: (error) =>
            new DatabaseError({
              reason: "Failed to increment emote usage count",
              cause: error,
            }),
        }).pipe(Effect.asVoid),
    };
  }),
);
