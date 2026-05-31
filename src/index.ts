import { Effect, Stream, Layer } from "effect";
import { TwitchChatLive, TwitchIRC } from "./services/TwitchIRC.ts";
import { HttpApiLive } from "./services/HttpServer.ts";
import { NodeHttpClient, NodeRuntime } from "@effect/platform-node";
import "dotenv/config";
import { DatabaseLive } from "./services/Database.ts";
import { ChatterService, ChatterServiceLive } from "./services/ChatterService.ts";
import { ChannelService, ChannelServiceLive } from "./services/ChannelService.ts";
import { SevenTVService, SevenTVServiceLive } from "./services/SevenTVService.ts";
import { EmoteRegistryLive, EmoteRegistryService } from "./services/EmotesService.ts";

const getEnv = Effect.gen(function* () {
  const channel = process.env.CHANNEL_NAME;
  const channelId = process.env.CHANNEL_ID;

  if (!channel || !channelId) {
    return yield* Effect.fail(new Error("CHANNEL_NAME and CHANNEL_ID must be set"));
  }

  return {
    channel,
    channelId,
  };
});

const program = Effect.gen(function* () {
  const { channel, channelId } = yield* getEnv;

  const { messages } = yield* TwitchIRC;
  const chatterService = yield* ChatterService;
  const channelService = yield* ChannelService;
  const sevenTVService = yield* SevenTVService;
  const emoteService = yield* EmoteRegistryService;

  yield* channelService
    .upsertChannel(channelId, channel)
    .pipe(Effect.catchAll((e) => Effect.logError(`Failed to upsert channel: ${e.reason}`)));

  const emotes = yield* sevenTVService
    .getEmotesForChannel(channelId)
    .pipe(Effect.catchAll((error) => Effect.fail(`${error.message}: ${error.cause}`)));

  yield* Effect.forEach(emotes, (emote) =>
    Effect.all([
      emoteService.addToCache([{ name: emote.name, id: emote.id }]),
      emoteService.addToDb([
        {
          id: emote.id,
          name: emote.name,
          url: "https:" + emote.url,
          channelId,
        },
      ]),
    ]),
  );

  const cache = yield* emoteService.getAll();

  yield* Effect.log(`Loaded ${cache.size} emotes from 7TV`);

  yield* Effect.log(`Listening to #${channel}...`);

  yield* Stream.runForEach(messages, (twitchMessage) =>
    Effect.gen(function* () {
      const { userId, displayName, roomId } = twitchMessage.tags;

      const chatter = yield* chatterService.upsertChatter(roomId, userId, displayName);

      yield* chatterService.insertMessage(roomId, chatter.id, twitchMessage);

      const words = twitchMessage.message.split(" ");

      const emoteCache = yield* emoteService.getAll();

      const foundEmotes = words.filter((word) => emoteCache.has(word));

      yield* Effect.forEach(foundEmotes, (emoteName) =>
        Effect.gen(function* () {
          const emoteId = emoteCache.get(emoteName);

          if (!emoteId) return;

          yield* emoteService.incrementUseCount(emoteId);
        }),
      );

      yield* Effect.log(`${displayName}: ${twitchMessage.message}`);
    }).pipe(Effect.catchAll((e) => Effect.logError(`Failed to process message: ${e.reason}`))),
  );
});

const AppLive = Layer.mergeAll(
  TwitchChatLive(process.env.CHANNEL_NAME!),
  HttpApiLive,
  ChatterServiceLive,
  ChannelServiceLive,
  DatabaseLive,
  SevenTVServiceLive,
  EmoteRegistryLive,
).pipe(Layer.provide(DatabaseLive), Layer.provide(NodeHttpClient.layer));

NodeRuntime.runMain(program.pipe(Effect.provide(AppLive)));
