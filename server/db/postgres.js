const { Pool } = require("pg");

let pool;

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRESQL_URL;
}

function getPool() {
  if (!pool) {
    const connectionString = databaseUrl();
    if (!connectionString) throw new Error("DATABASE_URL (or POSTGRES_URL) is required");
    pool = new Pool({
      connectionString,
      ssl: process.env.PGSSLMODE === "disable" || process.env.NODE_ENV !== "production"
        ? false
        : { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function connectDatabase() {
  const client = await getPool().connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS app_documents (
      collection TEXT NOT NULL,
      id UUID PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query("CREATE INDEX IF NOT EXISTS app_documents_collection_idx ON app_documents (collection)");
    await client.query(`CREATE INDEX IF NOT EXISTS app_documents_password_reset_user_idx
      ON app_documents ((data->>'userId'))
      WHERE collection = 'PasswordResetOtp'`);
  } finally {
    client.release();
  }
}

module.exports = { getPool, connectDatabase };
