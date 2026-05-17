import { Effect, Context, Layer } from "effect";
import { channelsTable } from "../db/schema.ts";
import { Database, DatabaseError } from "./Database.ts";

export class ChannelService extends Context.Tag("ChannelService")<
  ChannelService,
  {
    readonly upsertChannel: (
      channelId: string,
      channelName: string,
    ) => Effect.Effect<void, DatabaseError>;
  }
>() {}

export const ChannelServiceLive = Layer.effect(
  ChannelService,
  Effect.gen(function* () {
    const db = yield* Database;

    return ChannelService.of({
      upsertChannel: (channelId, channelName) =>
        Effect.tryPromise({
          try: async () =>
            db
              .insert(channelsTable)
              .values({ twitchId: channelId, name: channelName })
              .onConflictDoNothing(),
          catch: (e) => new DatabaseError({ reason: "Failed to upsert channel", cause: e }),
        }).pipe(Effect.asVoid),
    });
  }),
);
