# Medlane Supabase Schema Draft

This is a production migration draft for the static Medlane OS demo. It is intentionally normalized around auditability, inventory lots, document numbers, and role permissions.

## Access Control

```sql
create type app_role as enum ('Superadmin', 'Admin', 'Accounting', 'Sales', 'Logistics', 'HR', 'CEO');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role app_role not null,
  base_role app_role,
  branch_id uuid references branches(id),
  is_superadmin boolean not null default false,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table module_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  module_key text not null,
  can_view boolean not null default false,
  can_edit boolean not null default false,
  unique (user_id, module_key)
);
```

## Masterlists

```sql
create table branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  external_code text unique,
  name text not null unique,
  area text not null,
  account_type text,
  dealer text,
  customer_type text,
  sales_account text,
  salesperson_id uuid references profiles(id),
  bank_name text,
  bank_account_number text,
  terms_days integer not null default 30,
  credit_limit numeric(14,2) not null default 0,
  address text,
  street text,
  city text,
  province text,
  country text,
  zip_code text,
  contact text,
  mobile text,
  landline text,
  fax text,
  website text,
  contact_person text,
  contact_role text,
  tin text,
  source_file text,
  source_row integer,
  status text not null default 'Active',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table client_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  document_type text not null,
  r2_key text not null,
  file_name text not null,
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz not null default now(),
  unique (client_id, document_type)
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  external_code text unique,
  name text not null unique,
  brand_supplied text,
  classification text,
  tin text,
  address text,
  country text,
  contact text,
  mobile text,
  landline text,
  fax text,
  email text,
  website text,
  contact_person text,
  contact_role text,
  source_file text,
  source_row integer,
  status text not null default 'Active',
  active boolean not null default true
);

create table items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  brand text,
  source text,
  supplier_id uuid references suppliers(id),
  category text,
  classification text,
  uom text not null default 'unit',
  terms_days integer,
  cost numeric(14,2) default 0,
  price numeric(14,2) default 0,
  source_file text,
  source_row integer,
  status text not null default 'Active',
  active boolean not null default true
);

create table banks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account text,
  notes text,
  active boolean not null default true
);

create index clients_external_code_idx on clients(external_code);
create index clients_area_idx on clients(area);
create index suppliers_external_code_idx on suppliers(external_code);
create index suppliers_classification_idx on suppliers(classification);
create index items_category_idx on items(category);
create index items_classification_idx on items(classification);
```

## Masterlist Import Staging

Use these staging tables for CSV preview/validation before inserting into official masterlists. Store the raw row for traceability and the normalized fields used by the importer.

Current masterlist CSV mappings:

- `CLIENTS.csv` maps to `clients`: `Code -> external_code`, `Name -> name`, `Customer Type -> customer_type/account_type/dealer`, bank columns, `Tin`, `Term`, address columns, contact columns, and `Status -> active/status handling`.
- `SUPPLIERS _ VENDORS.csv` maps to `suppliers`: `Code -> external_code`, `Name`, `Classification`, `Tin`, address/contact columns, and `Status`.
- `PRODUCTS _ SERVICES.csv` maps to `items`: `ITEM CODE -> code`, `ITEM DESCRIPTION -> name`, `ITEM CLASSIFICATION -> classification/category`, and `UOM -> uom`.

```sql
create type import_record_status as enum ('Ready', 'Blocked', 'Imported', 'Skipped');

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  source_file text not null,
  source_kind text not null check (source_kind in ('clients', 'suppliers_vendors', 'products_services', 'sales', 'collections')),
  uploaded_by uuid references profiles(id),
  total_rows integer not null default 0,
  ready_rows integer not null default 0,
  blocked_rows integer not null default 0,
  imported_rows integer not null default 0,
  status text not null default 'Preview',
  created_at timestamptz not null default now(),
  imported_at timestamptz
);

create table import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_number integer not null,
  record_kind text not null,
  external_code text,
  record_name text,
  area_or_classification text,
  status import_record_status not null default 'Ready',
  issues text,
  raw_row jsonb not null default '{}'::jsonb,
  normalized_row jsonb not null default '{}'::jsonb,
  imported_table text,
  imported_id uuid,
  created_at timestamptz not null default now(),
  unique (batch_id, row_number)
);

create index import_rows_batch_status_idx on import_rows(batch_id, status);
create index import_rows_external_code_idx on import_rows(external_code);
```

## Inventory

```sql
create table inventory_lots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id),
  branch_id uuid not null references branches(id),
  lot_no text not null,
  serial_no text,
  expiry_date date,
  qty numeric(14,2) not null default 0,
  min_qty numeric(14,2) not null default 0,
  status text not null default 'Available',
  unique (item_id, branch_id, lot_no)
);

create table inventory_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_no text not null unique,
  supplier_id uuid not null references suppliers(id),
  branch_id uuid references branches(id),
  po_date date not null,
  terms_days integer not null default 30,
  status text not null default 'Purchase Receiving',
  prepared_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table inventory_purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  inventory_po_id uuid not null references inventory_purchase_orders(id) on delete cascade,
  item_id uuid not null references items(id),
  qty numeric(14,2) not null,
  uom text not null,
  unit_price numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  lot_no text,
  expiry_date date
);

create table stock_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_no text not null unique,
  from_branch_id uuid not null references branches(id),
  to_branch_id uuid not null references branches(id),
  status text not null,
  requested_by uuid references profiles(id),
  dispatched_by uuid references profiles(id),
  received_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (from_branch_id <> to_branch_id)
);

create table stock_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references stock_transfers(id) on delete cascade,
  inventory_lot_id uuid not null references inventory_lots(id),
  qty numeric(14,2) not null,
  received_qty numeric(14,2) default 0,
  missing_qty numeric(14,2) default 0
);
```

