import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const nowIso = () => new Date().toISOString();

export const folders = sqliteTable(
  "folders",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    parent_id: text("parent_id").references((): AnySQLiteColumn => folders.id, { onDelete: "cascade" }),
    created_at: text("created_at").notNull().$defaultFn(nowIso),
  },
  (t) => [index("folders_parent_id_idx").on(t.parent_id)]
);

export const flows = sqliteTable(
  "flows",
  {
    id: text("id").primaryKey(),
    folder_id: text("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    // Caminho público do SVG local (ex.: /api/uploads/<arquivo>.svg) ou null.
    svg_url: text("svg_url"),
    // JSON original exportado pelo Bizagi (configuration.json), armazenado como texto.
    bizagi_data: text("bizagi_data", { mode: "json" }).$type<Record<string, unknown>>(),
    created_at: text("created_at").notNull().$defaultFn(nowIso),
  },
  (t) => [
    uniqueIndex("flows_slug_uidx").on(t.slug),
    index("flows_folder_id_idx").on(t.folder_id),
  ]
);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    // Sempre armazenado em minúsculas (ver lib/auth/normalize).
    email: text("email").notNull(),
    password_hash: text("password_hash").notNull(),
    created_at: text("created_at").notNull().$defaultFn(nowIso),
  },
  (t) => [uniqueIndex("users_email_uidx").on(t.email)]
);

export const sessions = sqliteTable(
  "sessions",
  {
    // SHA-256 do token do cookie. O token em texto puro nunca é persistido.
    id: text("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires_at: integer("expires_at").notNull(),
    created_at: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index("sessions_user_id_idx").on(t.user_id)]
);
