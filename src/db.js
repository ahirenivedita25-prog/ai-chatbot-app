const { Pool } = require("pg");

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

async function initializeDatabase() {
  if (!pool) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DATABASE_URL is required in production");
    }
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('user', 'admin', 'editor', 'viewer')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE users ALTER COLUMN role SET DEFAULT 'viewer';
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('user', 'admin', 'editor', 'viewer'));
    CREATE TABLE IF NOT EXISTS refresh_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      industry TEXT NOT NULL,
      intent TEXT NOT NULL,
      model_version TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS thread_id UUID;
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS label TEXT;
    UPDATE conversations SET thread_id = gen_random_uuid() WHERE thread_id IS NULL;
    ALTER TABLE conversations ALTER COLUMN thread_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS conversations_thread_created_idx
      ON conversations(thread_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS conversations_user_created_idx
      ON conversations(user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS admin_audit (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      action TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS admin_audit_created_idx
      ON admin_audit(created_at DESC);
    CREATE TABLE IF NOT EXISTS invitations (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
      token_hash TEXT NOT NULL UNIQUE,
      invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS invitations_email_idx ON invitations(email);
    CREATE TABLE IF NOT EXISTS user_integrations (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, provider)
    );
    CREATE TABLE IF NOT EXISTS failed_queries (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      industry TEXT NOT NULL,
      model_version TEXT NOT NULL,
      error_type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS failed_queries_created_idx
      ON failed_queries(created_at DESC);
    CREATE TABLE IF NOT EXISTS conversation_feedback (
      id BIGSERIAL PRIMARY KEY,
      conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating TEXT NOT NULL CHECK (rating IN ('helpful', 'not_helpful')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (conversation_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS conversation_feedback_created_idx
      ON conversation_feedback(created_at DESC);
  `);
}

module.exports = { pool, initializeDatabase };
