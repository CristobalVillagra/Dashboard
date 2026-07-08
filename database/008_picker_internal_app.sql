-- ============================================================
-- 008_picker_internal_app.sql
-- Panel Picker interno — sin WhatsApp para pickers
-- Compatible con migraciones anteriores (uses IF NOT EXISTS)
-- ============================================================

-- 1. Extender rol en usuarios para incluir 'picker'
DO $$
BEGIN
  -- Intentar agregar 'picker' al CHECK constraint de rol
  ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('runner', 'admin', 'picker'));

-- 2. Habilitar pg_trgm para busqueda fuzzy
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 3. Agregar columnas de canal app a consultas_sku
ALTER TABLE public.consultas_sku
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'whatsapp'
    CHECK (canal IN ('whatsapp', 'app'));

ALTER TABLE public.consultas_sku
  ADD COLUMN IF NOT EXISTS leida_picker boolean NOT NULL DEFAULT false;

ALTER TABLE public.consultas_sku
  ADD COLUMN IF NOT EXISTS notificacion_enviada boolean NOT NULL DEFAULT false;

-- 4. Tabla de mensajes por consulta (chat interno)
-- Si la tabla ya existe con columnas distintas (autor_rol/mensaje), se agregan las requeridas
CREATE TABLE IF NOT EXISTS public.consulta_sku_mensajes (
  id           bigserial PRIMARY KEY,
  consulta_id  bigint NOT NULL,
  autor_rol    text NOT NULL,
  autor_nombre text,
  mensaje      text NOT NULL,
  metadata     jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Columnas necesarias para el sistema picker (pueden ya existir)
ALTER TABLE public.consulta_sku_mensajes ADD COLUMN IF NOT EXISTS rol_emisor text;
ALTER TABLE public.consulta_sku_mensajes ADD COLUMN IF NOT EXISTS telefono   text;
ALTER TABLE public.consulta_sku_mensajes ADD COLUMN IF NOT EXISTS nombre     text;
ALTER TABLE public.consulta_sku_mensajes ADD COLUMN IF NOT EXISTS contenido  text;
ALTER TABLE public.consulta_sku_mensajes ADD COLUMN IF NOT EXISTS leido      boolean NOT NULL DEFAULT false;

-- Columna updated_at en respaldos_pedido
ALTER TABLE public.respaldos_pedido ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_csm_consulta_id
  ON public.consulta_sku_mensajes(consulta_id, created_at);

-- 5. Tabla de notificaciones en-app
CREATE TABLE IF NOT EXISTS public.notificaciones_app (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  telefono     text NOT NULL,
  tipo         text NOT NULL CHECK (tipo IN ('respuesta_lista', 'respaldo_revisado', 'consulta_tomada', 'general')),
  titulo       text NOT NULL,
  cuerpo       text,
  leida        boolean NOT NULL DEFAULT false,
  consulta_id  bigint REFERENCES public.consultas_sku(id) ON DELETE SET NULL,
  respaldo_id  uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_telefono
  ON public.notificaciones_app(telefono, leida, created_at DESC);

-- 6. Tabla de respaldos de pedido
CREATE TABLE IF NOT EXISTS public.respaldos_pedido (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  telefono_picker  text NOT NULL,
  nombre_picker    text,
  identificador    text NOT NULL,
  tipo_servicio    text NOT NULL CHECK (tipo_servicio IN ('bicci', 'driver', 'uber', 'pickup')),
  foto_urls        text[] NOT NULL DEFAULT '{}',
  estado           text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'revisado', 'rechazado')),
  notas_admin      text,
  drive_url        text,
  sheet_row        text,
  local_id         uuid,
  revisado_por     text,
  revisado_en      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Agregar columnas nuevas si la tabla ya existia con columnas base
ALTER TABLE public.respaldos_pedido
  ADD COLUMN IF NOT EXISTS telefono_picker text;
ALTER TABLE public.respaldos_pedido
  ADD COLUMN IF NOT EXISTS nombre_picker text;
ALTER TABLE public.respaldos_pedido
  ADD COLUMN IF NOT EXISTS tipo_servicio text;
ALTER TABLE public.respaldos_pedido
  ADD COLUMN IF NOT EXISTS foto_urls text[];
ALTER TABLE public.respaldos_pedido
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'pendiente';
ALTER TABLE public.respaldos_pedido
  ADD COLUMN IF NOT EXISTS notas_admin text;
ALTER TABLE public.respaldos_pedido
  ADD COLUMN IF NOT EXISTS drive_url text;
ALTER TABLE public.respaldos_pedido
  ADD COLUMN IF NOT EXISTS sheet_row text;
ALTER TABLE public.respaldos_pedido
  ADD COLUMN IF NOT EXISTS revisado_por text;
ALTER TABLE public.respaldos_pedido
  ADD COLUMN IF NOT EXISTS revisado_en timestamptz;

CREATE INDEX IF NOT EXISTS idx_respaldos_picker
  ON public.respaldos_pedido(telefono_picker, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_respaldos_estado
  ON public.respaldos_pedido(estado, created_at DESC);

-- 7. RLS — solo service_role accede desde el backend
ALTER TABLE public.consulta_sku_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones_app     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.respaldos_pedido       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "srv_consulta_sku_mensajes" ON public.consulta_sku_mensajes;
CREATE POLICY "srv_consulta_sku_mensajes"
  ON public.consulta_sku_mensajes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "srv_notificaciones_app" ON public.notificaciones_app;
CREATE POLICY "srv_notificaciones_app"
  ON public.notificaciones_app FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "srv_respaldos_pedido" ON public.respaldos_pedido;
CREATE POLICY "srv_respaldos_pedido"
  ON public.respaldos_pedido FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- 8. FUNCIONES
-- ============================================================

-- 8a. Busqueda fuzzy de productos para picker
DROP FUNCTION IF EXISTS public.search_picker_products(text, text, text, text, integer);
CREATE OR REPLACE FUNCTION public.search_picker_products(
  p_query  text    DEFAULT NULL,
  p_area   text    DEFAULT NULL,
  p_marca  text    DEFAULT NULL,
  p_sku    text    DEFAULT NULL,
  p_limit  int     DEFAULT 30
)
RETURNS TABLE (
  sku              text,
  nombre_producto  text,
  marca_producto   text,
  area             text,
  imagen_url       text,
  activo           boolean,
  similarity_score real
)
LANGUAGE sql STABLE AS $$
  SELECT
    sp.sku,
    sp.nombre_producto,
    sp.marca_producto,
    sp.area,
    sp.imagen_url,
    sp.activo,
    CASE
      WHEN p_query IS NULL OR p_query = '' THEN 1.0
      ELSE GREATEST(
        similarity(lower(coalesce(sp.nombre_producto,'')), lower(p_query)),
        similarity(lower(coalesce(sp.marca_producto,'')),  lower(p_query)),
        similarity(lower(sp.sku),                          lower(p_query)),
        CASE WHEN lower(coalesce(sp.nombre_producto,'')) ILIKE '%'||lower(p_query)||'%' THEN 0.6 ELSE 0 END,
        CASE WHEN lower(coalesce(sp.marca_producto,''))  ILIKE '%'||lower(p_query)||'%' THEN 0.5 ELSE 0 END,
        CASE WHEN lower(sp.sku)                          ILIKE '%'||lower(p_query)||'%' THEN 0.7 ELSE 0 END
      )
    END::real
  FROM public.sku_productos sp
  WHERE
    sp.activo = true
    AND (p_area  IS NULL OR p_area  = '' OR sp.area = lower(p_area))
    AND (p_marca IS NULL OR p_marca = '' OR lower(coalesce(sp.marca_producto,'')) ILIKE '%'||lower(p_marca)||'%')
    AND (p_sku   IS NULL OR p_sku   = '' OR upper(sp.sku) ILIKE '%'||upper(p_sku)||'%')
    AND (
      p_query IS NULL OR p_query = ''
      OR lower(coalesce(sp.nombre_producto,'')) ILIKE '%'||lower(p_query)||'%'
      OR lower(coalesce(sp.marca_producto,''))  ILIKE '%'||lower(p_query)||'%'
      OR lower(sp.sku)                          ILIKE '%'||lower(p_query)||'%'
      OR similarity(lower(coalesce(sp.nombre_producto,'')), lower(p_query)) > 0.12
      OR similarity(lower(coalesce(sp.marca_producto,'')),  lower(p_query)) > 0.12
    )
  ORDER BY
    CASE
      WHEN p_query IS NULL OR p_query = '' THEN 1.0
      ELSE GREATEST(
        similarity(lower(coalesce(sp.nombre_producto,'')), lower(p_query)),
        similarity(lower(coalesce(sp.marca_producto,'')),  lower(p_query)),
        similarity(lower(sp.sku),                          lower(p_query)),
        CASE WHEN lower(coalesce(sp.nombre_producto,'')) ILIKE '%'||lower(p_query)||'%' THEN 0.6 ELSE 0 END,
        CASE WHEN lower(coalesce(sp.marca_producto,''))  ILIKE '%'||lower(p_query)||'%' THEN 0.5 ELSE 0 END,
        CASE WHEN lower(sp.sku)                          ILIKE '%'||lower(p_query)||'%' THEN 0.7 ELSE 0 END
      )
    END DESC,
    sp.nombre_producto ASC
  LIMIT p_limit;
$$;

-- 8b. Crear consulta desde picker (app-canal)
DROP FUNCTION IF EXISTS public.create_picker_product_query(text, text, text, text, text, text, uuid);
CREATE OR REPLACE FUNCTION public.create_picker_product_query(
  p_telefono_picker  text,
  p_nombre_picker    text,
  p_sku              text,
  p_area             text    DEFAULT NULL,
  p_marca_producto   text    DEFAULT NULL,
  p_mensaje          text    DEFAULT NULL,
  p_local_id         uuid    DEFAULT NULL
)
RETURNS TABLE (consulta_id bigint, sku text, estado text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id   bigint;
  v_msg  text;
BEGIN
  v_msg := coalesce(nullif(trim(p_mensaje), ''), 'Consulta: ' || upper(p_sku));

  -- picker_nombre es la columna real en consultas_sku
  INSERT INTO public.consultas_sku (
    sku, marca_producto, area, telefono_picker, picker_nombre,
    mensaje_original, estado, canal, whatsapp_enviado,
    instancia, local_id, created_at
  ) VALUES (
    upper(p_sku),
    p_marca_producto,
    NULLIF(lower(trim(coalesce(p_area, ''))), ''),
    p_telefono_picker,
    p_nombre_picker,
    v_msg,
    'pendiente_sin_asignar',
    'app',
    true,
    'app',
    p_local_id,
    now()
  )
  RETURNING id INTO v_id;

  -- autor_rol y mensaje son NOT NULL (columnas originales); rol_emisor/nombre/contenido son alias nuevos
  INSERT INTO public.consulta_sku_mensajes (
    consulta_id, autor_rol, autor_nombre, mensaje,
    rol_emisor, telefono, nombre, contenido, created_at
  ) VALUES (
    v_id, 'picker', p_nombre_picker, v_msg,
    'picker', p_telefono_picker, p_nombre_picker, v_msg, now()
  );

  RETURN QUERY SELECT v_id, upper(p_sku), 'pendiente_sin_asignar'::text;
END;
$$;

-- 8c. Registrar respuesta runner para consultas en-app
DROP FUNCTION IF EXISTS public.register_runner_answer_for_app(bigint[], text, text, text, text, text, boolean, text);
CREATE OR REPLACE FUNCTION public.register_runner_answer_for_app(
  p_consulta_ids     bigint[],
  p_sku              text,
  p_telefono_runner  text,
  p_nombre_runner    text,
  p_respuesta        text,
  p_estado_respuesta text,
  p_respuesta_fija   boolean DEFAULT false,
  p_canal            text    DEFAULT 'app'
)
RETURNS TABLE (updated_count int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_nuevo_estado text;
  v_responded_at timestamptz;
BEGIN
  v_nuevo_estado :=
    CASE
      WHEN p_estado_respuesta = 'no_disponible' THEN 'no_disponible'
      WHEN p_estado_respuesta = 'ir_a_revisar'  THEN 'en_revision'
      ELSE 'respondido'
    END;

  v_responded_at := CASE WHEN p_estado_respuesta = 'ir_a_revisar' THEN NULL ELSE now() END;

  UPDATE public.consultas_sku SET
    estado           = v_nuevo_estado,
    respuesta_runner = p_respuesta,
    estado_respuesta = p_estado_respuesta,
    responded_at     = v_responded_at,
    nombre_runner    = p_nombre_runner,
    telefono_runner  = p_telefono_runner,
    respuesta_fija   = p_respuesta_fija,
    leida_picker     = false
  WHERE id = ANY(p_consulta_ids)
    AND sku = upper(p_sku);

  -- Mensaje runner (autor_rol/mensaje NOT NULL; rol_emisor/contenido son alias nuevos)
  INSERT INTO public.consulta_sku_mensajes (
    consulta_id, autor_rol, autor_nombre, mensaje,
    rol_emisor, telefono, nombre, contenido, created_at
  )
  SELECT
    id, 'runner', p_nombre_runner, p_respuesta,
    'runner', p_telefono_runner, p_nombre_runner, p_respuesta, now()
  FROM public.consultas_sku
  WHERE id = ANY(p_consulta_ids)
    AND sku = upper(p_sku)
    AND canal = 'app';

  -- Notificacion en-app (notificaciones_app usa titulo/cuerpo/referencia_id)
  INSERT INTO public.notificaciones_app (
    telefono, tipo, titulo, cuerpo,
    referencia_tipo, referencia_id, leida, created_at
  )
  SELECT
    c.telefono_picker,
    'respuesta_lista',
    'Respuesta a SKU ' || upper(p_sku),
    p_respuesta,
    'consulta_sku',
    c.id::text,
    false,
    now()
  FROM public.consultas_sku c
  WHERE c.id = ANY(p_consulta_ids)
    AND c.canal = 'app'
    AND c.telefono_picker IS NOT NULL;

  RETURN QUERY SELECT array_length(p_consulta_ids, 1);
END;
$$;

-- 8d. Crear respaldo de pedido desde picker
-- foto_urls en respaldos_pedido es jsonb, se convierte desde text[]
DROP FUNCTION IF EXISTS public.create_picker_backup_report(text, text, text, text, text[], uuid);
CREATE OR REPLACE FUNCTION public.create_picker_backup_report(
  p_telefono_picker  text,
  p_nombre_picker    text,
  p_identificador    text,
  p_tipo_servicio    text,
  p_foto_urls        text[],
  p_local_id         uuid DEFAULT NULL
)
RETURNS TABLE (respaldo_id uuid, estado text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.respaldos_pedido (
    telefono_picker, nombre_picker,
    identificador, tipo_servicio,
    foto_urls, estado,
    local_id, created_at, updated_at
  ) VALUES (
    p_telefono_picker,
    p_nombre_picker,
    p_identificador,
    p_tipo_servicio,
    to_json(p_foto_urls)::jsonb,
    'pendiente',
    p_local_id,
    now(),
    now()
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, 'pendiente'::text;
END;
$$;

-- fin de migración 008
