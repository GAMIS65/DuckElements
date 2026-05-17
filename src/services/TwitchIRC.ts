import { Effect, Context, Stream, Queue, Layer } from "effect";
import {
  InvalidTwitchMessage,
  parseTwitchMessage,
  type TwitchMessage,
} from "../util/messageparser.ts";

const WS_URL = "wss://irc-ws.chat.twitch.tv:443";

export class TwitchIRC extends Context.Tag("TwitchIRC")<
  TwitchIRC,
  {
    readonly messages: Stream.Stream<TwitchMessage, InvalidTwitchMessage>;
  }
>() {}

const makeTwitchChatService = (channel: string) =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<string>();

    const socket = yield* Effect.acquireRelease(
      Effect.sync(() => new WebSocket(WS_URL)),
      (socket) =>
        Effect.sync(() => {
          socket.close();
          Effect.logWarning("Disconnected from Twitch IRC");
        }),
    );

    yield* Effect.sync(() => {
      socket.onerror = (err) => {
        Effect.logError("WebSocket error:", err);
      };

      socket.onmessage = (event) => {
        const raw = event.data.toString();
        const lines = raw.split("\r\n").filter(Boolean);

        for (const line of lines) {
          if (line.startsWith("PING")) {
            socket.send("PONG :tmi.twitch.tv");
            continue;
          }

          if (line.includes("PRIVMSG")) {
            Effect.runFork(Queue.offer(queue, line));
          }
        }
      };
    });

    yield* Effect.async<void>((resume) => {
      socket.onopen = () => {
        Effect.log("Connected to Twitch IRC");
        socket.send("PASS SCHMOOPIIE");
        socket.send(`NICK justinfan${Math.floor(Math.random() * 100000)}`);
        socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership");
        socket.send(`JOIN #${channel}`);
        resume(Effect.void);
      };
    });

    const messages = Stream.fromQueue(queue).pipe(
      Stream.mapEffect((raw) => parseTwitchMessage(raw)),
    );

    return { messages };
  });

export const TwitchChatLive = (channel: string) =>
  Layer.scoped(TwitchIRC, makeTwitchChatService(channel));
