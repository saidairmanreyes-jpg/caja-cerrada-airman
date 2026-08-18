-- Script SQL para crear las tablas del módulo de Procesos Externos en Supabase
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> Run

-- 1. Tabla de Registros / Pedidos
CREATE TABLE IF NOT EXISTS public.external_processes (
    id TEXT PRIMARY KEY,
    section TEXT NOT NULL DEFAULT 'ARREGLOS',
    pedido_num TEXT NOT NULL,
    cliente TEXT NOT NULL,
    total_piezas INT NOT NULL DEFAULT 0,
    proceso_nombre TEXT,
    proveedor_nombre TEXT DEFAULT '',
    unit_cost NUMERIC(10,2) DEFAULT 0,
    total_cost NUMERIC(10,2) DEFAULT 0,
    procesos_detalle TEXT,
    observaciones TEXT,
    status TEXT NOT NULL DEFAULT 'PENDIENTE',
    warehouse TEXT DEFAULT 'MATRIZ',
    created_by_uid TEXT,
    created_by_name TEXT,
    assigned_by TEXT,
    assigned_at TIMESTAMP WITH TIME ZONE,
    fecha_salida TIMESTAMP WITH TIME ZONE,
    user_salida TEXT,
    fecha_recepcion TIMESTAMP WITH TIME ZONE,
    user_recepcion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabla de Proveedores de Maquila
CREATE TABLE IF NOT EXISTS public.external_suppliers (
    id BIGSERIAL PRIMARY KEY,
    section TEXT NOT NULL DEFAULT 'ARREGLOS',
    name TEXT NOT NULL,
    contact_info TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabla de Catálogo de Tipos de Proceso y Costos
CREATE TABLE IF NOT EXISTS public.external_process_types (
    id BIGSERIAL PRIMARY KEY,
    section TEXT NOT NULL DEFAULT 'ARREGLOS',
    name TEXT NOT NULL,
    unit_cost NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Permisos RLS (Permitir lectura y escritura a usuarios autenticados y anon)
ALTER TABLE public.external_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_process_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to external_processes" ON public.external_processes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to external_suppliers" ON public.external_suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to external_process_types" ON public.external_process_types FOR ALL USING (true) WITH CHECK (true);
