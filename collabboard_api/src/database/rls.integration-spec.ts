import { Pool, PoolClient } from 'pg';

// Kept out of the normal unit suite; run with `npm run test:rls`.

const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.RLS_DB_USERNAME ?? 'collabboard_app',
  password: process.env.RLS_DB_PASSWORD ?? 'collabboard_app_pw123',
  database: process.env.DB_NAME ?? 'collabboard',
});

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const EDITOR_ID = '22222222-2222-2222-2222-222222222222';
const VIEWER_ID = '33333333-3333-3333-3333-333333333333';
const SHARED_BOARD_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PRIVATE_BOARD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

async function asUser<T>(
  userId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      userId,
    ]);
    return await work(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

describe('RLS integration', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('shows only boards the current user belongs to', async () => {
    await asUser(VIEWER_ID, async (client) => {
      const result = await client.query('SELECT id FROM boards ORDER BY id');
      expect(result.rows.map((row) => row.id)).toEqual([SHARED_BOARD_ID]);
    });
  });

  it('bootstraps a new board and its owner membership in one transaction', async () => {
    await asUser(OWNER_ID, async (client) => {
      const board = await client.query(
        `INSERT INTO boards (name, owner_id)
         VALUES ('RLS bootstrap test', $1)
         RETURNING id`,
        [OWNER_ID],
      );
      expect(board.rows).toHaveLength(1);

      const membership = await client.query(
        `INSERT INTO board_members (board_id, user_id, role, invited_by)
         VALUES ($1, $2, 'owner', NULL)
         RETURNING id`,
        [board.rows[0].id, OWNER_ID],
      );
      expect(membership.rows).toHaveLength(1);
    });
  });

  it('returns no tenant rows when a pooled connection has no user setting', async () => {
    const result = await pool.query('SELECT id FROM boards');
    expect(result.rows).toHaveLength(0);
  });

  it('lets editors update board content but not immutable ownership', async () => {
    await asUser(EDITOR_ID, async (client) => {
      const update = await client.query(
        'UPDATE boards SET description = $1 WHERE id = $2 RETURNING id',
        ['RLS integration update', SHARED_BOARD_ID],
      );
      expect(update.rows).toHaveLength(1);

      await expect(
        client.query('UPDATE boards SET owner_id = $1 WHERE id = $2', [
          EDITOR_ID,
          SHARED_BOARD_ID,
        ]),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it('prevents viewers from creating notes or spoofing their creator', async () => {
    await asUser(VIEWER_ID, async (client) => {
      await expect(
        client.query(
          `INSERT INTO notes (board_id, created_by, title)
           VALUES ($1, $2, 'blocked')`,
          [SHARED_BOARD_ID, VIEWER_ID],
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    await asUser(EDITOR_ID, async (client) => {
      await expect(
        client.query(
          `INSERT INTO notes (board_id, created_by, title)
           VALUES ($1, $2, 'spoofed')`,
          [SHARED_BOARD_ID, OWNER_ID],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('allows only the owner to manage non-owner memberships', async () => {
    await asUser(EDITOR_ID, async (client) => {
      const result = await client.query(
        `UPDATE board_members SET role = 'viewer'
         WHERE board_id = $1 AND user_id = $2`,
        [SHARED_BOARD_ID, VIEWER_ID],
      );
      expect(result.rowCount).toBe(0);
    });

    await asUser(OWNER_ID, async (client) => {
      const result = await client.query(
        `UPDATE board_members SET role = 'editor'
         WHERE board_id = $1 AND user_id = $2`,
        [SHARED_BOARD_ID, VIEWER_ID],
      );
      expect(result.rowCount).toBe(1);

      const ownerChange = await client.query(
        `UPDATE board_members SET role = 'viewer'
         WHERE board_id = $1 AND user_id = $2`,
        [SHARED_BOARD_ID, OWNER_ID],
      );
      expect(ownerChange.rowCount).toBe(0);
    });
  });

  it('supports auth lookup before a user-scoped RLS transaction exists', async () => {
    const result = await pool.query(
      'SELECT id FROM find_user_by_id_for_auth($1)',
      [OWNER_ID],
    );
    expect(result.rows).toEqual([{ id: OWNER_ID }]);
  });
});
