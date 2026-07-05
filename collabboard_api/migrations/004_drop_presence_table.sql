BEGIN;

DROP TRIGGER IF EXISTS trg_notify_presence ON active_board_users;

DROP FUNCTION IF EXISTS fn_notify_presence_event();
DROP FUNCTION IF EXISTS fn_cleanup_stale_presence();

DROP POLICY IF EXISTS active_board_users_select ON active_board_users;
DROP POLICY IF EXISTS active_board_users_insert ON active_board_users;
DROP POLICY IF EXISTS active_board_users_update ON active_board_users;
DROP POLICY IF EXISTS active_board_users_delete ON active_board_users;

REVOKE ALL PRIVILEGES ON TABLE active_board_users FROM collabboard_app;

DROP INDEX IF EXISTS idx_active_board_users_board_id;
DROP TABLE IF EXISTS active_board_users;

COMMIT;
