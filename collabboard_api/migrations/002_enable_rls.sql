-- Row-level security for the CollabBoard application role.
--
-- The table owner remains the migration/maintenance role. The API connects as
-- collabboard_app, a non-owner without BYPASSRLS. SECURITY DEFINER helpers run
-- as the table owner so they can inspect board_members without recursively
-- invoking that table's policies.

\getenv app_password APP_PASSWORD
\if :{?app_password}
\else
\warn 'APP_PASSWORD environment variable was not set -- aborting migration'
\quit 1
\endif

SELECT EXISTS (
  SELECT 1
  FROM pg_roles
  WHERE rolname = 'collabboard_app'
) AS app_role_exists
\gset

\if :app_role_exists
ALTER ROLE collabboard_app
  LOGIN PASSWORD :'app_password'
  NOCREATEDB NOCREATEROLE NOINHERIT;
\else
CREATE ROLE collabboard_app
  LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
\endif

DO $grant_connect$
BEGIN
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO collabboard_app',
    current_database()
  );
END
$grant_connect$;
GRANT USAGE ON SCHEMA public TO collabboard_app;

DROP POLICY IF EXISTS boards_select ON boards;
DROP POLICY IF EXISTS boards_insert ON boards;
DROP POLICY IF EXISTS boards_update ON boards;
DROP POLICY IF EXISTS boards_delete ON boards;
DROP POLICY IF EXISTS board_members_select ON board_members;
DROP POLICY IF EXISTS board_members_insert ON board_members;
DROP POLICY IF EXISTS board_members_update ON board_members;
DROP POLICY IF EXISTS board_members_delete ON board_members;
DROP POLICY IF EXISTS notes_select ON notes;
DROP POLICY IF EXISTS notes_insert ON notes;
DROP POLICY IF EXISTS notes_update ON notes;
DROP POLICY IF EXISTS notes_delete ON notes;
DROP POLICY IF EXISTS note_history_select ON note_history;
DROP POLICY IF EXISTS note_history_insert ON note_history;
DROP POLICY IF EXISTS active_board_users_select ON active_board_users;
DROP POLICY IF EXISTS active_board_users_insert ON active_board_users;
DROP POLICY IF EXISTS active_board_users_update ON active_board_users;
DROP POLICY IF EXISTS active_board_users_delete ON active_board_users;
DROP POLICY IF EXISTS users_select ON users;
DROP POLICY IF EXISTS users_insert ON users;
DROP POLICY IF EXISTS users_update ON users;

DROP FUNCTION IF EXISTS find_user_for_auth(varchar);
DROP FUNCTION IF EXISTS find_user_by_id_for_auth(uuid);
DROP FUNCTION IF EXISTS current_app_user_id();
DROP FUNCTION IF EXISTS is_board_member(uuid, uuid);
DROP FUNCTION IF EXISTS board_member_role(uuid, uuid);
DROP FUNCTION IF EXISTS board_membership_count(uuid);
DROP FUNCTION IF EXISTS is_board_owner(uuid, uuid);
DROP FUNCTION IF EXISTS shares_board_with(uuid, uuid);
DROP FUNCTION IF EXISTS note_belongs_to_board(uuid, uuid);

CREATE FUNCTION current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $function$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$function$;

CREATE FUNCTION is_board_member(p_board_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.board_members
    WHERE board_id = p_board_id AND user_id = p_user_id
  );
$function$;

