-- Ejecutar este script en el editor SQL de Supabase para crear la tabla de perfiles

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firebase_uid TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'operator', -- 'master' o 'operator'
  permissions JSONB DEFAULT '{"reception": true, "picking": true, "inventory": true, "admin": false}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Política simple: cualquier usuario autenticado puede leer perfiles 
-- (Esto permite que el frontend lea el rol en el login)
CREATE POLICY "Public perfiles are viewable by everyone" 
ON public.profiles FOR SELECT 
USING (true);

-- Política para que el Master pueda insertar
CREATE POLICY "Only masters can insert profiles" 
ON public.profiles FOR INSERT 
WITH CHECK (role = 'master' OR EXISTS (SELECT 1 FROM public.profiles WHERE firebase_uid = auth.uid()::text AND role = 'master'));

-- Política para que el Master pueda actualizar
CREATE POLICY "Only masters can update profiles" 
ON public.profiles FOR UPDATE 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE firebase_uid = auth.uid()::text AND role = 'master'));

-- (Opcional) Creación manual del primer usuario Master
-- Después de que el Master inicie sesión en la app (para que Firebase le asigne un UID),
-- debes venir aquí y hacer este INSERT reemplazando SU_UID_DE_FIREBASE y el email:
-- 
-- INSERT INTO public.profiles (firebase_uid, email, name, role, permissions)
-- VALUES ('SU_UID_DE_FIREBASE', 'usuario_master@correo.com', 'Master', 'master', '{"reception": true, "picking": true, "inventory": true, "admin": true}'::jsonb);
