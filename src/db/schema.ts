import { int, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const channelsTable = sqliteTable("channels", {
  twitchId: text("twitch_id").primaryKey(),
  name: text("name").notNull(),
  totalMessages: int("total_messages").notNull().default(0),
});

export const chattersTable = sqliteTable(
  "chatters",
  {
    id: text("id").primaryKey().unique(),
    twitchId: text("twitch_id").notNull(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channelsTable.twitchId, { onDelete: "cascade" }),
    username: text("username").notNull(),
    messageCount: int("message_count").notNull().default(1),
  },
  (t) => ({
    chatterUniq: uniqueIndex("chatters_twitch_channel_unique").on(t.twitchId, t.channelId),
  }),
);

export const messagesTable = sqliteTable("messages", {
  id: text("id").primaryKey(),
  channelId: text("channel_id")
    .notNull()
    .references(() => channelsTable.twitchId, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => chattersTable.id, { onDelete: "cascade" }),
  twitchId: text("twitch_id").notNull(),
  message: text("message").notNull(),
  timestamp: text("timestamp").notNull(),
});

export const emotesTable = sqliteTable("emotes", {
  id: text("id").primaryKey(),
  channelId: text("channel_id")
    .notNull()
    .references(() => channelsTable.twitchId, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  isactive: int("is_active").notNull().default(1),
  platform: text("platform").notNull(),
  usecount: int("use_count").notNull().default(0),
});
