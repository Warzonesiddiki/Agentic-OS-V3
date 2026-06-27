CREATE TABLE IF NOT EXISTS "anchored_roots" (
	"id" text PRIMARY KEY NOT NULL,
	"checkpoint_id" text NOT NULL,
	"merkle_root" text NOT NULL,
	"chain_id" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"block_number" bigint,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merkle_checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"chunk_start_seq" bigint NOT NULL,
	"chunk_end_seq" bigint NOT NULL,
	"merkle_root" text NOT NULL,
	"prev_checkpoint_hash" text NOT NULL,
	"entry_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "anchored_roots" ADD CONSTRAINT "anchored_roots_checkpoint_id_merkle_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."merkle_checkpoints"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "anchor_checkpoint_idx" ON "anchored_roots" USING btree ("checkpoint_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "anchor_root_idx" ON "anchored_roots" USING btree ("merkle_root");