// db.ts
import { Context, Data, Layer } from "effect";
import { drizzle } from "drizzle-orm/libsql";

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  reason: string;
  cause: unknown;
}> {}

export class Database extends Context.Tag("Database")<Database, ReturnType<typeof drizzle>>() {}

export const DatabaseLive = Layer.sync(Database, () => drizzle(process.env.DB_FILE_NAME!));
