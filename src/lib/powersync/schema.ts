import { column, Schema, Table } from "@powersync/web";

/**
 * Local SQLite schema mirroring the 20 Supabase tables (+ every synced column).
 * Column names/sets MUST match src/integrations/supabase/types.ts exactly —
 * PowerSync upload replays these rows against Supabase, so a wrong column name
 * makes the write queue fail forever.
 *
 * SQLite type mapping:
 * - uuid / timestamptz / text / enums  -> column.text
 * - numeric / float                    -> column.real
 * - int counters                       -> column.integer
 * - boolean                            -> column.integer (0/1; converted on upload)
 * - json / arrays                      -> column.text (JSON string; parsed on upload)
 *
 * `id` is implicit in PowerSync tables and stores the Postgres uuid.
 */

const products = new Table(
  {
    user_id: column.text,
    name: column.text,
    barcode: column.text,
    part_number: column.text,
    category: column.text,
    location: column.text,
    shelf_location: column.text,
    unit: column.text,
    quantity: column.real,
    min_quantity: column.real,
    cost_price: column.real,
    sale_price: column.real,
    is_active: column.integer,
    notes: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { by_barcode: ["barcode"], by_name: ["name"] } },
);

const customers = new Table(
  {
    user_id: column.text,
    name: column.text,
    phone: column.text,
    workshop: column.text,
    address: column.text,
    notes: column.text,
    balance: column.real,
    credit_limit: column.real,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { by_name: ["name"] } },
);

const suppliers = new Table({
  user_id: column.text,
  name: column.text,
  phone: column.text,
  address: column.text,
  notes: column.text,
  balance: column.real,
  created_at: column.text,
  updated_at: column.text,
});

const invoices = new Table(
  {
    user_id: column.text,
    invoice_number: column.integer,
    customer_id: column.text,
    customer_name: column.text,
    customer_phone: column.text,
    subtotal: column.real,
    discount: column.real,
    total: column.real,
    paid: column.real,
    remaining: column.real,
    payment_method: column.text,
    payment_method_id: column.text,
    reference_number: column.text,
    status: column.text,
    source: column.text,
    notes: column.text,
    cancellation_reason: column.text,
    cancelled_at: column.text,
    cancelled_by: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { by_customer: ["customer_id"], by_created: ["created_at"] } },
);

const invoice_items = new Table(
  {
    user_id: column.text,
    invoice_id: column.text,
    product_id: column.text,
    product_name: column.text,
    quantity: column.real,
    unit: column.text,
    unit_price: column.real,
    cost_price: column.real,
    line_total: column.real,
    created_at: column.text,
  },
  { indexes: { by_invoice: ["invoice_id"], by_product: ["product_id"] } },
);

const payments = new Table(
  {
    user_id: column.text,
    invoice_id: column.text,
    purchase_id: column.text,
    account_id: column.text,
    party_type: column.text,
    party_id: column.text,
    amount: column.real,
    method: column.text,
    notes: column.text,
    created_at: column.text,
  },
  { indexes: { by_invoice: ["invoice_id"], by_purchase: ["purchase_id"] } },
);

const purchases = new Table({
  user_id: column.text,
  purchase_number: column.integer,
  supplier_id: column.text,
  supplier_name: column.text,
  total: column.real,
  paid: column.real,
  remaining: column.real,
  status: column.text,
  notes: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const purchase_items = new Table(
  {
    user_id: column.text,
    purchase_id: column.text,
    product_id: column.text,
    product_name: column.text,
    quantity: column.real,
    cost_price: column.real,
    total: column.real,
    created_at: column.text,
  },
  { indexes: { by_purchase: ["purchase_id"] } },
);

const price_history = new Table(
  {
    user_id: column.text,
    product_id: column.text,
    old_price: column.real,
    new_price: column.real,
    source: column.text,
    purchase_id: column.text,
    created_at: column.text,
  },
  { indexes: { by_product: ["product_id"] } },
);

const expenses = new Table({
  user_id: column.text,
  account_id: column.text,
  amount: column.real,
  target: column.text,
  date: column.text,
  notes: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const payment_methods = new Table({
  user_id: column.text,
  name: column.text,
  type: column.text,
  opening_balance: column.real,
  is_active: column.integer,
  is_default: column.integer,
  bank_name: column.text,
  account_number: column.text,
  account_holder: column.text,
  iban: column.text,
  notes: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const returns = new Table(
  {
    user_id: column.text,
    invoice_id: column.text,
    product_id: column.text,
    product_name: column.text,
    quantity: column.real,
    status: column.text,
    reason: column.text,
    notes: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { by_invoice: ["invoice_id"] } },
);

const special_orders = new Table({
  user_id: column.text,
  customer_id: column.text,
  customer_name: column.text,
  customer_phone: column.text,
  supplier_id: column.text,
  supplier_name: column.text,
  item_name: column.text,
  description: column.text,
  quantity: column.real,
  target_price: column.real,
  priority: column.text,
  status: column.text,
  invoice_id: column.text,
  expected_at: column.text,
  cancellation_reason: column.text,
  notes: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const special_order_history = new Table(
  {
    user_id: column.text,
    order_id: column.text,
    changed_by: column.text,
    from_status: column.text,
    to_status: column.text,
    reason: column.text,
    created_at: column.text,
  },
  { indexes: { by_order: ["order_id"] } },
);

const notifications = new Table(
  {
    user_id: column.text,
    type: column.text,
    title: column.text,
    message: column.text,
    product_id: column.text,
    invoice_id: column.text,
    read: column.integer,
    created_at: column.text,
  },
  { indexes: { by_created: ["created_at"] } },
);

const audit_logs = new Table(
  {
    user_id: column.text,
    action: column.text,
    table_name: column.text,
    record_id: column.text,
    details: column.text,
    created_at: column.text,
  },
  { indexes: { by_created: ["created_at"] } },
);

const import_logs = new Table({
  user_id: column.text,
  file_name: column.text,
  format: column.text,
  source: column.text,
  status: column.text,
  imported_rows: column.integer,
  invalid_rows: column.integer,
  total_rows: column.integer,
  error_message: column.text,
  payload: column.text,
  duration_ms: column.integer,
  notes: column.text,
  created_at: column.text,
});

const export_logs = new Table({
  user_id: column.text,
  export_type: column.text,
  format: column.text,
  status: column.text,
  row_count: column.integer,
  tables: column.text,
  error_message: column.text,
  payload: column.text,
  duration_ms: column.integer,
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
  logo_url: column.text,
  tax_number: column.text,
  currency: column.text,
  invoice_header: column.text,
  invoice_footer: column.text,
  show_logo: column.integer,
  show_qr: column.integer,
  show_tax: column.integer,
  auto_print: column.integer,
  print_copies: column.integer,
  print_size: column.text,
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
