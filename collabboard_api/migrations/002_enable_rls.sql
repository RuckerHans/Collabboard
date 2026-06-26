-- ============================================================
-- Enable Row-Level Security and define policies for multi-tenant
-- board isolation. All policies key off app.current_user_id,
-- which is set per-transaction by DatabaseService.runInRlsTransaction
-- via SELECT set_config('app.current_user_id', userId, true).
--
-- IMPORTANT: The app connects as a single DB user (`collabboard`) which
-- also owns every table (it ran 001_init_schema_and_seed.sql). Postgres
-- does NOT enforce RLS against table owners by default — FORCE ROW LEVEL
-- SECURITY is required below so these policies actually apply to the
-- app's own connection, not just to hypothetical other roles.
--
-- This migration was previously applied in broken forms (recursion, then
-- a dollar-quoting collision between function bodies). These DROP
-- statements make the file safely re-runnable from any prior state.
-- Safe to run on a fresh database too (DROP ... IF EXISTS).
-- ============================================================

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
DROP POLICY IF EXISTS users_update ON users;
DROP POLICY IF EXISTS users_insert ON users;
DROP FUNCTION IF EXISTS find_user_for_auth(varchar);

DROP FUNCTION IF EXISTS current_app_user_id();
DROP FUNCTION IF EXISTS is_board_member(uuid, uuid);
DROP FUNCTION IF EXISTS board_member_role(uuid, uuid);
DROP FUNCTION IF EXISTS board_membership_count(uuid);
DROP FUNCTION IF EXISTS shares_board_with(uuid, uuid);

-- ============================================================
-- Helper functions.
--
-- Each function body uses its OWN unique dollar-quote tag
-- ($tag_name$ ... $tag_name$) instead of a bare $$. Reusing bare $$
-- across multiple function bodies in the same file is ambiguous —
-- Postgres just looks for the next matching $$ token, not a
-- "new function" boundary, which causes "unterminated dollar-quoted
-- string" / syntax errors once more than one function is defined
-- this way in a single script.
--
-- current_app_user_id() simply reads the per-transaction setting.
--
-- The four SECURITY DEFINER functions below run as the function owner
-- (the table owner), bypassing RLS ONLY for their own internal query.
-- This is required because board_members has RLS enabled on itself —
-- a board_members policy that queried board_members directly would
-- recurse infinitely checking its own rows. These functions break that
-- cycle while only ever returning a boolean/text/integer, so they
-- can't be used to leak raw row data to the caller.
-- ============================================================

CREATE FUNCTION current_app_user_id() RETURNS uuid AS $tag_curuser$
  SELECT current_setting('app.current_user_id', true)::uuid;
$tag_curuser$ LANGUAGE sql STABLE;

CREATE FUNCTION is_board_member(p_board_id uuid, p_user_id uuid)
RETURNS boolean AS $tag_ismember$
  SELECT EXISTS (
    SELECT 1 FROM board_members
    WHERE board_id = p_board_id AND user_id = p_user_id
  );
$tag_ismember$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE FUNCTION board_member_role(p_board_id uuid, p_user_id uuid)
RETURNS text AS $tag_memberrole$
  SELECT role FROM board_members
  WHERE board_id = p_board_id AND user_id = p_user_id
  LIMIT 1;
$tag_memberrole$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE FUNCTION board_membership_count(p_board_id uuid)
RETURNS integer AS $tag_membercount$
  SELECT COUNT(*)::int FROM board_members WHERE board_id = p_board_id;
$tag_membercount$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE FUNCTION shares_board_with(p_other_user_id uuid, p_current_user_id uuid)
RETURNS boolean AS $tag_sharesboard$
  SELECT EXISTS (
    SELECT 1 FROM board_members bm1
    JOIN board_members bm2 ON bm1.board_id = bm2.board_id
    WHERE bm1.user_id = p_current_user_id
      AND bm2.user_id = p_other_user_id
  );
$tag_sharesboard$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE FUNCTION find_user_for_auth(p_email varchar)
RETURNS TABLE(
  id uuid,
  email varchar,
  username varchar,
  password_hash varchar,
  avatar_color varchar,
  is_active boolean
) AS $tag_findauth$
  SELECT id, email, username, password_hash, avatar_color, is_active
  FROM users
  WHERE email = p_email AND is_active = true;
$tag_findauth$ LANGUAGE sql STABLE SECURITY DEFINER;

