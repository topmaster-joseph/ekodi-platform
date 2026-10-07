create index if not exists trade_supply_routes_supplier_idx on public.trade_supply_routes(supplier_counterparty_id);
create index if not exists trade_supply_routes_created_by_idx on public.trade_supply_routes(created_by);
create index if not exists trade_sales_markets_dealer_idx on public.trade_sales_markets(dealer_counterparty_id);
create index if not exists trade_sales_markets_created_by_idx on public.trade_sales_markets(created_by);
