
-- Store profile: one record per user, persisting store/invoice/print settings previously stored in localStorage
CREATE TABLE public.store_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'المهندس لقطع غيار السيارات',
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  tax_number text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT 'جنية سوداني',
  logo_url text,
  invoice_header text NOT NULL DEFAULT '',
  invoice_footer text NOT NULL DEFAULT 'شكراً لتعاملكم معنا',
  show_logo boolean NOT NULL DEFAULT true,
  show_tax boolean NOT NULL DEFAULT false,
  show_qr boolean NOT NULL DEFAULT true,
  print_size text NOT NULL DEFAULT '80mm',
  print_copies integer NOT NULL DEFAULT 1,
  auto_print boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_profile TO authenticated;
GRANT ALL ON public.store_profile TO service_role;
ALTER TABLE public.store_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own store profile" ON public.store_profile
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_store_profile_updated_at
  BEFORE UPDATE ON public.store_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Payment methods: cash + bank accounts owned by the store user
CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('cash','bank')),
  bank_name text,
  account_number text,
  account_holder text,
  iban text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own payment methods" ON public.payment_methods
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_payment_methods_user ON public.payment_methods(user_id);
CREATE TRIGGER update_payment_methods_updated_at
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Invoices: record which payment method was used
ALTER TABLE public.invoices
  ADD COLUMN payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','bank','mixed')),
  ADD COLUMN payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL;
