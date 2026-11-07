-- Let administrators correct the quote on a completed wash explicitly.
-- Ordinary completion and record edits still omit the order price columns.
create or replace function private.cf_preserve_wash_order_price()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if tg_op='UPDATE' then
    if (old.approved or old.paid) and (new.approved or new.paid)
       and auth.uid() is not null and public.cf_is_admin() then
      if new.order_cost is not distinct from old.order_cost then
        new.order_currency:=old.order_currency;
      elsif new.order_cost is null then
        new.order_currency:=null;
      else
        if new.order_cost<0 or new.order_cost::text in ('NaN','Infinity','-Infinity')
           or new.order_cost<>round(new.order_cost,2) then
          raise exception 'Podaj poprawną kwotę zlecenia z dokładnością do dwóch miejsc po przecinku.'
            using errcode='22023';
        end if;
        new.order_currency:=coalesce(old.order_currency,old.currency);
      end if;
    elsif old.order_cost is not null then
      new.order_cost:=old.order_cost;
      new.order_currency:=old.order_currency;
    end if;
  elsif not new.approved and not new.paid and new.order_cost is null then
    new.order_cost:=new.cost;
    new.order_currency:=new.currency;
  end if;
  return new;
end;
$$;
