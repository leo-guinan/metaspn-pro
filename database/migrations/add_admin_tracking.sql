-- Migration: Add admin tracking tables for workflow observability
-- Created: 2026-01-27

-- Add is_admin flag to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Workflow runs table - tracks each workflow execution
CREATE TABLE IF NOT EXISTS workflow_runs (
  run_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  trigger VARCHAR(50) NOT NULL DEFAULT 'cron',
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workflow steps table - tracks individual steps within a workflow
CREATE TABLE IF NOT EXISTS workflow_steps (
  step_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES workflow_runs(run_id) ON DELETE CASCADE,
  step_name VARCHAR(255) NOT NULL,
  step_index INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER
);

-- Agent invocations table - tracks AI agent calls
CREATE TABLE IF NOT EXISTS agent_invocations (
  invocation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID REFERENCES workflow_runs(run_id) ON DELETE CASCADE,
  step_id UUID REFERENCES workflow_steps(step_id) ON DELETE CASCADE,
  agent_name VARCHAR(255) NOT NULL,
  model VARCHAR(100),
  prompt_preview TEXT,
  response_preview TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER
);

-- Tool calls table - tracks tool executions
CREATE TABLE IF NOT EXISTS tool_calls (
  call_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID REFERENCES workflow_runs(run_id) ON DELETE CASCADE,
  step_id UUID REFERENCES workflow_steps(step_id) ON DELETE CASCADE,
  invocation_id UUID REFERENCES agent_invocations(invocation_id) ON DELETE CASCADE,
  tool_name VARCHAR(255) NOT NULL,
  input_data JSONB,
  output_preview TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_started ON workflow_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_name ON workflow_runs(workflow_name);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_run ON workflow_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_status ON workflow_steps(status);
CREATE INDEX IF NOT EXISTS idx_agent_invocations_run ON agent_invocations(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_invocations_step ON agent_invocations(step_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_run ON tool_calls(run_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_step ON tool_calls(step_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_invocation ON tool_calls(invocation_id);

-- Index for admin user lookup
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;
