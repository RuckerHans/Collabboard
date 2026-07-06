#!/usr/bin/env node

'use strict';

const { spawn } = require('node:child_process');
const { readdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const {
  GetSecretValueCommand,
  SecretsManagerClient,
} = require('@aws-sdk/client-secrets-manager');
const { Client } = require('pg');

const migrationsDirectory = path.resolve(__dirname, '..', 'migrations');
const legacyMigrationFiles = [
  '001_init_schema_and_seed.sql',
  '002_enable_rls.sql',
  '003_notify_board_member_changes.sql',
  '004_drop_presence_table.sql',
];

function requireString(value, fieldName) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Database credentials secret is missing "${fieldName}"`);
  }

  return value;
}

function parseCredentials(secretValue) {
  const secretText =
    secretValue.SecretString ??
    (secretValue.SecretBinary
      ? Buffer.from(secretValue.SecretBinary).toString('utf8')
      : null);

  if (!secretText) {
    throw new Error('Database credentials secret has no value');
  }

  let credentials;
  try {
    credentials = JSON.parse(secretText);
  } catch (error) {
    throw new Error('Database credentials secret is not valid JSON', {
      cause: error,
    });
  }

  const port = Number(credentials.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Database credentials secret has an invalid "port"');
  }

  return {
    username: requireString(credentials.username, 'username'),
    password: requireString(credentials.password, 'password'),
    appPassword: requireString(credentials.app_password, 'app_password'),
    host: requireString(credentials.host, 'host'),
    port,
    database: requireString(credentials.dbname, 'dbname'),
  };
}

async function fetchCredentials(secretArn) {
  const secretsManager = new SecretsManagerClient({});

  try {
    const secretValue = await secretsManager.send(
      new GetSecretValueCommand({ SecretId: secretArn }),
    );

    return parseCredentials(secretValue);
  } finally {
    secretsManager.destroy();
  }
}

function runWithPsql(filePath, credentials, sslEnabled) {
  process.env.APP_PASSWORD = credentials.appPassword;

  const args = [
    '--no-psqlrc',
    '--host',
    credentials.host,
    '--port',
    String(credentials.port),
    '--username',
    credentials.username,
    '--dbname',
    credentials.database,
    '--set',
    'ON_ERROR_STOP=1',
    '--file',
    filePath,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('psql', args, {
      env: {
        ...process.env,
        APP_PASSWORD: process.env.APP_PASSWORD,
        PGPASSWORD: credentials.password,
        PGSSLMODE: sslEnabled ? 'require' : 'disable',
      },
      stdio: 'inherit',
    });

    child.once('error', (error) => {
      reject(
        new Error(`Failed to start psql for ${path.basename(filePath)}`, {
          cause: error,
        }),
      );
    });

    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(
        new Error(`psql failed for ${path.basename(filePath)} with ${reason}`),
      );
    });
  });
}

async function initializeMigrationTracking(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename varchar PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const {
    rows: [schemaState],
  } = await client.query(`
    SELECT
      to_regclass('public.note_history') IS NOT NULL AS note_history_exists,
      to_regclass('public.active_board_users') IS NULL AS presence_table_removed
  `);

  if (!schemaState.note_history_exists || !schemaState.presence_table_removed) {
    console.log(
      '[migrations] Existing post-004 schema not detected; migrations will be evaluated normally',
    );
    return;
  }

  const seeded = await client.query(
    `
      INSERT INTO public.schema_migrations (filename, applied_at)
      SELECT filename, now()
      FROM unnest($1::varchar[]) AS legacy_migration(filename)
      ON CONFLICT (filename) DO NOTHING
      RETURNING filename
    `,
    [legacyMigrationFiles],
  );

  if (seeded.rowCount === 0) {
    console.log(
      '[migrations] Existing post-004 schema detected; migration records 001-004 were already seeded',
    );
    return;
  }

  console.log(
    `[migrations] Existing post-004 schema detected because note_history exists and active_board_users is absent; seeded ${seeded.rowCount} legacy migration record(s)`,
  );
}

async function migrationWasApplied(client, fileName) {
  const result = await client.query(
    'SELECT 1 FROM public.schema_migrations WHERE filename = $1',
    [fileName],
  );

  return result.rowCount > 0;
}

async function recordMigration(client, fileName) {
  await client.query(
    `
      INSERT INTO public.schema_migrations (filename, applied_at)
      VALUES ($1, now())
      ON CONFLICT (filename) DO NOTHING
    `,
    [fileName],
  );
}

async function main() {
  const secretArn = process.env.DB_CREDENTIALS_SECRET_ARN;
  if (!secretArn) {
    throw new Error(
      'DB_CREDENTIALS_SECRET_ARN environment variable is required',
    );
  }

  const credentials = await fetchCredentials(secretArn);
  const sslEnabled = process.env.DB_SSL !== 'false';
  const client = new Client({
    host: credentials.host,
    port: credentials.port,
    user: credentials.username,
    password: credentials.password,
    database: credentials.database,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    await initializeMigrationTracking(client);

    const migrationFiles = (await readdir(migrationsDirectory))
      .filter((fileName) => fileName.endsWith('.sql'))
      .sort((left, right) => left.localeCompare(right, 'en'));

    if (migrationFiles.length === 0) {
      throw new Error(`No SQL migrations found in ${migrationsDirectory}`);
    }

    for (const fileName of migrationFiles) {
      if (await migrationWasApplied(client, fileName)) {
        console.log(`[migrations] Skipping ${fileName} (already applied)`);
        continue;
      }

      const filePath = path.join(migrationsDirectory, fileName);
      const sql = await readFile(filePath, 'utf8');
      console.log(`[migrations] Running ${fileName}`);

      if (sql.includes(":'app_password'")) {
        await runWithPsql(filePath, credentials, sslEnabled);
      } else {
        await client.query(sql);
      }

      await recordMigration(client, fileName);
      console.log(`[migrations] Completed ${fileName}`);
    }

    console.log('[migrations] All migrations completed successfully');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[migrations] Migration run failed:', error);
  process.exitCode = 1;
});
