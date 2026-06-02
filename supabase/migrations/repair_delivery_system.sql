-- Safe incremental repair for delivery, sales stock, stock logs, order numbers, and soft deletion.
-- This file is repeatable and keeps existing business data.

create extension if not exists pgcrypto;

alter table public.products add column if not exists is_deleted boolean not null default false;
alter table public.products add column if not exists deleted_at timestamptz;
alter table public.products add column if not exists category_id bigint;
alter table public.products add column if not exists category_name text;

create table if not exists public.product_categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  remark text,
  created_at timestamptz not null default now()
);

alter table public.products
drop constraint if exists products_category_id_fkey;

alter table public.products
add constraint products_category_id_fkey
foreign key (category_id) references public.product_categories(id) on delete set null;

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
alter table public.stock_logs add column if not exists is_deleted boolean not null default false;
alter table public.stock_logs add column if not exists deleted_at timestamptz;
alter table public.stock_logs add column if not exists deleted_by text;

alter table public.stock_logs
drop constraint if exists stock_logs_product_id_fkey;

alter table public.stock_logs
add constraint stock_logs_product_id_fkey
foreign key (product_id) references public.products(id) on delete restrict;

alter table public.stock_logs
drop constraint if exists stock_logs_quantity_check;

alter table public.stock_logs
add constraint stock_logs_quantity_check
check (quantity <> 0);

alter table public.stock_logs
drop constraint if exists stock_logs_type_check;

alter table public.stock_logs
add constraint stock_logs_type_check
check (type in ('purchase_in', 'purchase_return', 'sale_out', 'sale_return', 'adjustment', 'system_delete'));

alter table public.delivery_orders add column if not exists order_type text not null default 'sale_out';
alter table public.delivery_orders add column if not exists status text not null default 'saved';
alter table public.delivery_orders add column if not exists is_deleted boolean not null default false;
alter table public.delivery_orders add column if not exists deleted_at timestamptz;
alter table public.delivery_orders add column if not exists deleted_by text;
alter table public.delivery_orders add column if not exists updated_at timestamptz;

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

alter table public.delivery_order_items add column if not exists category_name text;
alter table public.delivery_order_items add column if not exists is_deleted boolean not null default false;
alter table public.delivery_order_items add column if not exists deleted_at timestamptz;

alter table public.delivery_order_items
drop constraint if exists delivery_order_items_delivery_order_id_fkey;

alter table public.delivery_order_items
add constraint delivery_order_items_delivery_order_id_fkey
foreign key (delivery_order_id) references public.delivery_orders(id) on delete restrict;

create index if not exists idx_products_is_deleted on public.products (is_deleted);
create index if not exists idx_products_category_id on public.products (category_id);
create index if not exists idx_product_categories_name on public.product_categories (name);
create index if not exists idx_stock_logs_created_at on public.stock_logs (created_at desc);
create index if not exists idx_stock_logs_product_id on public.stock_logs (product_id);
create index if not exists idx_stock_logs_type on public.stock_logs (type);
create index if not exists idx_stock_logs_category_id on public.stock_logs (category_id);
create index if not exists idx_stock_logs_order_id on public.stock_logs (order_id);
create index if not exists idx_stock_logs_is_deleted on public.stock_logs (is_deleted);
create index if not exists idx_delivery_orders_order_no on public.delivery_orders (order_no);
create index if not exists idx_delivery_orders_customer_id on public.delivery_orders (customer_id);
create index if not exists idx_delivery_orders_order_type on public.delivery_orders (order_type);
create index if not exists idx_delivery_orders_created_at on public.delivery_orders (created_at desc);
create index if not exists idx_delivery_orders_is_deleted on public.delivery_orders (is_deleted);
create index if not exists idx_delivery_order_items_order_id on public.delivery_order_items (delivery_order_id);
create index if not exists idx_delivery_order_items_is_deleted on public.delivery_order_items (is_deleted);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_delivery_orders_updated_at on public.delivery_orders;

create trigger trg_delivery_orders_updated_at
before update on public.delivery_orders
for each row
execute function public.set_updated_at();

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

