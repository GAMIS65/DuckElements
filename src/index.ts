import { Effect, Stream, Layer } from "effect";
import { TwitchChatLive, TwitchIRC } from "./services/TwitchIRC.ts";
import { HttpApiLive } from "./services/HttpServer.ts";
import { NodeRuntime } from "@effect/platform-node";
import "dotenv/config";
import { DatabaseLive } from "./services/Database.ts";
import { ChatterService, ChatterServiceLive } from "./services/ChatterService.ts";
import { ChannelService, ChannelServiceLive } from "./services/ChannelService.ts";

const CHANNEL = process.env.CHANNEL_NAME;
const CHANNEL_ID = process.env.CHANNEL_ID;

const program = Effect.gen(function* () {
  if (!CHANNEL || !CHANNEL_ID) {
    yield* Effect.fail(
      new Error("CHANNEL_NAME and CHANNEL_ID must be set in the environment variables"),
    );
  }

  const { messages } = yield* TwitchIRC;
  const chatterService = yield* ChatterService;
  const channelService = yield* ChannelService;

  yield* channelService.upsertChannel(CHANNEL_ID!, CHANNEL!);

  yield* Effect.log(`Listening to #${CHANNEL}...`);

  yield* Stream.runForEach(messages, (twitchMessage) =>
    Effect.gen(function* () {
      const { userId, displayName, roomId } = twitchMessage.tags;

      const chatterId = yield* chatterService.upsertChatter(roomId, userId, displayName);
      yield* chatterService.insertMessage(roomId, chatterId.id, twitchMessage, userId);
      yield* Effect.log(`${displayName}: ${twitchMessage.message}`);
    }).pipe(Effect.catchAll((e) => Effect.logError(`Failed to process message: ${e.reason}`))),
  );
});

const AppLive = Layer.mergeAll(
  TwitchChatLive(CHANNEL!),
  HttpApiLive,
  ChatterServiceLive,
  ChannelServiceLive,
  DatabaseLive,
).pipe(Layer.provide(DatabaseLive));

NodeRuntime.runMain(program.pipe(Effect.provide(AppLive)));
