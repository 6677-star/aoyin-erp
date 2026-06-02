create extension if not exists pgcrypto;

create table if not exists public.products (
  id bigint generated always as identity primary key,
  name text not null,
  sku text not null unique,
  category_id bigint,
  category_name text,
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

create table if not exists public.product_categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  remark text,
  created_at timestamptz not null default now()
);

alter table public.products
add column if not exists category_id bigint;

alter table public.products
add column if not exists category_name text;

alter table public.products
drop constraint if exists products_category_id_fkey;

alter table public.products
add constraint products_category_id_fkey
foreign key (category_id) references public.product_categories(id) on delete set null;

update public.products
set category_name = coalesce(nullif(category_name, ''), '未分类')
where category_name is null or category_name = '';

insert into public.product_categories (name, remark)
values
  ('墨水', '默认商品类型'),
  ('包材', '默认商品类型'),
  ('胶带', '默认商品类型'),
  ('配件', '默认商品类型'),
  ('其他', '默认商品类型')
on conflict (name) do nothing;

create table if not exists public.stock_logs (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  type text not null,
  quantity integer not null check (quantity <> 0),
  operator text not null,
  remark text,
  created_at timestamptz not null default now()
);

alter table public.stock_logs add column if not exists product_sku text;
alter table public.stock_logs add column if not exists product_name text;
alter table public.stock_logs add column if not exists category_id bigint;
alter table public.stock_logs add column if not exists category_name text;
alter table public.stock_logs add column if not exists customer_name text;
alter table public.stock_logs add column if not exists supplier_name text;
alter table public.stock_logs add column if not exists before_qty integer;
alter table public.stock_logs add column if not exists after_qty integer;
alter table public.stock_logs add column if not exists unit_price numeric(12, 2) default 0;
alter table public.stock_logs add column if not exists amount numeric(12, 2) default 0;
alter table public.stock_logs add column if not exists order_id uuid;
alter table public.stock_logs add column if not exists order_no text;

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
check (type in ('purchase_in', 'purchase_return', 'sale_out', 'sale_return', 'adjustment', 'system_delete'));

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
  order_type text not null default 'sale_out',
  status text not null default 'saved',
  delivery_date date not null default current_date,
  operator text not null,
  remark text,
  created_at timestamptz not null default now()
);

alter table public.delivery_orders add column if not exists order_type text not null default 'sale_out';
alter table public.delivery_orders add column if not exists status text not null default 'saved';

alter table public.delivery_orders
drop constraint if exists delivery_orders_order_type_check;

alter table public.delivery_orders
add constraint delivery_orders_order_type_check
check (order_type in ('sale_out', 'sale_return'));

alter table public.delivery_orders
drop constraint if exists delivery_orders_status_check;

alter table public.delivery_orders
add constraint delivery_orders_status_check
check (status in ('saved', 'deleted'));

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
create index if not exists idx_products_category_id on public.products (category_id);
create index if not exists idx_product_categories_name on public.product_categories (name);
create index if not exists idx_customers_name on public.customers (name);
create index if not exists idx_suppliers_name on public.suppliers (name);
create index if not exists idx_stock_logs_created_at on public.stock_logs (created_at desc);
create index if not exists idx_stock_logs_product_id on public.stock_logs (product_id);
create index if not exists idx_stock_logs_type on public.stock_logs (type);
create index if not exists idx_stock_logs_category_id on public.stock_logs (category_id);
create index if not exists idx_stock_logs_order_id on public.stock_logs (order_id);
create index if not exists idx_stock_log_delete_audit_deleted_at on public.stock_log_delete_audit (deleted_at desc);
create index if not exists idx_stock_log_delete_audit_stock_log_id on public.stock_log_delete_audit (stock_log_id);
create index if not exists idx_delivery_orders_order_no on public.delivery_orders (order_no);
create index if not exists idx_delivery_orders_customer_id on public.delivery_orders (customer_id);
create index if not exists idx_delivery_orders_order_type on public.delivery_orders (order_type);
create index if not exists idx_delivery_order_items_order_id on public.delivery_order_items (delivery_order_id);
create index if not exists idx_delivery_order_items_product_id on public.delivery_order_items (product_id);

alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.stock_logs enable row level security;
alter table public.stock_log_delete_audit enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.delivery_orders enable row level security;
alter table public.delivery_order_items enable row level security;

drop policy if exists "Authenticated users can manage products" on public.products;
drop policy if exists "Authenticated users can manage product categories" on public.product_categories;
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

create policy "Authenticated users can manage product categories"
on public.product_categories for all to authenticated using (true) with check (true);

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
  product_row public.products%rowtype;
  next_qty integer;
