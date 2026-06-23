-- 1. Update Existing Inventory Records
UPDATE public.inventory 
SET warehouse = 'MEXICO' 
WHERE warehouse = 'CDMX';

UPDATE public.inventory 
SET warehouse = 'MONTERREY' 
WHERE warehouse = 'MTY';

-- 2. Update KANBAN Configuration Rules
UPDATE public.kanban_config 
SET warehouse_dest = 'MEXICO' 
WHERE warehouse_dest = 'CDMX';

UPDATE public.kanban_config 
SET warehouse_dest = 'MONTERREY' 
WHERE warehouse_dest = 'MTY';

-- 3. Verify changes (Optional)
-- SELECT DISTINCT warehouse FROM public.inventory;
-- SELECT DISTINCT warehouse_dest FROM public.kanban_config;
