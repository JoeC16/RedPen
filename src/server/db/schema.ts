// Drizzle table definitions used for typed queries. The source of truth is the
// plain SQL in db/migrations; tests/integration/schema-drift.test.ts fails if
// the two disagree.
import {
  bigint,
  boolean,
  integer,
  jsonb,
  numeric,
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
  timeSavedMinutes: jsonb("time_saved_minutes").$type<Record<"short" | "maths" | "essay", number>>().notNull(),
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

// ---------------------------------------------------------------------------
// 0002 teacher core
// ---------------------------------------------------------------------------
export const workType = pgEnum("work_type", ["short", "maths", "essay"]);
export const submissionStatus = pgEnum("submission_status", ["todo", "marking", "review", "approved", "failed"]);
export type SubmissionStatus = (typeof submissionStatus.enumValues)[number];
export const markSource = pgEnum("mark_source", ["manual", "ai"]);

const halfMark = (name: string) => numeric(name, { precision: 5, scale: 1, mode: "number" });

export const assignment = pgTable("assignment", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id").notNull(),
  schoolId: uuid("school_id").notNull(),
  title: text("title").notNull(),
  workType: workType("work_type").notNull(),
  schemeText: text("scheme_text").notNull(),
  totalMarks: integer("total_marks").notNull(),
  criteria: jsonb("criteria").$type<{ label: string; max: number }[]>().notNull(),
  schemeVersion: integer("scheme_version").notNull().default(1),
  createdBy: uuid("created_by").notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const submission = pgTable("submission", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id").notNull(),
  pupilId: uuid("pupil_id").notNull(),
  classId: uuid("class_id").notNull(),
  schoolId: uuid("school_id").notNull(),
  text: text("text"),
  absent: boolean("absent").notNull().default(false),
  status: submissionStatus("status").notNull().default("todo"),
  feedback: text("feedback"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deleteAfter: timestamp("delete_after", { withTimezone: true }),
  failureReason: text("failure_reason"),
  contentDeletedAt: timestamp("content_deleted_at", { withTimezone: true }),
});

export const markResult = pgTable("mark_result", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").notNull(),
  classId: uuid("class_id").notNull(),
  schoolId: uuid("school_id").notNull(),
  assignmentId: uuid("assignment_id").notNull(),
  schemeVersion: integer("scheme_version").notNull(),
  runNumber: integer("run_number").notNull(),
  source: markSource("source").notNull(),
  model: text("model"),
  promptVersion: text("prompt_version"),
  confidence: text("confidence").$type<"high" | "medium" | "low">(),
  flags: jsonb("flags").$type<string[]>().notNull().default([]),
  transcription: text("transcription"),
  feedbackDraft: text("feedback_draft"),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  latencyMs: integer("latency_ms"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
  jobId: text("job_id"),
  cacheReadTokens: integer("cache_read_tokens"),
  inputFileIds: uuid("input_file_ids").array().notNull().default([]),
});

export const markLine = pgTable("mark_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  markResultId: uuid("mark_result_id").notNull(),
  classId: uuid("class_id").notNull(),
  schoolId: uuid("school_id").notNull(),
  position: smallint("position").notNull(),
  label: text("label").notNull(),
  max: integer("max").notNull(),
  aiAwarded: halfMark("ai_awarded"),
  finalAwarded: halfMark("final_awarded"),
  evidence: text("evidence"),
  comment: text("comment"),
  aiComment: text("ai_comment"),
});

export const approval = pgTable("approval", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").notNull(),
  classId: uuid("class_id").notNull(),
  schoolId: uuid("school_id").notNull(),
  markResultId: uuid("mark_result_id").notNull(),
  approvedBy: uuid("approved_by").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
  finalTotal: halfMark("final_total").notNull(),
  finalFeedback: text("final_feedback"),
  aiTotal: halfMark("ai_total"),
  linesChanged: integer("lines_changed"),
  reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  reopenedBy: uuid("reopened_by"),
  reopenReason: text("reopen_reason"),
});

// ---------------------------------------------------------------------------
// 0004 marking engine
// ---------------------------------------------------------------------------
export const markingRequest = pgTable("marking_request", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  schoolId: uuid("school_id").notNull(),
  userId: uuid("user_id").notNull(),
  submissionId: uuid("submission_id").notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// 0005 photos
// ---------------------------------------------------------------------------
export const submissionFile = pgTable("submission_file", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").notNull(),
  classId: uuid("class_id").notNull(),
  schoolId: uuid("school_id").notNull(),
  position: smallint("position").notNull(),
  storageKey: text("storage_key").notNull(),
  contentType: text("content_type").$type<"image/jpeg" | "image/png" | "image/webp">().notNull(),
  bytes: integer("bytes").notNull(),
  originalName: text("original_name"),
  namesConfirmedBy: uuid("names_confirmed_by").notNull(),
  namesConfirmedAt: timestamp("names_confirmed_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// 0006 oversight
// ---------------------------------------------------------------------------
export const pendingObjectDeletion = pgTable("pending_object_deletion", {
  storageKey: text("storage_key").primaryKey(),
  schoolId: uuid("school_id").notNull(),
  attempts: integer("attempts").notNull().default(0),
  createdAt: createdAt(),
});

export const schoolDeletionRequest = pgTable("school_deletion_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").notNull(),
  authorityId: uuid("authority_id").notNull(),
  requestedBy: uuid("requested_by").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  confirmedBy: uuid("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  cancelledBy: uuid("cancelled_by"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  result: jsonb("result").$type<Record<string, number>>(),
});
