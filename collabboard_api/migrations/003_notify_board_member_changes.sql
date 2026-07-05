CREATE OR REPLACE FUNCTION fn_notify_board_member_event()
RETURNS trigger AS $$
DECLARE
  payload json;
BEGIN
  payload = json_build_object(
    'table', TG_TABLE_NAME,
    'operation', TG_OP,
    'id', COALESCE(NEW.id, OLD.id),
    'boardId', COALESCE(NEW.board_id, OLD.board_id),
    'userId', COALESCE(NEW.user_id, OLD.user_id)
  );
  PERFORM pg_notify('board_events', payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_board_members ON board_members;
CREATE TRIGGER trg_notify_board_members
AFTER INSERT OR UPDATE OR DELETE ON board_members
FOR EACH ROW EXECUTE FUNCTION fn_notify_board_member_event();
