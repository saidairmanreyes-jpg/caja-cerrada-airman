alter table public.pedido_status
add column if not exists warehouse text,
add column if not exists fecha_creacion text,
add column if not exists total_prendas integer default 0,
add column if not exists surtidor text;
