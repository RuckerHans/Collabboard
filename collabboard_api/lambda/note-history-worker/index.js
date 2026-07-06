'use strict';

const {
  GetSecretValueCommand,
  SecretsManagerClient,
} = require('@aws-sdk/client-secrets-manager');
const { Client } = require('pg');

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
    username: requireString(credentials.app_username, 'app_username'),
    password: requireString(credentials.app_password, 'app_password'),
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

async function buildClient() {
  const secretArn = process.env.DB_CREDENTIALS_SECRET_ARN;
  if (!secretArn) {
    throw new Error(
      'DB_CREDENTIALS_SECRET_ARN environment variable is required',
    );
  }

  const credentials = await fetchCredentials(secretArn);
  const sslEnabled = process.env.DB_SSL !== 'false';

  return new Client({
    host: credentials.host,
    port: credentials.port,
    user: credentials.username,
    password: credentials.password,
    database: credentials.database,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  });
}

function parseNoteHistoryEvent(body) {
  const payload = JSON.parse(body);

  for (const field of ['noteId', 'boardId', 'changedBy', 'operation']) {
    if (typeof payload[field] !== 'string' || payload[field].length === 0) {
      throw new Error(`Message body is missing required field "${field}"`);
    }
  }

  return {
    noteId: payload.noteId,
    boardId: payload.boardId,
    changedBy: payload.changedBy,
    operation: payload.operation,
    versionBefore: payload.versionBefore ?? null,
    versionAfter: payload.versionAfter ?? null,
    beforeSnapshot: payload.beforeSnapshot ?? null,
    afterSnapshot: payload.afterSnapshot ?? null,
    changedFields: payload.changedFields ?? null,
  };
}

async function insertNoteHistory(client, entry) {
  await client.query('BEGIN');
  try {
    // note_history_insert (migration 002) requires changed_by to match
    // current_app_user_id(), which reads this per-transaction session
    // variable -- same mechanism DatabaseService.runInRlsTransaction uses
    // for the main API's requests.
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      entry.changedBy,
    ]);

    await client.query(
      `
        INSERT INTO note_history (
          note_id, board_id, changed_by, operation,
          version_before, version_after,
          before_snapshot, after_snapshot, changed_fields
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        entry.noteId,
        entry.boardId,
        entry.changedBy,
        entry.operation,
        entry.versionBefore,
        entry.versionAfter,
        entry.beforeSnapshot,
        entry.afterSnapshot,
        entry.changedFields,
      ],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

exports.handler = async function handler(event) {
  const client = await buildClient();
  const batchItemFailures = [];

  try {
    await client.connect();

    for (const record of event.Records ?? []) {
      try {
        const entry = parseNoteHistoryEvent(record.body);
        await insertNoteHistory(client, entry);
      } catch (error) {
        console.error(
          `[note-history-worker] Failed to process message ${record.messageId}:`,
          error,
        );
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }
  } finally {
    await client.end();
  }

  return { batchItemFailures };
};
