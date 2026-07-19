import { column, Schema, Table } from "@powersync/web";

/**
 * Local SQLite schema mirroring the 20 Supabase tables.
 * Types are relaxed (text for uuids/timestamps, real for numerics) because
 * SQLite has a narrower type system; the Postgres side stays strongly typed.
 * `id` is implicit (rowid); we store the Postgres uuid in a `id`-typed column.
 */

const products = new Table({
  user_id: column.text,
  name: column.text,
  barcode: column.text,
  part_number: column.text,
  shelf_location: column.text,
  category: column.text,
  quantity: column.real,
  min_quantity: column.real,
  cost_price: column.real,
  selling_price: column.real,
  wholesale_price: column.real,
  supplier_id: column.text,
  notes: column.text,
  image_url: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const customers = new Table({
  user_id: column.text,
  name: column.text,
  phone: column.text,
  email: column.text,
  location: column.text,
  address: column.text,
  notes: column.text,
  balance: column.real,
  created_at: column.text,
  updated_at: column.text,
});

const suppliers = new Table({
  user_id: column.text,
  name: column.text,
  phone: column.text,
  email: column.text,
  address: column.text,
  notes: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const invoices = new Table({
  user_id: column.text,
  invoice_number: column.integer,
  customer_id: column.text,
  customer_name: column.text,
  customer_phone: column.text,
  total: column.real,
  paid: column.real,
  remaining: column.real,
  discount: column.real,
  status: column.text,
  source: column.text,
  notes: column.text,
  cancellation_reason: column.text,
  transaction_reference: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const invoice_items = new Table({
  invoice_id: column.text,
  product_id: column.text,
  product_name: column.text,
  quantity: column.real,
  unit_price: column.real,
  cost_price: column.real,
  discount: column.real,
  total: column.real,
  created_at: column.text,
});

const payments = new Table({
  user_id: column.text,
  invoice_id: column.text,
  account_id: column.text,
  amount: column.real,
  method: column.text,
  transaction_reference: column.text,
  notes: column.text,
  created_at: column.text,
});

const purchases = new Table({
  user_id: column.text,
  purchase_number: column.integer,
  supplier_id: column.text,
  supplier_name: column.text,
  total: column.real,
  paid: column.real,
  status: column.text,
  notes: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const purchase_items = new Table({
  purchase_id: column.text,
  product_id: column.text,
  product_name: column.text,
  quantity: column.real,
  cost_price: column.real,
  total: column.real,
  created_at: column.text,
});

const price_history = new Table({
  user_id: column.text,
  product_id: column.text,
  old_price: column.real,
  new_price: column.real,
  source: column.text,
  purchase_id: column.text,
  created_at: column.text,
});

const expenses = new Table({
  user_id: column.text,
  account_id: column.text,
  amount: column.real,
  category: column.text,
  description: column.text,
  notes: column.text,
  created_at: column.text,
});

const payment_methods = new Table({
  user_id: column.text,
  name: column.text,
  type: column.text,
  balance: column.real,
  notes: column.text,
  is_active: column.integer,
  bank_name: column.text,
  account_number: column.text,
  currency: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const returns = new Table({
  user_id: column.text,
  invoice_id: column.text,
  product_id: column.text,
  product_name: column.text,
  quantity: column.real,
  refund_amount: column.real,
  status: column.text,
  reason: column.text,
  created_at: column.text,
});

const special_orders = new Table({
  user_id: column.text,
  customer_id: column.text,
  customer_name: column.text,
  supplier_id: column.text,
  supplier_name: column.text,
  product_name: column.text,
  part_number: column.text,
  quantity: column.real,
  estimated_price: column.real,
  status: column.text,
  invoice_id: column.text,
  expected_date: column.text,
  cancellation_reason: column.text,
  notes: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const special_order_history = new Table({
  order_id: column.text,
  changed_by: column.text,
  from_status: column.text,
  to_status: column.text,
  reason: column.text,
  created_at: column.text,
});

const notifications = new Table({
  user_id: column.text,
  type: column.text,
  title: column.text,
  message: column.text,
  product_id: column.text,
  invoice_id: column.text,
  read: column.integer,
  created_at: column.text,
});

const audit_logs = new Table({
  user_id: column.text,
  action: column.text,
  table_name: column.text,
  record_id: column.text,
  details: column.text,
  created_at: column.text,
});

const import_logs = new Table({
  user_id: column.text,
  file_name: column.text,
  target_table: column.text,
  status: column.text,
  rows_ok: column.integer,
  rows_failed: column.integer,
  total_rows: column.integer,
  errors: column.text,
  payload: column.text,
  duration_ms: column.integer,
  notes: column.text,
  created_at: column.text,
});

const export_logs = new Table({
  user_id: column.text,
  target_table: column.text,
  file_name: column.text,
  format: column.text,
  status: column.text,
  rows_total: column.integer,
  filters: column.text,
  duration_ms: column.integer,
  file_size_bytes: column.integer,
  notes: column.text,
  created_at: column.text,
});

const user_roles = new Table({
  user_id: column.text,
  role: column.text,
  created_at: column.text,
});

const store_profile = new Table({
  user_id: column.text,
  name: column.text,
  phone: column.text,
  address: column.text,
  city: column.text,
  country: column.text,
  logo_url: column.text,
  email: column.text,
  website: column.text,
  tax_number: column.text,
  currency: column.text,
  notes: column.text,
  bank_name: column.text,
  bank_account: column.text,
  invoice_footer: column.text,
  created_at: column.text,
  updated_at: column.text,
});

export const AppSchema = new Schema({
  products,
  customers,
  suppliers,
  invoices,
  invoice_items,
  payments,
  purchases,
  purchase_items,
  price_history,
  expenses,
  payment_methods,
  returns,
  special_orders,
  special_order_history,
  notifications,
  audit_logs,
  import_logs,
  export_logs,
  user_roles,
  store_profile,
});

export type Database = (typeof AppSchema)["types"];
