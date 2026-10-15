// Drizzle table definitions used for typed queries. The source of truth is the
// plain SQL in db/migrations; tests/integration/schema-drift.test.ts fails if
// the two disagree.
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["authority_admin", "school_admin", "teacher"]);
export type UserRole = (typeof userRole.enumValues)[number];

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const authority = pgTable("authority", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  retentionDays: integer("retention_days").notNull().default(30),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

export const school = pgTable("school", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorityId: uuid("authority_id").notNull(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const appUser = pgTable("app_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorityId: uuid("authority_id").notNull(),
  schoolId: uuid("school_id"),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  role: userRole("role").notNull(),
  passwordHash: text("password_hash"),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const schoolClass = pgTable("class", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").notNull(),
  name: text("name").notNull(),
  yearGroup: smallint("year_group").notNull(),
  subject: text("subject").notNull(),
  createdAt: createdAt(),
});

export const classTeacher = pgTable(
  "class_teacher",
  {
    classId: uuid("class_id").notNull(),
    userId: uuid("user_id").notNull(),
    schoolId: uuid("school_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.classId, t.userId] })],
);

export const pupil = pgTable("pupil", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id").notNull(),
  schoolId: uuid("school_id").notNull(),
  code: text("code").notNull(),
  displayNameEnc: text("display_name_enc"),
  createdAt: createdAt(),
});

export const auditEvent = pgTable("audit_event", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  actorId: uuid("actor_id"),
  authorityId: uuid("authority_id"),
  schoolId: uuid("school_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});

export const loginAttempt = pgTable("login_attempt", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  emailKey: text("email_key").notNull(),
  ipKey: text("ip_key").notNull(),
  succeeded: boolean("succeeded").notNull(),
  createdAt: createdAt(),
});
