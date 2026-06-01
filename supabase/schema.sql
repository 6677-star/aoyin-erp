create extension if not exists pgcrypto;

create table if not exists public.products (
  id bigint generated always as identity primary key,
  name text not null,
  sku text not null unique,
  quantity integer not null default 0 check (quantity >= 0),
  unit text not null default 'pcs',
  cost_price numeric(12, 2) not null default 0,
  sell_price numeric(12, 2) not null default 0,
  warning_qty integer not null default 0 check (warning_qty >= 0),
  created_at timestamptz not null default now()
);

alter table public.products
add column if not exists is_deleted boolean not null default false;

alter table public.products
add column if not exists deleted_at timestamptz;

create table if not exists public.stock_logs (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  type text not null,
  quantity integer not null check (quantity <> 0),
  operator text not null,
  remark text,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_log_delete_audit (
  id bigint generated always as identity primary key,
  stock_log_id bigint not null,
  product_id bigint,
  type text,
  quantity integer,
  operator text,
  remark text,
  stock_log_created_at timestamptz,
  restored_delta integer,
  deleted_by text not null,
  deleted_at timestamptz not null default now()
);

alter table public.stock_logs
drop constraint if exists stock_logs_quantity_check;

alter table public.stock_logs
add constraint stock_logs_quantity_check
check (quantity <> 0);

alter table public.stock_log_delete_audit
add column if not exists restored_delta integer;

alter table public.stock_logs
drop constraint if exists stock_logs_type_check;

alter table public.stock_logs
add constraint stock_logs_type_check
check (type in ('purchase_in', 'purchase_return', 'sale_out', 'sale_return', 'adjustment'));

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  phone text,
  address text,
  remark text,
  created_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  phone text,
  address text,
  remark text,
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  delivery_date date not null default current_date,
  operator text not null,
  remark text,
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_order_items (
  id uuid primary key default gen_random_uuid(),
  delivery_order_id uuid not null references public.delivery_orders(id) on delete cascade,
  product_id bigint references public.products(id) on delete set null,
  product_sku text,
  product_name text not null,
  spec text,
  unit text,
  quantity numeric(12, 2) not null default 0,
  price numeric(12, 2) not null default 0,
  amount numeric(12, 2) not null default 0,
  remark text
);

create index if not exists idx_products_name on public.products using gin (to_tsvector('simple', name));
create index if not exists idx_products_sku on public.products (sku);
create unique index if not exists idx_products_sku_unique on public.products (sku);
create index if not exists idx_products_is_deleted on public.products (is_deleted);
create index if not exists idx_customers_name on public.customers (name);
create index if not exists idx_suppliers_name on public.suppliers (name);
create index if not exists idx_stock_logs_created_at on public.stock_logs (created_at desc);
create index if not exists idx_stock_logs_product_id on public.stock_logs (product_id);
create index if not exists idx_stock_logs_type on public.stock_logs (type);
create index if not exists idx_stock_log_delete_audit_deleted_at on public.stock_log_delete_audit (deleted_at desc);
create index if not exists idx_stock_log_delete_audit_stock_log_id on public.stock_log_delete_audit (stock_log_id);
create index if not exists idx_delivery_orders_order_no on public.delivery_orders (order_no);
create index if not exists idx_delivery_orders_customer_id on public.delivery_orders (customer_id);
create index if not exists idx_delivery_order_items_order_id on public.delivery_order_items (delivery_order_id);
create index if not exists idx_delivery_order_items_product_id on public.delivery_order_items (product_id);

alter table public.products enable row level security;
alter table public.stock_logs enable row level security;
alter table public.stock_log_delete_audit enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.delivery_orders enable row level security;
alter table public.delivery_order_items enable row level security;

drop policy if exists "Authenticated users can manage products" on public.products;
drop policy if exists "Authenticated users can manage stock logs" on public.stock_logs;
drop policy if exists "Authenticated users can read stock logs" on public.stock_logs;
drop policy if exists "Authenticated users can insert stock logs" on public.stock_logs;
drop policy if exists "Authenticated users can update stock logs" on public.stock_logs;
drop policy if exists "Authenticated users can read stock log delete audit" on public.stock_log_delete_audit;
drop policy if exists "Authenticated users can manage customers" on public.customers;
drop policy if exists "Authenticated users can manage suppliers" on public.suppliers;
drop policy if exists "Authenticated users can manage delivery orders" on public.delivery_orders;
drop policy if exists "Authenticated users can manage delivery order items" on public.delivery_order_items;

create policy "Authenticated users can manage products"
on public.products for all to authenticated using (true) with check (true);

create sequence if not exists public.product_sku_seq;

select setval(
  'public.product_sku_seq',
  greatest(
    coalesce((
      select max(substring(sku from 2)::integer)
      from public.products
      where sku ~ '^P[0-9]+$'
    ), 0),
    1
  ),
  (
    select exists (
      select 1
      from public.products
      where sku ~ '^P[0-9]+$'
    )
  )
);

create or replace function public.generate_product_sku()
returns trigger
language plpgsql
as $$
begin
  if new.sku is null or btrim(new.sku) = '' then
    new.sku := 'P' || lpad(nextval('public.product_sku_seq')::text, 4, '0');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_generate_product_sku on public.products;

create trigger trg_generate_product_sku
before insert on public.products
for each row
execute function public.generate_product_sku();

create policy "Authenticated users can read stock logs"
on public.stock_logs for select to authenticated using (true);

create policy "Authenticated users can insert stock logs"
on public.stock_logs for insert to authenticated with check (true);

create policy "Authenticated users can update stock logs"
on public.stock_logs for update to authenticated using (true) with check (true);

create policy "Authenticated users can read stock log delete audit"
on public.stock_log_delete_audit for select to authenticated using (true);

create policy "Authenticated users can manage customers"
on public.customers for all to authenticated using (true) with check (true);

create policy "Authenticated users can manage suppliers"
on public.suppliers for all to authenticated using (true) with check (true);

create policy "Authenticated users can manage delivery orders"
on public.delivery_orders for all to authenticated using (true) with check (true);

create policy "Authenticated users can manage delivery order items"
on public.delivery_order_items for all to authenticated using (true) with check (true);

create or replace function public.move_stock(
  p_product_id bigint,
  p_type text,
  p_quantity integer,
  p_operator text,
  p_remark text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_qty integer;
  signed_delta integer;
begin
  if p_quantity = 0 then
    raise exception 'Quantity cannot be 0';
  end if;

  if p_type not in ('purchase_in', 'purchase_return', 'sale_out', 'sale_return', 'adjustment') then
    raise exception 'Invalid stock type';
  end if;

  select quantity into current_qty
  from public.products
  where id = p_product_id
  for update;

  if current_qty is null then
    raise exception 'Product not found';
  end if;

  signed_delta := case
    when p_type in ('purchase_in', 'sale_return') then abs(p_quantity)
    when p_type in ('purchase_return', 'sale_out') then -abs(p_quantity)
    when p_type = 'adjustment' then p_quantity
    else 0
  end;

  if current_qty + signed_delta < 0 then
    raise exception 'Insufficient stock';
  end if;

  update public.products
  set quantity = quantity + signed_delta
  where id = p_product_id;

  insert into public.stock_logs (product_id, type, quantity, operator, remark)
  values (
    p_product_id,
    p_type,
    case when p_type = 'adjustment' then p_quantity else abs(p_quantity) end,
    p_operator,
    p_remark
  );
end;
$$;

grant execute on function public.move_stock(bigint, text, integer, text, text) to authenticated;

create or replace function public.next_delivery_order_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  ym text;
  seq integer;
begin
  ym := to_char(current_date, 'YYYYMM');

  select coalesce(max(substring(order_no from 11 for 4)::integer), 0) + 1
  into seq
  from public.delivery_orders
  where order_no like 'NO: ' || ym || '%';

  return 'NO: ' || ym || lpad(seq::text, 4, '0');
end;
$$;

grant execute on function public.next_delivery_order_no() to authenticated;

create table if not exists public.app_users (
  id bigint generated always as identity primary key,
  username text unique not null,
  password text not null,
  real_name text,
  role text not null check (role in ('admin', 'warehouse', 'sales', 'viewer')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_users_username on public.app_users (username);
create index if not exists idx_app_users_role on public.app_users (role);
create index if not exists idx_app_users_status on public.app_users (status);

alter table public.app_users enable row level security;

drop policy if exists "Development users can manage app users" on public.app_users;

create policy "Development users can manage app users"
on public.app_users for all to anon, authenticated using (true) with check (true);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_users_updated_at on public.app_users;

create trigger trg_app_users_updated_at
before update on public.app_users
for each row
execute function public.set_updated_at();

insert into public.app_users (username, password, real_name, role, status)
values ('admin', 'admin123', '系统管理员', 'admin', 'active')
on conflict (username) do nothing;

create or replace function public.delete_stock_log(
  p_log_id bigint,
  p_username text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_role text;
  target_log public.stock_logs%rowtype;
begin
  select role into current_user_role
  from public.app_users
  where username = p_username
    and status = 'active';

  if current_user_role is distinct from 'admin' then
    raise exception '权限不足，只有管理员才能删除库存流水';
  end if;

  select * into target_log
  from public.stock_logs
  where id = p_log_id
  for update;

  if target_log.id is null then
    raise exception '库存流水不存在或已被删除';
  end if;

  insert into public.stock_log_delete_audit (
    stock_log_id,
    product_id,
    type,
    quantity,
    operator,
    remark,
    stock_log_created_at,
    deleted_by
  )
  values (
    target_log.id,
    target_log.product_id,
    target_log.type,
    target_log.quantity,
    target_log.operator,
    target_log.remark,
    target_log.created_at,
    p_username
  );

  delete from public.stock_logs
  where id = p_log_id;
end;
$$;

grant execute on function public.delete_stock_log(bigint, text) to anon, authenticated;

create or replace function public.delete_stock_log(
  p_log_id bigint,
  p_username text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_role text;
  target_log public.stock_logs%rowtype;
  restore_delta integer;
  current_qty integer;
begin
  select role into current_user_role
  from public.app_users
  where username = p_username
    and status = 'active';

  if current_user_role is distinct from 'admin' then
    raise exception '权限不足，只有管理员才能删除库存流水';
  end if;

  select * into target_log
  from public.stock_logs
  where id = p_log_id
  for update;

  if target_log.id is null then
    raise exception '库存流水不存在或已被删除';
  end if;

  restore_delta := case
    when target_log.type in ('purchase_in', 'sale_return') then -abs(target_log.quantity)
    when target_log.type in ('purchase_return', 'sale_out') then abs(target_log.quantity)
    when target_log.type = 'adjustment' then -target_log.quantity
    else 0
  end;

  select quantity into current_qty
  from public.products
  where id = target_log.product_id
  for update;

  if current_qty is null then
    raise exception '商品不存在，无法恢复库存';
  end if;

  if current_qty + restore_delta < 0 then
    raise exception '删除该库存流水会导致商品库存小于 0，已取消删除';
  end if;

  update public.products
  set quantity = quantity + restore_delta
  where id = target_log.product_id;

  insert into public.stock_log_delete_audit (
    stock_log_id,
    product_id,
    type,
    quantity,
    operator,
    remark,
    stock_log_created_at,
    restored_delta,
    deleted_by
  )
  values (
    target_log.id,
    target_log.product_id,
    target_log.type,
    target_log.quantity,
    target_log.operator,
    target_log.remark,
    target_log.created_at,
    restore_delta,
    p_username
  );

  delete from public.stock_logs
  where id = p_log_id;
end;
$$;

grant execute on function public.delete_stock_log(bigint, text) to anon, authenticated;

drop policy if exists "Development users can manage products" on public.products;
drop policy if exists "Development users can manage stock logs" on public.stock_logs;
drop policy if exists "Development users can read stock logs" on public.stock_logs;
drop policy if exists "Development users can insert stock logs" on public.stock_logs;
drop policy if exists "Development users can update stock logs" on public.stock_logs;
drop policy if exists "Development users can read stock log delete audit" on public.stock_log_delete_audit;
drop policy if exists "Development users can manage customers" on public.customers;
drop policy if exists "Development users can manage suppliers" on public.suppliers;
drop policy if exists "Development users can manage delivery orders" on public.delivery_orders;
drop policy if exists "Development users can manage delivery order items" on public.delivery_order_items;

create policy "Development users can manage products"
on public.products for all to anon, authenticated using (true) with check (true);

create policy "Development users can read stock logs"
on public.stock_logs for select to anon, authenticated using (true);

create policy "Development users can insert stock logs"
on public.stock_logs for insert to anon, authenticated with check (true);

create policy "Development users can update stock logs"
on public.stock_logs for update to anon, authenticated using (true) with check (true);

create policy "Development users can read stock log delete audit"
on public.stock_log_delete_audit for select to anon, authenticated using (true);

create policy "Development users can manage customers"
on public.customers for all to anon, authenticated using (true) with check (true);

create policy "Development users can manage suppliers"
on public.suppliers for all to anon, authenticated using (true) with check (true);

create policy "Development users can manage delivery orders"
on public.delivery_orders for all to anon, authenticated using (true) with check (true);

create policy "Development users can manage delivery order items"
on public.delivery_order_items for all to anon, authenticated using (true) with check (true);

create table if not exists public.company_profile (
  id bigint generated always as identity primary key,
  company_name text not null,
  company_address text,
  contact_phone text,
  email text,
  logo_url text,
  remark text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_profile_active_updated
on public.company_profile (is_active, updated_at desc);

alter table public.company_profile enable row level security;

drop policy if exists "Authenticated users can manage company profile" on public.company_profile;
drop policy if exists "Development users can manage company profile" on public.company_profile;

create policy "Authenticated users can manage company profile"
on public.company_profile for all to authenticated using (true) with check (true);

create policy "Development users can manage company profile"
on public.company_profile for all to anon, authenticated using (true) with check (true);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_company_profile_updated_at on public.company_profile;

create trigger trg_company_profile_updated_at
before update on public.company_profile
for each row
execute function public.set_updated_at();

create or replace function public.ensure_single_active_company_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active = true then
    update public.company_profile
    set is_active = false
    where id <> coalesce(new.id, 0)
      and is_active = true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_company_profile_single_active on public.company_profile;

create trigger trg_company_profile_single_active
before insert or update of is_active on public.company_profile
for each row
execute function public.ensure_single_active_company_profile();

insert into storage.buckets (id, name, public)
values ('company-assets', 'company-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "Authenticated users can read company assets" on storage.objects;
drop policy if exists "Authenticated users can upload company assets" on storage.objects;
drop policy if exists "Authenticated users can update company assets" on storage.objects;
drop policy if exists "Authenticated users can delete company assets" on storage.objects;
drop policy if exists "Development users can read company assets" on storage.objects;
drop policy if exists "Development users can upload company assets" on storage.objects;
drop policy if exists "Development users can update company assets" on storage.objects;
drop policy if exists "Development users can delete company assets" on storage.objects;

create policy "Authenticated users can read company assets"
on storage.objects for select to authenticated
using (bucket_id = 'company-assets');

create policy "Authenticated users can upload company assets"
on storage.objects for insert to authenticated
with check (bucket_id = 'company-assets');

create policy "Authenticated users can update company assets"
on storage.objects for update to authenticated
using (bucket_id = 'company-assets')
with check (bucket_id = 'company-assets');

create policy "Authenticated users can delete company assets"
on storage.objects for delete to authenticated
using (bucket_id = 'company-assets');

create policy "Development users can read company assets"
on storage.objects for select to anon, authenticated
using (bucket_id = 'company-assets');

create policy "Development users can upload company assets"
on storage.objects for insert to anon, authenticated
with check (bucket_id = 'company-assets');

create policy "Development users can update company assets"
on storage.objects for update to anon, authenticated
using (bucket_id = 'company-assets')
with check (bucket_id = 'company-assets');

create policy "Development users can delete company assets"
on storage.objects for delete to anon, authenticated
using (bucket_id = 'company-assets');
