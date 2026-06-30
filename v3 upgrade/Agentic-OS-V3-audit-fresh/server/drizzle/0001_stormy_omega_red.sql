ALTER TABLE "notes" ADD COLUMN "embedding" real[];
-- notes_embedding_hnsw requires pgvector — commented out for non-pgvector deployments
-- CREATE INDEX IF NOT EXISTS "notes_embedding_hnsw" ON "notes" USING hnsw ("embedding" vector_cosine_ops);
