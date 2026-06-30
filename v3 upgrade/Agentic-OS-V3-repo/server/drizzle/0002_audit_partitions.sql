-- Audit log monthly partitioning
-- Creates partitions for audit_log table by month on created_at
-- Uses PostgreSQL native range partitioning

-- Step 1: Create the partitioned audit_log table
-- Note: This is a new table; the old audit_log stays as-is for migration.
-- We create a function to auto-create partitions going forward.

CREATE TABLE IF NOT EXISTS audit_log_partitioned (
  LIKE audit_log INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Step 2: Create partitions for current and future months
DO $$
DECLARE
  start_date date;
  end_date date;
  partition_name text;
  i int;
BEGIN
  -- Create partitions from 2024-01 to 2027-12 (48 months)
  FOR i IN 0..47 LOOP
    start_date := date '2024-01-01' + (i || ' months')::interval;
    end_date := date '2024-02-01' + (i || ' months')::interval;
    partition_name := 'audit_log_y' || to_char(start_date, 'YYYY') || '_m' || to_char(start_date, 'MM');

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_log_partitioned
       FOR VALUES FROM (%L) TO (%L)',
      partition_name, start_date, end_date
    );
  END LOOP;
END $$;

-- Step 3: Create a function that auto-creates next month's partition
CREATE OR REPLACE FUNCTION create_next_audit_partition()
RETURNS void AS $$
DECLARE
  next_month date;
  partition_name text;
  start_date date;
  end_date date;
BEGIN
  next_month := date_trunc('month', now() + interval '1 month');
  start_date := next_month;
  end_date := next_month + interval '1 month';
  partition_name := 'audit_log_y' || to_char(start_date, 'YYYY') || '_m' || to_char(start_date, 'MM');

  -- Only create if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = partition_name
  ) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF audit_log_partitioned
       FOR VALUES FROM (%L) TO (%L)',
      partition_name, start_date, end_date
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 4: View to query both tables transparently
CREATE OR REPLACE VIEW audit_log_all AS
  SELECT * FROM audit_log
  UNION ALL
  SELECT * FROM audit_log_partitioned;

-- Step 5: Indexes on partitioned table
CREATE INDEX IF NOT EXISTS audit_part_seq_idx ON audit_log_partitioned (sequence);
CREATE INDEX IF NOT EXISTS audit_part_action_idx ON audit_log_partitioned (action);
CREATE INDEX IF NOT EXISTS audit_part_actor_idx ON audit_log_partitioned (actor);
CREATE INDEX IF NOT EXISTS audit_part_created_idx ON audit_log_partitioned (created_at);
