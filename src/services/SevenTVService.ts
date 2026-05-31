import { Context, Data, Effect, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "@effect/platform";

export class SevenTVApiError extends Data.TaggedError("SevenTVApiError")<{
  reason: string;
  cause: unknown;
}> {}

export class SevenTVParseError extends Data.TaggedError("SevenTVParseError")<{
  reason: string;
  cause: unknown;
}> {}

interface ISevenTVService {
  readonly getEmotesForChannel: (
    channelId: string,
  ) => Effect.Effect<
    ReadonlyArray<{ readonly name: string; readonly id: string; readonly url: string }>,
    SevenTVApiError | SevenTVParseError
  >;
}

export class SevenTVService extends Context.Tag("SevenTVService")<
  SevenTVService,
  ISevenTVService
>() {}

const EmoteData = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  host: Schema.Struct({
    url: Schema.String,
    files: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        format: Schema.Literal("WEBP", "AVIF", "GIF", "PNG"),
      }),
    ),
  }),
});

const EmoteSetEntry = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  data: EmoteData,
});

export const SevenTVUserResponse = Schema.Struct({
  emote_set: Schema.Struct({
    emotes: Schema.Array(EmoteSetEntry),
  }),
});

//https://7tv.io/v3/users/twitch/{twitchUserId}

export const SevenTVServiceLive = Layer.effect(
  SevenTVService,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    return SevenTVService.of({
      getEmotesForChannel: (channelId) =>
        client.get(`https://7tv.io/v3/users/twitch/${channelId}`).pipe(
          Effect.timeout("10 seconds"),
          Effect.andThen(HttpClientResponse.filterStatusOk),
          Effect.andThen(HttpClientResponse.schemaBodyJson(SevenTVUserResponse)),
          Effect.mapError((cause) =>
            cause._tag === "ParseError"
              ? new SevenTVParseError({ reason: "Failed to parse/decode", cause })
              : new SevenTVApiError({ reason: "Request failed", cause }),
          ),
          Effect.map((decoded) =>
            decoded.emote_set.emotes.map((entry) => ({
              id: entry.id,
              name: entry.name,
              url: entry.data.host.url,
            })),
          ),
          Effect.retry({ times: 3 }),
          Effect.withSpan("SevenTVService.getEmotesForChannel", { attributes: { channelId } }),
        ),
    });
  }),
).pipe(Layer.provide(FetchHttpClient.layer));
