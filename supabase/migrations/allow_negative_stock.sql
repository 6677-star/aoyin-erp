-- Allow negative stock balances for all stock-changing operations.
alter table public.products drop constraint if exists products_quantity_check;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'products'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* 'quantity'
      and pg_get_constraintdef(con.oid) ~* '>=[[:space:]]*0'
  loop
    execute format('alter table public.products drop constraint if exists %I', constraint_name);
  end loop;
end;
$$;

create or replace function public.move_stock(
  p_product_id bigint,
  p_type text,
  p_quantity integer,
  p_operator text,
  p_remark text default null,
  p_stock_date date default null
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
    remark,
    created_at
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
    p_remark,
    coalesce(p_stock_date, current_date)::timestamptz
  );
end;
$$;

grant execute on function public.move_stock(bigint, text, integer, text, text) to authenticated;
grant execute on function public.move_stock(bigint, text, integer, text, text, date) to authenticated;
grant execute on function public.move_stock(bigint, text, integer, text, text) to anon;
grant execute on function public.move_stock(bigint, text, integer, text, text, date) to anon;

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
      select * from public.delivery_order_items where delivery_order_id = p_order_id and coalesce(is_deleted, false) = false
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
    where delivery_order_id = p_order_id and coalesce(is_deleted, false) = false;
  end if;

  v_order_no := nullif(btrim(coalesce(p_order_no, '')), '');
  if v_order_no is null then
    v_order_no := public.next_delivery_order_no();
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
    v_order_id := p_order_id;
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
    order_no, customer_id, customer_name, order_type, status,
    delivery_date, operator, remark
  )
  values (
    v_order_no, p_customer_id, coalesce(nullif(p_customer_name, ''), v_customer_name),
    p_order_type, 'saved', p_delivery_date, p_operator, nullif(p_remark, '')
  )
  returning id into v_order_id;
  end if;

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
grant execute on function public.create_delivery_order_transaction(text, uuid, text, text, date, text, text, jsonb, uuid) to anon;

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
  where id = p_order_id and deleted_at is null and status = 'saved'
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

  update public.delivery_orders
  set status = 'deleted',
      is_deleted = true,
      deleted_at = now(),
      deleted_by = p_operator
  where id = p_order_id;
end;
$$;

grant execute on function public.delete_delivery_order_transaction(uuid, text) to authenticated;
grant execute on function public.delete_delivery_order_transaction(uuid, text) to anon;
