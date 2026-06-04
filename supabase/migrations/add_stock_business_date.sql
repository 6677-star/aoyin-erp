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

grant execute on function public.move_stock(bigint, text, integer, text, text, date) to anon, authenticated;