CREATE FUNCTION board_member_role(p_board_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT role
  FROM public.board_members
  WHERE board_id = p_board_id AND user_id = p_user_id
  LIMIT 1;
$function$;

CREATE FUNCTION board_membership_count(p_board_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT COUNT(*)::integer
  FROM public.board_members
  WHERE board_id = p_board_id;
$function$;

CREATE FUNCTION is_board_owner(p_board_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.boards
    WHERE id = p_board_id AND owner_id = p_user_id
  );
$function$;

CREATE FUNCTION shares_board_with(p_other_user_id uuid, p_current_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.board_members AS mine
    JOIN public.board_members AS theirs ON theirs.board_id = mine.board_id
    WHERE mine.user_id = p_current_user_id
      AND theirs.user_id = p_other_user_id
  );
$function$;

CREATE FUNCTION note_belongs_to_board(p_note_id uuid, p_board_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.notes
    WHERE id = p_note_id AND board_id = p_board_id
  );
$function$;

CREATE FUNCTION find_user_for_auth(p_email varchar)
RETURNS TABLE(
  id uuid,
  email varchar,
  username varchar,
  password_hash varchar,
  avatar_color varchar,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT u.id, u.email, u.username, u.password_hash, u.avatar_color, u.is_active
  FROM public.users AS u
  WHERE lower(u.email) = lower(p_email) AND u.is_active = true;
$function$;

CREATE FUNCTION find_user_by_id_for_auth(p_id uuid)
RETURNS TABLE(
  id uuid,
  email varchar,
  username varchar,
  password_hash varchar,
  avatar_color varchar,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT u.id, u.email, u.username, u.password_hash, u.avatar_color, u.is_active
  FROM public.users AS u
  WHERE u.id = p_id AND u.is_active = true;
$function$;

REVOKE ALL ON FUNCTION current_app_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION is_board_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION board_member_role(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION board_membership_count(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION is_board_owner(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION shares_board_with(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION note_belongs_to_board(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION find_user_for_auth(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION find_user_by_id_for_auth(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION current_app_user_id() TO collabboard_app;
GRANT EXECUTE ON FUNCTION is_board_member(uuid, uuid) TO collabboard_app;
GRANT EXECUTE ON FUNCTION board_member_role(uuid, uuid) TO collabboard_app;
GRANT EXECUTE ON FUNCTION board_membership_count(uuid) TO collabboard_app;
GRANT EXECUTE ON FUNCTION is_board_owner(uuid, uuid) TO collabboard_app;
GRANT EXECUTE ON FUNCTION shares_board_with(uuid, uuid) TO collabboard_app;
GRANT EXECUTE ON FUNCTION note_belongs_to_board(uuid, uuid) TO collabboard_app;
GRANT EXECUTE ON FUNCTION find_user_for_auth(varchar) TO collabboard_app;
GRANT EXECUTE ON FUNCTION find_user_by_id_for_auth(uuid) TO collabboard_app;

-- RLS is deliberately not forced on the owner: the SECURITY DEFINER helpers
-- above need the owner's normal RLS exemption to avoid policy recursion.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users NO FORCE ROW LEVEL SECURITY;
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards NO FORCE ROW LEVEL SECURITY;
ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_members NO FORCE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes NO FORCE ROW LEVEL SECURITY;
ALTER TABLE note_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_history NO FORCE ROW LEVEL SECURITY;
ALTER TABLE active_board_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_board_users NO FORCE ROW LEVEL SECURITY;

CREATE POLICY users_select ON users
  FOR SELECT
  USING (
    id = current_app_user_id()
    OR shares_board_with(id, current_app_user_id())
  );

CREATE POLICY users_insert ON users
  FOR INSERT
  WITH CHECK (id = current_app_user_id());

CREATE POLICY users_update ON users
  FOR UPDATE
  USING (id = current_app_user_id())
  WITH CHECK (id = current_app_user_id());

CREATE POLICY boards_select ON boards
  FOR SELECT
  USING (
    owner_id = current_app_user_id()
    OR is_board_member(id, current_app_user_id())
  );

CREATE POLICY boards_insert ON boards
  FOR INSERT
  WITH CHECK (owner_id = current_app_user_id());

CREATE POLICY boards_update ON boards
  FOR UPDATE
  USING (board_member_role(id, current_app_user_id()) IN ('owner', 'editor'))
  WITH CHECK (board_member_role(id, current_app_user_id()) IN ('owner', 'editor'));

CREATE POLICY boards_delete ON boards
  FOR DELETE
  USING (owner_id = current_app_user_id());

CREATE POLICY board_members_select ON board_members
  FOR SELECT
  USING (
    is_board_owner(board_id, current_app_user_id())
    OR is_board_member(board_id, current_app_user_id())
  );

CREATE POLICY board_members_insert ON board_members
  FOR INSERT
  WITH CHECK (
    (
      is_board_owner(board_id, current_app_user_id())
      AND user_id <> current_app_user_id()
      AND role IN ('editor', 'viewer')
      AND invited_by = current_app_user_id()
    )
    OR (
      user_id = current_app_user_id()
      AND role = 'owner'
      AND invited_by IS NULL
      AND is_board_owner(board_id, current_app_user_id())
      AND board_membership_count(board_id) = 0
    )
  );

CREATE POLICY board_members_update ON board_members
  FOR UPDATE
  USING (
    is_board_owner(board_id, current_app_user_id())
    AND NOT is_board_owner(board_id, user_id)
  )
  WITH CHECK (
    is_board_owner(board_id, current_app_user_id())
    AND NOT is_board_owner(board_id, user_id)
    AND role IN ('editor', 'viewer')
  );

CREATE POLICY board_members_delete ON board_members
  FOR DELETE
  USING (
    NOT is_board_owner(board_id, user_id)
    AND (
      user_id = current_app_user_id()
      OR is_board_owner(board_id, current_app_user_id())
    )
  );

CREATE POLICY notes_select ON notes
  FOR SELECT
  USING (is_board_member(board_id, current_app_user_id()));

CREATE POLICY notes_insert ON notes
  FOR INSERT
  WITH CHECK (
    created_by = current_app_user_id()
    AND board_member_role(board_id, current_app_user_id()) IN ('owner', 'editor')
  );

CREATE POLICY notes_update ON notes
  FOR UPDATE
  USING (board_member_role(board_id, current_app_user_id()) IN ('owner', 'editor'))
  WITH CHECK (board_member_role(board_id, current_app_user_id()) IN ('owner', 'editor'));

CREATE POLICY notes_delete ON notes
  FOR DELETE
  USING (board_member_role(board_id, current_app_user_id()) IN ('owner', 'editor'));

CREATE POLICY note_history_select ON note_history
  FOR SELECT
  USING (is_board_member(board_id, current_app_user_id()));

CREATE POLICY note_history_insert ON note_history
  FOR INSERT
  WITH CHECK (
    changed_by = current_app_user_id()
    AND board_member_role(board_id, current_app_user_id()) IN ('owner', 'editor')
    AND note_belongs_to_board(note_id, board_id)
  );

CREATE POLICY active_board_users_select ON active_board_users
  FOR SELECT
  USING (is_board_member(board_id, current_app_user_id()));

CREATE POLICY active_board_users_insert ON active_board_users
  FOR INSERT
  WITH CHECK (
    user_id = current_app_user_id()
    AND is_board_member(board_id, current_app_user_id())
    AND (
      current_note_id IS NULL
      OR note_belongs_to_board(current_note_id, board_id)
    )
  );

CREATE POLICY active_board_users_update ON active_board_users
  FOR UPDATE
  USING (
    user_id = current_app_user_id()
    AND is_board_member(board_id, current_app_user_id())
  )
  WITH CHECK (
    user_id = current_app_user_id()
    AND is_board_member(board_id, current_app_user_id())
    AND (
      current_note_id IS NULL
      OR note_belongs_to_board(current_note_id, board_id)
    )
  );

CREATE POLICY active_board_users_delete ON active_board_users
  FOR DELETE
  USING (user_id = current_app_user_id());

-- Start from no inherited/default privileges, then grant only what the API
-- actually needs. Immutable tenant keys are intentionally omitted from UPDATE.
REVOKE ALL ON users, boards, board_members, notes, note_history, active_board_users
  FROM PUBLIC, collabboard_app;

GRANT SELECT ON users, boards, board_members, notes, note_history, active_board_users
  TO collabboard_app;
GRANT INSERT ON users, boards, board_members, notes, note_history, active_board_users
  TO collabboard_app;
GRANT DELETE ON boards, board_members, notes, active_board_users
  TO collabboard_app;

GRANT UPDATE (username, email, avatar_color) ON users TO collabboard_app;
GRANT UPDATE (name, description, is_archived) ON boards TO collabboard_app;
GRANT UPDATE (role) ON board_members TO collabboard_app;
GRANT UPDATE (
  title, content, color, position_x, position_y, width, height,
  z_index, version, is_pinned, deleted_at
) ON notes TO collabboard_app;
GRANT UPDATE (
  socket_id, last_heartbeat, cursor_x, cursor_y, current_note_id,
  is_typing, typing_expires_at
) ON active_board_users TO collabboard_app;

-- The scheduler calls this without a user-scoped transaction. Expired typing
-- state should be cleared without evicting an otherwise active user.
CREATE OR REPLACE FUNCTION fn_cleanup_stale_presence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  UPDATE public.active_board_users
  SET is_typing = false,
      current_note_id = NULL,
      typing_expires_at = NULL
  WHERE typing_expires_at IS NOT NULL
    AND typing_expires_at < clock_timestamp();

  DELETE FROM public.active_board_users
  WHERE last_heartbeat < clock_timestamp() - interval '60 seconds';
END;
$function$;

REVOKE ALL ON FUNCTION fn_cleanup_stale_presence() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_cleanup_stale_presence() TO collabboard_app;