begin
  if p_quantity = 0 then
    raise exception 'Quantity cannot be 0';
  end if;

  if p_type not in ('purchase_in', 'purchase_return', 'sale_out', 'sale_return', 'adjustment') then
    raise exception 'Invalid stock type';
  end if;

  select * into product_row
  from public.products
  where id = p_product_id
  for update;

  if product_row.id is null then
    raise exception 'Product not found';
  end if;

  current_qty := product_row.quantity;

  signed_delta := case
    when p_type in ('purchase_in', 'sale_return') then abs(p_quantity)
    when p_type in ('purchase_return', 'sale_out') then -abs(p_quantity)
    when p_type = 'adjustment' then p_quantity
    else 0
  end;

  if current_qty + signed_delta < 0 then
    raise exception 'Insufficient stock';
  end if;

  next_qty := current_qty + signed_delta;

  update public.products
  set quantity = quantity + signed_delta
  where id = p_product_id;

  insert into public.stock_logs (
    product_id,
    product_sku,
    product_name,
    category_id,
    category_name,
    type,
    quantity,
    before_qty,
    after_qty,
    operator,
    remark
  )
  values (
    p_product_id,
    product_row.sku,
    product_row.name,
    product_row.category_id,
    product_row.category_name,
    p_type,
    case when p_type = 'adjustment' then p_quantity else abs(p_quantity) end,
    current_qty,
    next_qty,
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

  perform pg_advisory_xact_lock(hashtext('delivery_order_no_' || ym));

  select coalesce(max(substring(order_no from ('^NO:[[:space:]]*' || ym || '([0-9]{4,})$'))::integer), 0) + 1
  into seq
  from public.delivery_orders
  where order_no ~ ('^NO:[[:space:]]*' || ym || '[0-9]{4,}$');

  return 'NO: ' || ym || lpad(seq::text, 4, '0');
end;
$$;

grant execute on function public.next_delivery_order_no() to authenticated;

create or replace function public.create_delivery_order_transaction(
  p_order_type text,
  p_customer_id uuid,
  p_customer_name text,
  p_order_no text,
  p_delivery_date date,
  p_operator text,
  p_remark text,
  p_items jsonb,
  p_order_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_no text;
  v_customer_name text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity numeric;
  v_quantity_int integer;
  v_price numeric(12, 2);
  v_amount numeric(12, 2);
  v_before_qty integer;
  v_after_qty integer;
  v_delta integer;
  v_existing_order public.delivery_orders%rowtype;
  v_existing_item public.delivery_order_items%rowtype;
begin
  if p_order_type not in ('sale_out', 'sale_return') then
    raise exception '无效业务类型';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception '请至少添加一条商品明细';
  end if;

  select name into v_customer_name
  from public.customers
  where id = p_customer_id;

  if v_customer_name is null then
    raise exception '客户不存在';
  end if;

  if p_order_id is not null then
    select * into v_existing_order
    from public.delivery_orders
    where id = p_order_id
    for update;

    if v_existing_order.id is null then
      raise exception '单据不存在';
    end if;

    for v_existing_item in
      select * from public.delivery_order_items where delivery_order_id = p_order_id
    loop
      select * into v_product
      from public.products
      where id = v_existing_item.product_id
      for update;

      if v_product.id is null then
        raise exception '商品不存在';
      end if;

      v_quantity_int := abs(round(v_existing_item.quantity)::integer);
      v_delta := case when v_existing_order.order_type = 'sale_out' then v_quantity_int else -v_quantity_int end;
      v_before_qty := v_product.quantity;
      v_after_qty := v_before_qty + v_delta;

      if v_after_qty < 0 then
        raise exception '恢复旧单据库存失败，商品 % 库存不足', v_product.name;
      end if;

      update public.products set quantity = v_after_qty where id = v_product.id;

      insert into public.stock_logs (
        product_id, product_sku, product_name, category_id, category_name,
        customer_name, type, quantity, before_qty, after_qty, unit_price,
        amount, order_id, order_no, operator, remark
      )
      values (
        v_product.id, v_product.sku, v_product.name, v_product.category_id, v_product.category_name,
        v_existing_order.customer_name, 'system_delete', v_quantity_int, v_before_qty, v_after_qty,
        v_existing_item.price, v_existing_item.amount, v_existing_order.id, v_existing_order.order_no,
        p_operator, '编辑单据前自动恢复旧库存'
      );
    end loop;

    delete from public.delivery_orders where id = p_order_id;
  end if;

  v_order_no := nullif(btrim(coalesce(p_order_no, '')), '');
  if v_order_no is null then
    v_order_no := public.next_delivery_order_no();
  end if;

  perform pg_advisory_xact_lock(hashtext('delivery_order_save_' || v_order_no));

  if exists (select 1 from public.delivery_orders where order_no = v_order_no) then
    raise exception '订单号已存在：%', v_order_no using errcode = '23505';
  end if;

  insert into public.delivery_orders (
    order_no, customer_id, customer_name, order_type, status,
    delivery_date, operator, remark
  )
  values (
    v_order_no, p_customer_id, coalesce(nullif(p_customer_name, ''), v_customer_name),
    p_order_type, 'saved', p_delivery_date, p_operator, nullif(p_remark, '')
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product
    from public.products
    where id = (v_item->>'product_id')::bigint
    for update;

    if v_product.id is null then
      raise exception '商品不存在';
    end if;

    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);
    v_quantity_int := round(v_quantity)::integer;
    if v_quantity <= 0 or v_quantity_int <= 0 then
      raise exception '商品 % 数量必须大于 0', v_product.name;
    end if;

    v_price := coalesce((v_item->>'price')::numeric, 0);
    v_amount := round((v_quantity * v_price)::numeric, 2);
    v_delta := case when p_order_type = 'sale_out' then -v_quantity_int else v_quantity_int end;
    v_before_qty := v_product.quantity;
    v_after_qty := v_before_qty + v_delta;

    if v_after_qty < 0 then
      raise exception '商品 % 库存不足，当前库存 %，出库数量 %', v_product.name, v_before_qty, v_quantity_int;
    end if;

    insert into public.delivery_order_items (
      delivery_order_id, product_id, product_sku, product_name, spec,
      unit, quantity, price, amount, remark
    )
    values (
      v_order_id, v_product.id, v_product.sku, v_product.name, null,
      v_product.unit, v_quantity, v_price, v_amount, nullif(v_item->>'remark', '')
    );

    update public.products set quantity = v_after_qty where id = v_product.id;

    insert into public.stock_logs (
      product_id, product_sku, product_name, category_id, category_name,
      customer_name, type, quantity, before_qty, after_qty, unit_price,
      amount, order_id, order_no, operator, remark
    )
    values (
      v_product.id, v_product.sku, v_product.name, v_product.category_id, v_product.category_name,
      coalesce(nullif(p_customer_name, ''), v_customer_name), p_order_type, v_quantity_int,
      v_before_qty, v_after_qty, v_price, v_amount, v_order_id, v_order_no,
      p_operator, concat_ws('；', '单号：' || v_order_no, '客户：' || coalesce(nullif(p_customer_name, ''), v_customer_name), nullif(v_item->>'remark', ''), nullif(p_remark, ''))
    );
  end loop;

  return v_order_id;
end;
$$;

grant execute on function public.create_delivery_order_transaction(text, uuid, text, text, date, text, text, jsonb, uuid) to authenticated;

create or replace function public.delete_delivery_order_transaction(
  p_order_id uuid,
  p_operator text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.delivery_orders%rowtype;
  v_item public.delivery_order_items%rowtype;
  v_product public.products%rowtype;
  v_quantity_int integer;
  v_delta integer;
  v_before_qty integer;
  v_after_qty integer;
begin
  select * into v_order
  from public.delivery_orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception '单据不存在';
  end if;

  if v_order.order_type not in ('sale_out', 'sale_return') then
    raise exception '只允许删除销售出库或销售退货单';
  end if;

  for v_item in
    select * from public.delivery_order_items where delivery_order_id = p_order_id
  loop
    select * into v_product
    from public.products
    where id = v_item.product_id
    for update;

    if v_product.id is null then
      raise exception '商品不存在';
    end if;

    v_quantity_int := abs(round(v_item.quantity)::integer);
    v_delta := case when v_order.order_type = 'sale_out' then v_quantity_int else -v_quantity_int end;
    v_before_qty := v_product.quantity;
    v_after_qty := v_before_qty + v_delta;

    if v_after_qty < 0 then
      raise exception '删除该销售退货单会导致商品 % 库存小于 0，已取消删除', v_product.name;
    end if;

    update public.products set quantity = v_after_qty where id = v_product.id;

    insert into public.stock_logs (
      product_id, product_sku, product_name, category_id, category_name,
      customer_name, type, quantity, before_qty, after_qty, unit_price,
      amount, order_id, order_no, operator, remark
    )
    values (
      v_product.id, v_product.sku, v_product.name, v_product.category_id, v_product.category_name,
      v_order.customer_name, 'system_delete', v_quantity_int, v_before_qty, v_after_qty,
      v_item.price, v_item.amount, v_order.id, v_order.order_no, p_operator,
      '删除单据自动恢复库存'
    );
  end loop;

  delete from public.delivery_orders where id = p_order_id;
end;
$$;

grant execute on function public.delete_delivery_order_transaction(uuid, text) to authenticated;

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
drop policy if exists "Development users can manage product categories" on public.product_categories;
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

create policy "Development users can manage product categories"
on public.product_categories for all to anon, authenticated using (true) with check (true);

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