-- These functions are called by RLS policies, which run as whatever role
-- the app actually connects with (collabboard_app, not the table owner).
-- CREATE FUNCTION does not automatically grant EXECUTE to other roles, so
-- this must be explicit or every policy call fails with "function does
-- not exist" for any non-owner role.
GRANT EXECUTE ON FUNCTION current_app_user_id() TO collabboard_app;
GRANT EXECUTE ON FUNCTION is_board_member(uuid, uuid) TO collabboard_app;
GRANT EXECUTE ON FUNCTION board_member_role(uuid, uuid) TO collabboard_app;
GRANT EXECUTE ON FUNCTION board_membership_count(uuid) TO collabboard_app;
GRANT EXECUTE ON FUNCTION shares_board_with(uuid, uuid) TO collabboard_app;
GRANT EXECUTE ON FUNCTION find_user_for_auth(varchar) TO collabboard_app;

-- ----------------------------
-- boards
-- ----------------------------
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards FORCE ROW LEVEL SECURITY;

CREATE POLICY boards_select ON boards
  FOR SELECT
  USING (is_board_member(boards.id, current_app_user_id()));

CREATE POLICY boards_insert ON boards
  FOR INSERT
  WITH CHECK (owner_id = current_app_user_id());

CREATE POLICY boards_update ON boards
  FOR UPDATE
  USING (owner_id = current_app_user_id());

CREATE POLICY boards_delete ON boards
  FOR DELETE
  USING (owner_id = current_app_user_id());

-- ----------------------------
-- board_members
-- ----------------------------
ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_members FORCE ROW LEVEL SECURITY;

CREATE POLICY board_members_select ON board_members
  FOR SELECT
  USING (is_board_member(board_members.board_id, current_app_user_id()));

-- Two cases can insert a membership row:
--   1. An existing owner/editor adding someone else to the board.
--   2. A user creating their OWN first membership as owner, immediately
--      after creating the board itself (bootstrap case — no membership
--      rows exist yet for this board_id).
CREATE POLICY board_members_insert ON board_members
  FOR INSERT
  WITH CHECK (
    board_member_role(board_members.board_id, current_app_user_id()) IN ('owner', 'editor')
    OR (
      user_id = current_app_user_id()
      AND role = 'owner'
      AND board_membership_count(board_members.board_id) = 0
    )
  );

CREATE POLICY board_members_update ON board_members
  FOR UPDATE
  USING (board_member_role(board_members.board_id, current_app_user_id()) = 'owner');

CREATE POLICY board_members_delete ON board_members
  FOR DELETE
  USING (
    user_id = current_app_user_id()
    OR board_member_role(board_members.board_id, current_app_user_id()) = 'owner'
  );

-- ----------------------------
-- notes
-- ----------------------------
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes FORCE ROW LEVEL SECURITY;

CREATE POLICY notes_select ON notes
  FOR SELECT
  USING (is_board_member(notes.board_id, current_app_user_id()));

CREATE POLICY notes_insert ON notes
  FOR INSERT
  WITH CHECK (board_member_role(notes.board_id, current_app_user_id()) IN ('owner', 'editor'));

CREATE POLICY notes_update ON notes
  FOR UPDATE
  USING (board_member_role(notes.board_id, current_app_user_id()) IN ('owner', 'editor'));

CREATE POLICY notes_delete ON notes
  FOR DELETE
  USING (board_member_role(notes.board_id, current_app_user_id()) IN ('owner', 'editor'));

-- ----------------------------
-- note_history
-- ----------------------------
ALTER TABLE note_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_history FORCE ROW LEVEL SECURITY;

CREATE POLICY note_history_select ON note_history
  FOR SELECT
  USING (is_board_member(note_history.board_id, current_app_user_id()));

CREATE POLICY note_history_insert ON note_history
  FOR INSERT
  WITH CHECK (is_board_member(note_history.board_id, current_app_user_id()));

-- ----------------------------
-- active_board_users (presence)
-- ----------------------------
ALTER TABLE active_board_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_board_users FORCE ROW LEVEL SECURITY;

CREATE POLICY active_board_users_select ON active_board_users
  FOR SELECT
  USING (is_board_member(active_board_users.board_id, current_app_user_id()));

CREATE POLICY active_board_users_insert ON active_board_users
  FOR INSERT
  WITH CHECK (user_id = current_app_user_id());

CREATE POLICY active_board_users_update ON active_board_users
  FOR UPDATE
  USING (user_id = current_app_user_id());

CREATE POLICY active_board_users_delete ON active_board_users
  FOR DELETE
  USING (user_id = current_app_user_id());

-- ----------------------------
-- users
-- A user can always see their own row, plus anyone they share a board with.
-- ----------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

CREATE POLICY users_insert ON users
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY users_select ON users
  FOR SELECT
  USING (
    id = current_app_user_id()
    OR shares_board_with(users.id, current_app_user_id())
  );

CREATE POLICY users_update ON users
  FOR UPDATE
  USING (id = current_app_user_id());