import { Pool } from 'pg';

// Using collabboard_app — the SAME role your real app connects as.
// If this used `collabboard` (the table owner), RLS would be silently
// bypassed and this test would prove nothing.
const pool = new Pool({
  host: process.env.DB_HOST ?? 'postgres',
  port: Number(process.env.DB_PORT ?? 5432),
  user: 'collabboard_app',
  password: 'collabboard_app_pw123',
  database: process.env.DB_NAME ?? 'collabboard',
});

// Seed IDs from 001_init_schema_and_seed.sql — reused rather than
// re-inserted, since they already represent the exact membership
// scenario we need: Riley is NOT on board bbbbbbbb, but IS on aaaaaaaa.
const RILEY_ID = '33333333-3333-3333-3333-333333333333';
const BOARD_RILEY_IS_NOT_ON = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const BOARD_RILEY_IS_ON = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('RLS: boards table isolation (raw pg)', () => {
  afterAll(async () => {
    await pool.end(); // close connections so Jest can exit cleanly
  });

  it('blocks a user from seeing a board they are not a member of', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // is_local = true (3rd arg) scopes this to the current transaction,
      // matching exactly how runInRlsTransaction does it in production.
      await client.query(
        `SELECT set_config('app.current_user_id', $1, true)`,
        [RILEY_ID],
      );

      const result = await client.query(
        'SELECT * FROM boards WHERE id = $1',
        [BOARD_RILEY_IS_NOT_ON],
      );

      expect(result.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK'); // never commit test transactions
      client.release();
    }
  });

  it('allows a user to see a board they ARE a member of', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT set_config('app.current_user_id', $1, true)`,
        [RILEY_ID],
      );

      const result = await client.query(
        'SELECT * FROM boards WHERE id = $1',
        [BOARD_RILEY_IS_ON],
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe(BOARD_RILEY_IS_ON);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});