import { Effect, Layer } from "effect";
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { Schema } from "effect";
import { createServer } from "node:http";
import { DatabaseLive } from "./Database.ts";
import { ChatterService, ChatterServiceLive } from "./ChatterService.ts";

const ChannelMessagesPath = Schema.Struct({
  channelId: Schema.String.pipe(
    Schema.minLength(1, { message: () => "channelId cannot be empty" }),
    Schema.maxLength(64, { message: () => "channelId too long" }),
    Schema.pattern(/^\d+$/, { message: () => "channelId must be numeric" }),
  ),
  chatterId: Schema.String.pipe(
    Schema.minLength(1, { message: () => "chatterId cannot be empty" }),
    Schema.maxLength(64, { message: () => "chatterId too long" }),
    Schema.pattern(/^\d+$/, { message: () => "chatterId must be numeric" }),
  ),
});

const ChannelMessagesQuery = Schema.Struct({
  limit: Schema.optionalWith(
    Schema.NumberFromString.pipe(
      Schema.int({ message: () => "limit must be an integer" }),
      Schema.between(1, 250, {
        message: () => "limit must be between 1 and 250",
      }),
    ),
    {
      default: () => 100,
    },
  ),
  offset: Schema.optionalWith(
    Schema.NumberFromString.pipe(
      Schema.int({ message: () => "offset must be an integer" }),
      Schema.greaterThanOrEqualTo(0, {
        message: () => "offset must be 0 or greater",
      }),
    ),
    {
      default: () => 0,
    },
  ),
});

const HealthResponse = Schema.Struct({
  status: Schema.String,
  timestamp: Schema.String,
});

const MessagesResponse = Schema.Struct({
  messages: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      message: Schema.String,
      timestamp: Schema.String,
    }),
  ),
  offset: Schema.Number,
});

export const Api = HttpApi.make("DuckElementsApi").add(
  HttpApiGroup.make("health")
    .add(HttpApiEndpoint.get("health", "/health").addSuccess(HealthResponse))
    .add(
      HttpApiEndpoint.get("chatterMessages", "/channels/:channelId/messages/:chatterId")
        .setPath(ChannelMessagesPath)
        .setUrlParams(ChannelMessagesQuery)
        .addSuccess(MessagesResponse),
    ),
);

const HealthGroupLive = HttpApiBuilder.group(Api, "health", (handlers) =>
  handlers
    .handle("health", () =>
      Effect.succeed({
        status: "ok",
        timestamp: new Date().toISOString(),
      }),
    )
    .handle("chatterMessages", ({ path: { channelId, chatterId }, urlParams: { limit, offset } }) =>
      Effect.gen(function* () {
        const chatterService = yield* ChatterService;

        const messages = yield* chatterService
          .getChatterChatMessages(channelId, chatterId, limit, offset)
          .pipe(Effect.orDie);

        return {
          messages,
          offset: messages.length === 0 ? offset : offset + messages.length,
        };
      }),
    ),
);

export const HttpApiLive = HttpApiBuilder.serve().pipe(
  Layer.provide(HttpApiBuilder.api(Api)),
  Layer.provide(HealthGroupLive),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
  Layer.provide(ChatterServiceLive.pipe(Layer.provide(DatabaseLive))),
);