## Orders, Invoices, Collections

```sql
create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_no text not null unique,
  client_id uuid not null references clients(id),
  po_date date not null,
  status text not null default 'Pending',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  item_id uuid not null references items(id),
  qty numeric(14,2) not null,
  uom text not null,
  unit_price numeric(14,2) not null default 0
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  document_no text not null unique,
  document_type text not null check (document_type in ('SI', 'TS', 'DR')),
  purchase_order_id uuid references purchase_orders(id),
  client_id uuid not null references clients(id),
  source_branch_id uuid not null references branches(id),
  invoice_date date not null,
  terms_days integer not null default 30,
  amount numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  net numeric(14,2) not null default 0,
  paid numeric(14,2) not null default 0,
  withholding_tax_enabled boolean not null default false,
  expanded_withholding_tax_enabled boolean not null default false,
  status text not null default 'Active',
  cancelled_from text,
  replacement_document_no text,
  cancel_reason text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (paid <= net)
);

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  item_id uuid not null references items(id),
  inventory_lot_id uuid references inventory_lots(id),
  qty numeric(14,2) not null,
  uom text not null,
  unit_price numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0
);

create table collections (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  invoice_id uuid not null references invoices(id),
  tag text not null,
  method text not null,
  bank_id uuid references banks(id),
  reference text,
  cheque_date date,
  gross_amount numeric(14,2) not null,
  withholding_tax numeric(14,2) not null default 0,
  expanded_withholding_tax numeric(14,2) not null default 0,
  applied_amount numeric(14,2) not null,
  collection_status text not null default 'For Deposition',
  posted_date date,
  collected_at date,
  recorded_by uuid references profiles(id),
  recorded_at timestamptz not null default now()
);

create table collection_cheques (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  reference text not null,
  cheque_date date not null,
  amount numeric(14,2) not null
);

create table collection_status_history (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  status text not null,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now()
);
```

## Expenses, Payables, Payment Requests

```sql
create table payment_requests (
  id uuid primary key default gen_random_uuid(),
  cv_no text not null,
  request_date date not null,
  request_year integer generated always as (extract(year from request_date)::integer) stored,
  employee text not null,
  department text,
  payment_type text,
  request_type text,
  gross numeric(14,2) not null default 0,
  withholding_tax numeric(14,2) not null default 0,
  expanded_withholding_tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  status text not null default 'Prepared',
  prepared_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (cv_no, request_year)
);

create table payment_request_lines (
  id uuid primary key default gen_random_uuid(),
  payment_request_id uuid not null references payment_requests(id) on delete cascade,
  particulars text not null,
  amount numeric(14,2) not null
);

create table payables (
  id uuid primary key default gen_random_uuid(),
  payable_no text not null unique,
  supplier_id uuid references suppliers(id),
  status text not null default 'For Approval',
  amount numeric(14,2) not null default 0,
  paid numeric(14,2) not null default 0,
  payment_method text,
  bank_id uuid references banks(id),
  cheque_no text,
  cheque_date date,
  requested_by uuid references profiles(id),
  approved_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (paid <= amount)
);

create table payable_lines (
  id uuid primary key default gen_random_uuid(),
  payable_id uuid not null references payables(id) on delete cascade,
  particulars text not null,
  amount numeric(14,2) not null
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  expense_no text not null unique,
  expense_type text not null,
  requester text not null,
  office text,
  status text not null default 'For Approval',
  amount numeric(14,2) not null default 0,
  paid numeric(14,2) not null default 0,
  receipt_r2_key text,
  payment_method text,
  bank_id uuid references banks(id),
  cheque_no text,
  cheque_date date,
  approved_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (paid <= amount)
);

create table expense_lines (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  particulars text not null,
  amount numeric(14,2) not null
);
```

## Audit Logs

```sql
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  actor_email text,
  actor_role text,
  action text not null,
  module text not null,
  record_label text,
  record_table text,
  record_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_at_idx on audit_logs(created_at desc);
create index audit_logs_module_idx on audit_logs(module);
create index audit_logs_actor_idx on audit_logs(actor_id);
```

## Production Notes

- Use Supabase Auth for login and row ownership; keep R2 signed upload URL generation in Supabase Edge Functions or a backend service.
- Use database constraints for duplicate `document_no`, duplicate `receipt_no`, yearly CV uniqueness, no overpayment, and no same-branch transfers.
- Keep every mutation path writing to `audit_logs` inside the same transaction where possible.
- Soft-delete masterlists with `active = false`; only hard-delete unused setup records.
