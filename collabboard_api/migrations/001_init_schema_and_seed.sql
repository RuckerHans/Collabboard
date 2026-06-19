CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username varchar NOT NULL UNIQUE,
  email varchar NOT NULL UNIQUE,
  password_hash varchar,
  oauth_provider varchar,
  oauth_id varchar,
  avatar_color varchar NOT NULL DEFAULT '#4f46e5',
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  description varchar,
  owner_id uuid NOT NULL REFERENCES users(id),
  is_archived boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS board_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  role varchar NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_by uuid REFERENCES users(id),
  CONSTRAINT board_members_unique UNIQUE (board_id, user_id)
);

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  title varchar,
  content varchar,
  color varchar,
  position_x double precision NOT NULL DEFAULT 0,
  position_y double precision NOT NULL DEFAULT 0,
  width double precision NOT NULL DEFAULT 280,
  height double precision NOT NULL DEFAULT 180,
  z_index integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  is_pinned boolean NOT NULL DEFAULT false,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS note_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  changed_by uuid NOT NULL REFERENCES users(id),
  operation varchar NOT NULL,
  version_before integer,
  version_after integer,
  before_snapshot jsonb,
  after_snapshot jsonb,
  changed_fields text[]
);

CREATE TABLE IF NOT EXISTS active_board_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  socket_id varchar NOT NULL,
  last_heartbeat timestamptz NOT NULL,
  cursor_x double precision,
  cursor_y double precision,
  current_note_id uuid REFERENCES notes(id),
  is_typing boolean NOT NULL DEFAULT false,
  typing_expires_at timestamptz,
  CONSTRAINT active_board_users_unique UNIQUE (board_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_boards_owner_id ON boards(owner_id);
CREATE INDEX IF NOT EXISTS idx_board_members_user_id ON board_members(user_id);
CREATE INDEX IF NOT EXISTS idx_board_members_board_id ON board_members(board_id);
CREATE INDEX IF NOT EXISTS idx_notes_board_active ON notes(board_id, deleted_at, z_index);
CREATE INDEX IF NOT EXISTS idx_note_history_note_id ON note_history(note_id);
CREATE INDEX IF NOT EXISTS idx_active_board_users_board_id ON active_board_users(board_id);

CREATE OR REPLACE FUNCTION fn_cleanup_stale_presence()
RETURNS void AS $$
BEGIN
  DELETE FROM active_board_users
  WHERE last_heartbeat < now() - interval '60 seconds'
     OR (typing_expires_at IS NOT NULL AND typing_expires_at < now());
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_notify_board_event()
RETURNS trigger AS $$
DECLARE
  payload json;
BEGIN
  IF TG_TABLE_NAME = 'boards' THEN
    payload = json_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'id', COALESCE(NEW.id, OLD.id),
      'boardId', COALESCE(NEW.id, OLD.id)
    );
  ELSE
    payload = json_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'id', COALESCE(NEW.id, OLD.id),
      'boardId', COALESCE(NEW.board_id, OLD.board_id)
    );
  END IF;
  PERFORM pg_notify('board_events', payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_notify_presence_event()
RETURNS trigger AS $$
DECLARE
  payload json;
BEGIN
  payload = json_build_object(
    'table', TG_TABLE_NAME,
    'operation', TG_OP,
    'boardId', COALESCE(NEW.board_id, OLD.board_id),
    'userId', COALESCE(NEW.user_id, OLD.user_id)
  );
  PERFORM pg_notify('presence_events', payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_boards ON boards;
CREATE TRIGGER trg_notify_boards
AFTER INSERT OR UPDATE OR DELETE ON boards
FOR EACH ROW EXECUTE FUNCTION fn_notify_board_event();

DROP TRIGGER IF EXISTS trg_notify_notes ON notes;
CREATE TRIGGER trg_notify_notes
AFTER INSERT OR UPDATE OR DELETE ON notes
FOR EACH ROW EXECUTE FUNCTION fn_notify_board_event();

DROP TRIGGER IF EXISTS trg_notify_presence ON active_board_users;
CREATE TRIGGER trg_notify_presence
AFTER INSERT OR UPDATE OR DELETE ON active_board_users
FOR EACH ROW EXECUTE FUNCTION fn_notify_presence_event();

INSERT INTO users (id, username, email, password_hash, avatar_color, is_active)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'alex.owner', 'owner@collabboard.test', '$2b$12$s5MoaCfJZ9zj6es.VxRPU.avADo7T5gE5MChz/9ldvlXXs6mVvKr6', '#2563eb', true),
  ('22222222-2222-2222-2222-222222222222', 'sam.editor', 'editor@collabboard.test', '$2b$12$LSzVr/tW4ngPQY44Ab5FMuzFPmnTtvAG7iaYx54q3PuQVWeyQlNyi', '#059669', true),
  ('33333333-3333-3333-3333-333333333333', 'riley.viewer', 'viewer@collabboard.test', '$2b$12$Yaiz7VJdhRKt4nQ.9ibUhu9O1b4KYtPAQgXSR4UyhEtkrZVPGkJdW', '#7c3aed', true)
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  avatar_color = EXCLUDED.avatar_color,
  is_active = EXCLUDED.is_active;

INSERT INTO boards (id, name, description, owner_id, is_archived)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Product Roadmap', 'Planning board with seeded notes for local testing.', '11111111-1111-1111-1111-111111111111', false),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Sprint Retro', 'A small retrospective board for collaboration testing.', '22222222-2222-2222-2222-222222222222', false)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  owner_id = EXCLUDED.owner_id,
  is_archived = EXCLUDED.is_archived;

