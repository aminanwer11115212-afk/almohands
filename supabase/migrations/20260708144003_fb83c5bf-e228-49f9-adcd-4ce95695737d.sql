
ALTER TABLE public.import_logs ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.export_logs ADD COLUMN IF NOT EXISTS payload jsonb;

ALTER TABLE public.import_logs REPLICA IDENTITY FULL;
ALTER TABLE public.export_logs REPLICA IDENTITY FULL;
ALTER TABLE public.price_history REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.import_logs;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.export_logs;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.price_history;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
