CREATE TABLE IF NOT EXISTS "pending_registrations" (
  "email" text PRIMARY KEY NOT NULL,
  "password_hash" text NOT NULL,
  "name" text NOT NULL,
  "otp_hash" text NOT NULL,
  "otp_expires" timestamp NOT NULL,
  "otp_attempts" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
