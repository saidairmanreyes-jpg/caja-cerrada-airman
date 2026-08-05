-- Script de configuración para el módulo de Control de Procesos Externos en Supabase

-- 1. Tabla de Procesos Externos (Arreglos y Serigrafía)
CREATE TABLE IF NOT EXISTS public.external_processes (
  id TEXT PRIMARY KEY, -- Ej: EXT-ARR-1001 o EXT-SER-1002
  section TEXT NOT NULL, -- 'ARREGLOS' o 'SERIGRAFIA'
  pedido_num TEXT NOT NULL,
  cliente TEXT NOT NULL,
  total_piezas INTEGER NOT NULL DEFAULT 0,
  proceso_nombre TEXT NOT NULL,
  proveedor_nombre TEXT NOT NULL,
  unit_cost NUMERIC(10,2) DEFAULT 0.00,
  total_cost NUMERIC(10,2) DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'PENDIENTE', -- 'PENDIENTE', 'ENTREGADO_PROVEEDOR', 'RECIBIDO'
  fecha_salida TIMESTAMP WITH TIME ZONE,
  user_salida TEXT,
  fecha_recepcion TIMESTAMP WITH TIME ZONE,
  user_recepcion TEXT,
  warehouse TEXT DEFAULT 'MATRIZ',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabla de Proveedores de Procesos Externos
CREATE TABLE IF NOT EXISTS public.external_suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  section TEXT NOT NULL, -- 'ARREGLOS' o 'SERIGRAFIA'
  name TEXT NOT NULL,
  contact_info TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabla de Tipos de Procesos y Costos Unitarios
CREATE TABLE IF NOT EXISTS public.external_process_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  section TEXT NOT NULL, -- 'ARREGLOS' o 'SERIGRAFIA'
  name TEXT NOT NULL,
  unit_cost NUMERIC(10,2) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en las tablas
ALTER TABLE public.external_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_process_types ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura/escritura pública para usuarios autenticados
CREATE POLICY "Public read external_processes" ON public.external_processes FOR SELECT USING (true);
CREATE POLICY "Public insert external_processes" ON public.external_processes FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update external_processes" ON public.external_processes FOR UPDATE USING (true);
CREATE POLICY "Public delete external_processes" ON public.external_processes FOR DELETE USING (true);

CREATE POLICY "Public read external_suppliers" ON public.external_suppliers FOR SELECT USING (true);
CREATE POLICY "Public insert external_suppliers" ON public.external_suppliers FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update external_suppliers" ON public.external_suppliers FOR UPDATE USING (true);
CREATE POLICY "Public delete external_suppliers" ON public.external_suppliers FOR DELETE USING (true);

CREATE POLICY "Public read external_process_types" ON public.external_process_types FOR SELECT USING (true);
CREATE POLICY "Public insert external_process_types" ON public.external_process_types FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update external_process_types" ON public.external_process_types FOR UPDATE USING (true);
CREATE POLICY "Public delete external_process_types" ON public.external_process_types FOR DELETE USING (true);
