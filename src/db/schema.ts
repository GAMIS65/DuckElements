import { int, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const streamersTable = sqliteTable("streamers", {
  twitchId: text("streamer_twitch_id").primaryKey(),
  name: text("name").notNull(),
  totalMessages: int("total_messages").notNull().default(0),
});

export const chattersTable = sqliteTable(
  "chatters",
  {
    id: text("id").primaryKey().unique(),
    userTwitchId: text("user_twitch_id").notNull(),
    streamerTwitchId: text("streamer_twitch_id")
      .notNull()
      .references(() => streamersTable.twitchId, { onDelete: "cascade" }),
    username: text("username").notNull(),
    messageCount: int("message_count").notNull().default(1),
  },
  (t) => ({
    chatterUniq: uniqueIndex("chatters_twitch_channel_unique").on(
      t.userTwitchId,
      t.streamerTwitchId,
    ),
  }),
);

export const messagesTable = sqliteTable("messages", {
  id: text("id").primaryKey(),
  streamerTwitchId: text("streamer_twitch_id")
    .notNull()
    .references(() => streamersTable.twitchId, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => chattersTable.id, { onDelete: "cascade" }),
  userTwitchId: text("user_twitch_id").notNull(),
  message: text("message").notNull(),
  timestamp: text("timestamp").notNull(),
  badgeInfo: text("badge_info"),
  badges: text("badges"),
  color: text("color"),
});

export const emotesTable = sqliteTable("emotes", {
  id: text("id").primaryKey(),
  streamerTwitchId: text("streamer_twitch_id")
    .notNull()
    .references(() => streamersTable.twitchId, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  isactive: int("is_active").notNull().default(1),
  platform: text("platform").notNull(),
  usecount: int("use_count").notNull().default(0),
});
