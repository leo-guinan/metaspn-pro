-- Migration: Remove pgvector, add chroma_id references
-- This migration removes pgvector columns and adds chroma_id references for Chroma Cloud

-- Step 1: Drop pgvector extension (if it exists)
DROP EXTENSION IF EXISTS vector CASCADE;

-- Step 2: Add chroma_id columns to transcript_chunks
ALTER TABLE transcript_chunks 
  ADD COLUMN IF NOT EXISTS chroma_id TEXT;

-- Step 3: Add chroma_id columns to expressions
ALTER TABLE expressions 
  ADD COLUMN IF NOT EXISTS chroma_id TEXT;

-- Step 4: Remove embedding columns (if they exist)
-- Note: This will fail if columns don't exist, which is fine
DO $$ 
BEGIN
  ALTER TABLE transcript_chunks DROP COLUMN IF EXISTS embedding;
  ALTER TABLE expressions DROP COLUMN IF EXISTS embedding;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

-- Step 5: Drop old vector indexes (if they exist)
DROP INDEX IF EXISTS idx_transcript_chunks_embedding;
DROP INDEX IF EXISTS idx_expressions_embedding;

-- Step 6: Create indexes on chroma_id
CREATE INDEX IF NOT EXISTS idx_transcript_chunks_chroma_id ON transcript_chunks(chroma_id);
CREATE INDEX IF NOT EXISTS idx_expressions_chroma_id ON expressions(chroma_id);

-- Step 7: Add comments
COMMENT ON COLUMN transcript_chunks.chroma_id IS 'Reference to Chroma Cloud collection item (embeddings stored in Chroma)';
COMMENT ON COLUMN expressions.chroma_id IS 'Reference to Chroma Cloud collection item (embeddings stored in Chroma)';
