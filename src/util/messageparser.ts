import { Effect, Data } from "effect";

type MessageTags = {
  badgeInfo: string;
  badges: string;
  clientNonce: string;
  color: string;
  displayName: string;
  emotes: string;
  firstMsg: string;
  flags: string;
  id: string;
  mod: string;
  returningChatter: string;
  roomId: string;
  subscriber: string;
  tmiSentTs: string;
  turbo: string;
  userId: string;
  userType: string;
};

export type TwitchMessage = {
  tags: MessageTags;
  message: string;
};

export class InvalidTwitchMessage extends Data.TaggedError("InvalidTwitchMessage")<{
  reason: string;
  raw: string;
}> {}

export const parseTwitchMessage = (raw: string) =>
  Effect.gen(function* () {
    const tagSection = raw.startsWith("@") ? raw.slice(1, raw.indexOf(" ")) : "";
    if (!tagSection) {
      yield* new InvalidTwitchMessage({ reason: "No tag section found", raw });
    }

    const privmsgIdx = raw.indexOf(" PRIVMSG ");
    if (privmsgIdx === -1) {
      yield* new InvalidTwitchMessage({ reason: "No PRIVMSG found", raw });
    }

    const afterPrivmsg = raw.indexOf(" :", privmsgIdx);
    if (afterPrivmsg === -1) {
      yield* new InvalidTwitchMessage({ reason: "No message separator found", raw });
    }

    const message = raw.slice(afterPrivmsg + 2);

    const tags = tagSection.split(";").reduce((acc, pair) => {
      const eqIdx = pair.indexOf("=");
      const rawKey = eqIdx === -1 ? pair : pair.slice(0, eqIdx);
      const value = eqIdx === -1 ? "" : pair.slice(eqIdx + 1);
      const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      acc[key as keyof MessageTags] = value;
      return acc;
    }, {} as MessageTags);

    return { tags, message };
  });
