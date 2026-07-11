ALTER TABLE public.products ADD COLUMN IF NOT EXISTS part_number text;
CREATE INDEX IF NOT EXISTS idx_products_part_number ON public.products (user_id, part_number) WHERE part_number IS NOT NULL;