INSERT INTO board_members (id, board_id, user_id, role, invited_by)
VALUES
  ('aaaaaaaa-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner', null),
  ('aaaaaaaa-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'editor', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'viewer', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner', null),
  ('bbbbbbbb-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'editor', '22222222-2222-2222-2222-222222222222')
ON CONFLICT (board_id, user_id) DO UPDATE SET
  role = EXCLUDED.role,
  invited_by = EXCLUDED.invited_by;

INSERT INTO notes (
  id,
  board_id,
  created_by,
  title,
  content,
  color,
  position_x,
  position_y,
  width,
  height,
  z_index,
  version,
  is_pinned
)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Launch checklist', 'Confirm auth, realtime presence, and board sharing before demo.', '#fef3c7', 80, 80, 300, 180, 1, 1, true),
  ('10000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'API follow-up', 'Add pagination and audit log views after the first working demo.', '#dbeafe', 430, 110, 300, 180, 2, 1, false),
  ('10000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'UX polish', 'Keep note movement snappy and make conflict handling visible.', '#dcfce7', 250, 340, 300, 180, 3, 1, false),
  ('20000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Went well', 'Realtime edits were easy to understand.', '#fce7f3', 100, 120, 300, 180, 1, 1, false),
  ('20000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Improve', 'Add clearer loading and empty states.', '#ede9fe', 470, 150, 300, 180, 2, 1, false)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  color = EXCLUDED.color,
  position_x = EXCLUDED.position_x,
  position_y = EXCLUDED.position_y,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  z_index = EXCLUDED.z_index,
  version = EXCLUDED.version,
  is_pinned = EXCLUDED.is_pinned,
  deleted_at = null;

INSERT INTO note_history (
  id,
  note_id,
  board_id,
  changed_by,
  operation,
  version_before,
  version_after,
  before_snapshot,
  after_snapshot,
  changed_fields
)
VALUES
  (
    '90000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    'create',
    null,
    1,
    null,
    '{"title":"Launch checklist","content":"Confirm auth, realtime presence, and board sharing before demo."}'::jsonb,
    ARRAY['title', 'content']
  )
ON CONFLICT (id) DO NOTHING;