grant execute on function public.next_delivery_order_no() to anon, authenticated;

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
    where id = p_order_id and is_deleted = false
    for update;

    if v_existing_order.id is null then
      raise exception '单据不存在';
    end if;

    for v_existing_item in
      select *
      from public.delivery_order_items
      where delivery_order_id = p_order_id and is_deleted = false
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

    update public.delivery_order_items
    set is_deleted = true,
        deleted_at = now()
    where delivery_order_id = p_order_id and is_deleted = false;
  end if;

  if p_order_id is not null then
    v_order_id := p_order_id;
    v_order_no := coalesce(nullif(btrim(coalesce(p_order_no, '')), ''), v_existing_order.order_no);
  else
    v_order_id := gen_random_uuid();
    v_order_no := coalesce(nullif(btrim(coalesce(p_order_no, '')), ''), public.next_delivery_order_no());
  end if;

  perform pg_advisory_xact_lock(hashtext('delivery_order_save_' || v_order_no));

  if exists (
    select 1
    from public.delivery_orders
    where order_no = v_order_no
      and (p_order_id is null or id <> p_order_id)
  ) then
    raise exception '订单号已存在：%', v_order_no using errcode = '23505';
  end if;

  if p_order_id is not null then
    update public.delivery_orders
    set order_no = v_order_no,
        customer_id = p_customer_id,
        customer_name = coalesce(nullif(p_customer_name, ''), v_customer_name),
        order_type = p_order_type,
        status = 'saved',
        delivery_date = p_delivery_date,
        operator = p_operator,
        remark = nullif(p_remark, ''),
        is_deleted = false,
        deleted_at = null,
        deleted_by = null
    where id = p_order_id;
  else
    insert into public.delivery_orders (
      id, order_no, customer_id, customer_name, order_type, status,
      delivery_date, operator, remark
    )
    values (
      v_order_id, v_order_no, p_customer_id, coalesce(nullif(p_customer_name, ''), v_customer_name),
      p_order_type, 'saved', p_delivery_date, p_operator, nullif(p_remark, '')
    );
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product
    from public.products
    where id = (v_item->>'product_id')::bigint and is_deleted = false
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
      unit, quantity, price, amount, remark, category_name
    )
    values (
      v_order_id, v_product.id, v_product.sku, v_product.name, null,
      v_product.unit, v_quantity, v_price, v_amount, nullif(v_item->>'remark', ''), v_product.category_name
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

grant execute on function public.create_delivery_order_transaction(text, uuid, text, text, date, text, text, jsonb, uuid) to anon, authenticated;

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
  where id = p_order_id and is_deleted = false
  for update;

  if v_order.id is null then
    raise exception '单据不存在';
  end if;

  if v_order.order_type not in ('sale_out', 'sale_return') then
    raise exception '只允许处理销售出库或销售退货单';
  end if;

  for v_item in
    select *
    from public.delivery_order_items
    where delivery_order_id = p_order_id and is_deleted = false
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
      raise exception '处理该销售退货单会导致商品 % 库存小于 0，已取消', v_product.name;
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
      '单据软删除自动恢复库存'
    );
  end loop;

  update public.delivery_order_items
  set is_deleted = true,
      deleted_at = now()
  where delivery_order_id = p_order_id and is_deleted = false;

  update public.delivery_orders
  set is_deleted = true,
      status = 'deleted',
      deleted_at = now(),
      deleted_by = p_operator
  where id = p_order_id;
end;
$$;

grant execute on function public.delete_delivery_order_transaction(uuid, text) to anon, authenticated;

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
  target_log public.stock_logs%rowtype;
  current_qty integer;
  restore_delta integer;
  user_role text;
begin
  select role into user_role
  from public.app_users
  where username = p_username and status = 'active';

  if user_role is distinct from 'admin' then
    raise exception '权限不足，只有管理员才能删除库存流水';
  end if;

  select * into target_log
  from public.stock_logs
  where id = p_log_id and is_deleted = false
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

  if restore_delta <> 0 then
    select quantity into current_qty
    from public.products
    where id = target_log.product_id
    for update;

    if current_qty is null then
      raise exception '商品不存在，无法恢复库存';
    end if;

    if current_qty + restore_delta < 0 then
      raise exception '删除该库存流水会导致商品库存小于 0，已取消';
    end if;

    update public.products
    set quantity = current_qty + restore_delta
    where id = target_log.product_id;
  end if;

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

  update public.stock_logs
  set is_deleted = true,
      deleted_at = now(),
      deleted_by = p_username
  where id = p_log_id;
end;
$$;

grant execute on function public.delete_stock_log(bigint, text) to anon, authenticated;

alter table public.product_categories enable row level security;
alter table public.stock_logs enable row level security;
alter table public.delivery_orders enable row level security;
alter table public.delivery_order_items enable row level security;

drop policy if exists "Development users can manage product categories" on public.product_categories;
create policy "Development users can manage product categories"
on public.product_categories for all to anon, authenticated using (true) with check (true);

drop policy if exists "Development users can read stock logs" on public.stock_logs;
create policy "Development users can read stock logs"
on public.stock_logs for select to anon, authenticated using (true);

drop policy if exists "Development users can insert stock logs" on public.stock_logs;
create policy "Development users can insert stock logs"
on public.stock_logs for insert to anon, authenticated with check (true);

drop policy if exists "Development users can update stock logs" on public.stock_logs;
create policy "Development users can update stock logs"
on public.stock_logs for update to anon, authenticated using (true) with check (true);

drop policy if exists "Development users can manage delivery orders" on public.delivery_orders;
create policy "Development users can manage delivery orders"
on public.delivery_orders for all to anon, authenticated using (true) with check (true);

drop policy if exists "Development users can manage delivery order items" on public.delivery_order_items;
create policy "Development users can manage delivery order items"
on public.delivery_order_items for all to anon, authenticated using (true) with check (true);

drop policy if exists "Authenticated users can manage product categories" on public.product_categories;
create policy "Authenticated users can manage product categories"
on public.product_categories for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can read stock logs" on public.stock_logs;
create policy "Authenticated users can read stock logs"
on public.stock_logs for select to authenticated using (true);

drop policy if exists "Authenticated users can insert stock logs" on public.stock_logs;
create policy "Authenticated users can insert stock logs"
on public.stock_logs for insert to authenticated with check (true);

drop policy if exists "Authenticated users can update stock logs" on public.stock_logs;
create policy "Authenticated users can update stock logs"
on public.stock_logs for update to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can manage delivery orders" on public.delivery_orders;
create policy "Authenticated users can manage delivery orders"
on public.delivery_orders for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can manage delivery order items" on public.delivery_order_items;
create policy "Authenticated users can manage delivery order items"
on public.delivery_order_items for all to authenticated using (true) with check (true);
