ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS part_number TEXT,
  ADD COLUMN IF NOT EXISTS shelf_location TEXT;

CREATE INDEX IF NOT EXISTS products_part_number_idx ON public.products (part_number);
CREATE INDEX IF NOT EXISTS products_shelf_location_idx ON public.products (shelf_location);