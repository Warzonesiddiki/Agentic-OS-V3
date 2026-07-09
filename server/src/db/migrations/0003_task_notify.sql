CREATE OR REPLACE FUNCTION notify_task_queued()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('task_queued', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_task_queued
AFTER INSERT ON agent_tasks
FOR EACH ROW
EXECUTE FUNCTION notify_task_queued();
