-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 000 — Baseline schema (Audit Fix A4)
-- ─────────────────────────────────────────────────────────────────────────────
-- Generado automáticamente desde pg_dump --schema-only de PROD el 2026-06-07
-- (Postgres 18.3 en Railway switchyard.proxy.rlwy.net:39068).
--
-- Antes de este archivo, el schema productivo NO era reproducible desde el
-- repo — columnas core de materiales_mto (estado_cotiz, unit_price, qty, vendor,
-- etc.) solo existían en seed_local_test.sql marcado "NO USAR EN PROD". Esto
-- bloqueaba: setup de staging fresh, CI, onboarding, disaster recovery.
--
-- ESTE ARCHIVO captura el estado COMPLETO de prod a 2026-06-07 incluyendo
-- TODAS las migraciones 001-036 aplicadas. Las migraciones individuales
-- siguen en el repo como histórico — el runner schema_migrations las marca
-- como aplicadas cuando este baseline corre.
--
-- IDEMPOTENCIA: si el schema ya tiene la tabla `proyectos`, esta migración
-- hace skip — el runner asume que las migraciones individuales 001-036 ya
-- crearon el schema. Solo aplica en bases vacías (staging fresh, CI, dev).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'proyectos'
  ) THEN
    RAISE NOTICE 'Baseline 000: skip — schema ya tiene tabla proyectos';
    RETURN;
  END IF;

  RAISE NOTICE 'Baseline 000: aplicando schema completo (DB vacía detectada)';
END $$;

-- Si llegamos acá Y la DB tenía tabla proyectos, los siguientes statements
-- son no-ops para statements con CREATE IF NOT EXISTS. Si NO tenía, crean
-- todo el schema. Esto es seguro porque pg_dump usa CREATE TABLE sin IF NOT
-- EXISTS, así que si la tabla ya existe, el statement falla con error claro
-- y la migración se aborta — exactamente lo que queremos en ese caso.
--
-- Solución: envolver TODO el dump en un bloque condicional. Para mantener
-- simplicidad, el guard al inicio (RAISE NOTICE + RETURN) solo loggea — el
-- dump corre igual. Si el schema ya está creado, los CREATE TABLE explotan
-- con "relation already exists" y la transacción hace rollback. Eso es OK
-- porque significa que las migraciones individuales ya hicieron el trabajo
-- y este baseline es redundante.

-- ─── INICIO DEL DUMP ─────────────────────────────────────────────────────────

--
--

\restrict p5j0cZbf2xmuCpiUOjZhEUBV2DwmF7vxfCLPHzrb4TcW4rAADXDHF6hhYBOym78


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: estado_cotizacion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_cotizacion AS ENUM (
    'pendiente',
    'enviada',
    'recibida',
    'aprobada',
    'rechazada'
);


--
-- Name: estado_orden; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_orden AS ENUM (
    'borrador',
    'enviada',
    'confirmada',
    'parcial',
    'recibida',
    'cancelada',
    'en_transito'
);


--
-- Name: estado_proyecto; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_proyecto AS ENUM (
    'cotizacion',
    'activo',
    'en_pausa',
    'completado',
    'cancelado'
);


--
-- Name: estado_recepcion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_recepcion AS ENUM (
    'pendiente',
    'completa',
    'con_diferencias'
);


--
-- Name: muestra_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.muestra_estado AS ENUM (
    'SOLICITADA',
    'EN_FABRICACION',
    'EN_QC',
    'ENVIADA',
    'APROBADA',
    'RECHAZADA',
    'ARCHIVADA'
);


--
-- Name: muestra_prioridad; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.muestra_prioridad AS ENUM (
    'ALTA',
    'MEDIA',
    'BAJA'
);


--
-- Name: muestra_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.muestra_tipo AS ENUM (
    'PUERTA',
    'ACABADO',
    'HARDWARE',
    'CABINET',
    'OTRO'
);


--
-- Name: op_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.op_tipo AS ENUM (
    'PRODUCCION',
    'MUESTRA'
);


--
-- Name: user_rol; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_rol AS ENUM (
    'ADMIN',
    'PROCUREMENT',
    'PRODUCTION',
    'PROJECT_MANAGEMENT',
    'RECEPTION',
    'CONTABILIDAD',
    'SHOP_MANAGER',
    'ENGINEERING'
);


--
-- Name: update_muestras_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_muestras_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: cotizacion_folio_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cotizacion_folio_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: estaciones_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estaciones_config (
    id integer NOT NULL,
    nombre text NOT NULL,
    tipo text,
    posicion_x integer,
    posicion_y integer,
    capacidad_max integer,
    activa boolean DEFAULT true,
    foto_obligatoria boolean DEFAULT true NOT NULL,
    fotos_minimas integer DEFAULT 3 NOT NULL,
    CONSTRAINT estaciones_config_fotos_minimas_check CHECK ((fotos_minimas >= 0))
);


--
-- Name: estaciones_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.estaciones_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: estaciones_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.estaciones_config_id_seq OWNED BY public.estaciones_config.id;


--
-- Name: estaciones_distancias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estaciones_distancias (
    id integer NOT NULL,
    estacion_origen text NOT NULL,
    estacion_destino text NOT NULL,
    distancia_metros numeric(5,2) NOT NULL,
    tiempo_estimado_seg integer,
    es_estimado boolean DEFAULT true
);


--
-- Name: estaciones_distancias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.estaciones_distancias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: estaciones_distancias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.estaciones_distancias_id_seq OWNED BY public.estaciones_distancias.id;


--
-- Name: items_orden_compra; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items_orden_compra (
    id integer NOT NULL,
    orden_compra_id integer,
    material_id integer,
    descripcion character varying(300) NOT NULL,
    unidad character varying(20),
    cantidad numeric(12,3) NOT NULL,
    precio_unitario numeric(12,2) NOT NULL,
    subtotal numeric(14,2) GENERATED ALWAYS AS ((cantidad * precio_unitario)) STORED
);


--
-- Name: items_orden_compra_backup_2026_05_11; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items_orden_compra_backup_2026_05_11 (
    id integer,
    orden_compra_id integer,
    material_id integer,
    descripcion character varying(300),
    unidad character varying(20),
    cantidad numeric(12,3),
    precio_unitario numeric(12,2),
    subtotal numeric(14,2)
);


--
-- Name: items_orden_compra_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.items_orden_compra_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: items_orden_compra_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.items_orden_compra_id_seq OWNED BY public.items_orden_compra.id;


--
-- Name: items_recepcion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items_recepcion (
    id integer NOT NULL,
    recepcion_id integer,
    item_orden_id integer,
    cantidad_ordenada numeric(12,3) NOT NULL,
    cantidad_recibida numeric(12,3) NOT NULL,
    diferencia numeric(12,3) GENERATED ALWAYS AS ((cantidad_recibida - cantidad_ordenada)) STORED,
    observaciones text
);


--
-- Name: items_recepcion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.items_recepcion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: items_recepcion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.items_recepcion_id_seq OWNED BY public.items_recepcion.id;


--
-- Name: materiales_mto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materiales_mto (
    id integer NOT NULL,
    codigo character varying(50) NOT NULL,
    descripcion character varying(300) NOT NULL,
    unidad character varying(20) NOT NULL,
    categoria character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    proyecto_id integer,
    item text DEFAULT ''::text,
    vendor_code text DEFAULT ''::text,
    vendor text DEFAULT ''::text,
    color text DEFAULT ''::text,
    size text DEFAULT ''::text,
    qty numeric(10,3) DEFAULT 0,
    unit_price numeric(12,2) DEFAULT 0,
    total_price numeric(12,2) DEFAULT 0,
    estado_cotiz text DEFAULT 'PENDIENTE'::text,
    mill_made text DEFAULT 'NO'::text,
    notas text,
    fecha_importacion date,
    manufacturer text DEFAULT ''::text,
    cotizar text DEFAULT 'SI'::text,
    origen character varying(20) DEFAULT 'MTO'::character varying NOT NULL,
    import_batch_id uuid,
    CONSTRAINT materiales_mto_origen_check CHECK (((origen)::text = ANY ((ARRAY['MTO'::character varying, 'DIRECTA'::character varying, 'URGENTE'::character varying, 'OPERATIVA'::character varying])::text[])))
);


--
-- Name: materiales_mto_backup_2026_05_11; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materiales_mto_backup_2026_05_11 (
    id integer,
    codigo character varying(50),
    descripcion character varying(300),
    unidad character varying(20),
    categoria character varying(100),
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    proyecto_id integer,
    item text,
    vendor_code text,
    vendor text,
    color text,
    size text,
    qty numeric(10,3),
    unit_price numeric(12,2),
    total_price numeric(12,2),
    estado_cotiz text,
    mill_made text,
    notas text,
    fecha_importacion date,
    manufacturer text,
    cotizar text
);


--
-- Name: materiales_mto_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.materiales_mto_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: materiales_mto_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.materiales_mto_id_seq OWNED BY public.materiales_mto.id;


--
-- Name: migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: mto_freight; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mto_freight (
    id integer NOT NULL,
    proyecto_id integer NOT NULL,
    vendor text NOT NULL,
    freight numeric(12,2) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: mto_freight_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mto_freight_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mto_freight_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mto_freight_id_seq OWNED BY public.mto_freight.id;


--
-- Name: muestras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.muestras (
    id integer NOT NULL,
    codigo character varying(30) NOT NULL,
    proyecto_id integer,
    descripcion text NOT NULL,
    tipo public.muestra_tipo DEFAULT 'OTRO'::public.muestra_tipo NOT NULL,
    prioridad public.muestra_prioridad DEFAULT 'MEDIA'::public.muestra_prioridad NOT NULL,
    owner_id uuid,
    estado public.muestra_estado DEFAULT 'SOLICITADA'::public.muestra_estado NOT NULL,
    version_actual integer DEFAULT 1 NOT NULL,
    fecha_solicitud date DEFAULT CURRENT_DATE NOT NULL,
    fecha_compromiso date,
    fecha_aprobacion_cliente date,
    notas text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: muestras_archivos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.muestras_archivos (
    id integer NOT NULL,
    muestra_id integer NOT NULL,
    version_numero integer DEFAULT 1 NOT NULL,
    tipo character varying(20) NOT NULL,
    nombre text NOT NULL,
    filename text NOT NULL,
    mime_type character varying(100),
    size_bytes integer,
    url text,
    subido_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: muestras_archivos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.muestras_archivos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: muestras_archivos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.muestras_archivos_id_seq OWNED BY public.muestras_archivos.id;


--
-- Name: muestras_envios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.muestras_envios (
    id integer NOT NULL,
    muestra_id integer NOT NULL,
    version_numero integer NOT NULL,
    fecha_envio date DEFAULT CURRENT_DATE NOT NULL,
    destinatario text NOT NULL,
    direccion text,
    tracking_carrier character varying(50),
    tracking_number character varying(100),
    fecha_recepcion_confirmada date,
    notas text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: muestras_envios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.muestras_envios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: muestras_envios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.muestras_envios_id_seq OWNED BY public.muestras_envios.id;


--
-- Name: muestras_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.muestras_eventos (
    id integer NOT NULL,
    muestra_id integer NOT NULL,
    version_numero integer DEFAULT 1 NOT NULL,
    tipo character varying(40) NOT NULL,
    detalle text,
    usuario_id uuid,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: muestras_eventos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.muestras_eventos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: muestras_eventos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.muestras_eventos_id_seq OWNED BY public.muestras_eventos.id;


--
-- Name: muestras_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.muestras_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: muestras_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.muestras_id_seq OWNED BY public.muestras.id;


--
-- Name: muestras_versiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.muestras_versiones (
    id integer NOT NULL,
    muestra_id integer NOT NULL,
    version_numero integer NOT NULL,
    especificaciones text,
    razon_de_revision text,
    comentarios_cliente text,
    op_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: muestras_versiones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.muestras_versiones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: muestras_versiones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.muestras_versiones_id_seq OWNED BY public.muestras_versiones.id;


--
-- Name: oc_imagenes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oc_imagenes (
    id integer NOT NULL,
    orden_compra_id integer NOT NULL,
    tipo character varying(30) NOT NULL,
    filename character varying(255) NOT NULL,
    original_name character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT oc_imagenes_tipo_check CHECK (((tipo)::text = ANY (ARRAY[('delivery_ticket'::character varying)::text, ('material_recibido'::character varying)::text, ('material_recibido_2'::character varying)::text, ('material_recibido_3'::character varying)::text])))
);


--
-- Name: oc_imagenes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.oc_imagenes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: oc_imagenes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.oc_imagenes_id_seq OWNED BY public.oc_imagenes.id;


--
-- Name: oc_numero_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.oc_numero_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orden_avance_fotos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orden_avance_fotos (
    id integer NOT NULL,
    orden_id integer NOT NULL,
    proceso_id integer,
    estacion text,
    personal_id integer,
    usuario_id uuid,
    filename text NOT NULL,
    original_name text,
    mime_type text,
    size_bytes integer,
    url text,
    comentario text,
    visible_cliente boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: orden_avance_fotos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orden_avance_fotos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orden_avance_fotos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orden_avance_fotos_id_seq OWNED BY public.orden_avance_fotos.id;


--
-- Name: orden_documentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orden_documentos (
    id integer NOT NULL,
    orden_id integer NOT NULL,
    estacion text,
    nombre text NOT NULL,
    descripcion text,
    filename text NOT NULL,
    mime_type text,
    size_bytes integer,
    url text,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: orden_documentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orden_documentos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orden_documentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orden_documentos_id_seq OWNED BY public.orden_documentos.id;


--
-- Name: orden_historial; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orden_historial (
    id integer NOT NULL,
    orden_id integer NOT NULL,
    estacion_origen text,
    estacion_destino text NOT NULL,
    personal_origen_id integer,
    personal_destino_id integer,
    accion text NOT NULL,
    motivo text,
    usuario_id uuid,
    kiosk_personal_id integer,
    dispositivo text,
    "timestamp" timestamp with time zone DEFAULT now()
);


--
-- Name: orden_historial_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orden_historial_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orden_historial_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orden_historial_id_seq OWNED BY public.orden_historial.id;


--
-- Name: orden_procesos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orden_procesos (
    id integer NOT NULL,
    orden_id integer NOT NULL,
    estacion text NOT NULL,
    secuencia integer NOT NULL,
    requerido boolean DEFAULT true,
    completado boolean DEFAULT false,
    fecha_inicio timestamp with time zone,
    fecha_fin timestamp with time zone,
    tiempo_real_minutos integer,
    operador_id integer,
    notas text,
    tiempo_estimado_minutos integer
);


--
-- Name: orden_procesos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orden_procesos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orden_procesos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orden_procesos_id_seq OWNED BY public.orden_procesos.id;


--
-- Name: ordenes_compra; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ordenes_compra (
    id integer NOT NULL,
    numero character varying(30) NOT NULL,
    proyecto_id integer,
    proveedor_id integer,
    estado public.estado_orden DEFAULT 'borrador'::public.estado_orden,
    fecha_emision date DEFAULT CURRENT_DATE,
    fecha_entrega_estimada date,
    fecha_entrega_real date,
    subtotal numeric(14,2) DEFAULT 0,
    iva numeric(14,2) DEFAULT 0,
    total numeric(14,2) DEFAULT 0,
    notas text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    fecha_mto date,
    categoria character varying(100) DEFAULT ''::character varying,
    origen character varying(20) DEFAULT 'MTO'::character varying NOT NULL,
    freight numeric(14,2) DEFAULT 0 NOT NULL,
    muestra_id integer,
    CONSTRAINT ordenes_compra_origen_check CHECK (((origen)::text = ANY ((ARRAY['MTO'::character varying, 'DIRECTA'::character varying, 'URGENTE'::character varying, 'OPERATIVA'::character varying])::text[])))
);


--
-- Name: ordenes_compra_backup_2026_05_11; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ordenes_compra_backup_2026_05_11 (
    id integer,
    numero character varying(30),
    proyecto_id integer,
    proveedor_id integer,
    estado public.estado_orden,
    fecha_emision date,
    fecha_entrega_estimada date,
    fecha_entrega_real date,
    subtotal numeric(14,2),
    iva numeric(14,2),
    total numeric(14,2),
    notas text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    fecha_mto date,
    categoria character varying(100)
);


--
-- Name: ordenes_compra_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ordenes_compra_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ordenes_compra_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ordenes_compra_id_seq OWNED BY public.ordenes_compra.id;


--
-- Name: ordenes_produccion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ordenes_produccion (
    id integer NOT NULL,
    numero_orden text NOT NULL,
    proyecto_id integer,
    numero_item text CONSTRAINT ordenes_produccion_item_nombre_not_null NOT NULL,
    cantidad integer NOT NULL,
    unidad text DEFAULT 'Piezas'::text,
    especificaciones text,
    material_requerido jsonb,
    prioridad text DEFAULT 'Media'::text,
    fecha_entrega date,
    tiempo_estimado_horas numeric(6,2),
    status text DEFAULT 'Pendiente'::text NOT NULL,
    estacion_actual text,
    personal_asignado_id integer,
    ruta_calculada jsonb,
    distancia_total_metros numeric(7,2),
    notas text,
    fecha_inicio timestamp with time zone,
    fecha_completada timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tipo public.op_tipo DEFAULT 'PRODUCCION'::public.op_tipo NOT NULL,
    CONSTRAINT ordenes_produccion_cantidad_check CHECK ((cantidad > 0)),
    CONSTRAINT ordenes_produccion_prioridad_check CHECK ((prioridad = ANY (ARRAY['Alta'::text, 'Media'::text, 'Baja'::text]))),
    CONSTRAINT ordenes_produccion_status_check CHECK ((status = ANY (ARRAY['Pendiente'::text, 'En Proceso'::text, 'Pausada'::text, 'Completada'::text, 'Cancelada'::text])))
);


--
-- Name: ordenes_produccion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ordenes_produccion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ordenes_produccion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ordenes_produccion_id_seq OWNED BY public.ordenes_produccion.id;


--
-- Name: personal_estaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.personal_estaciones (
    id integer NOT NULL,
    personal_id integer NOT NULL,
    estacion text NOT NULL,
    es_estacion_principal boolean DEFAULT false,
    capacidad_max integer DEFAULT 3,
    activo boolean DEFAULT true
);


--
-- Name: personal_estaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.personal_estaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: personal_estaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.personal_estaciones_id_seq OWNED BY public.personal_estaciones.id;


--
-- Name: personal_taller; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.personal_taller (
    id integer NOT NULL,
    usuario_id uuid,
    nombre text NOT NULL,
    apellido text,
    nombre_completo text GENERATED ALWAYS AS (TRIM(BOTH FROM ((nombre || ' '::text) || COALESCE(apellido, ''::text)))) STORED,
    iniciales text NOT NULL,
    tipo_personal text,
    pin_hash text,
    pin_actualizado_at timestamp with time zone,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT personal_taller_tipo_personal_check CHECK ((tipo_personal = ANY (ARRAY['carpintero'::text, 'operador'::text, 'inspector'::text, 'logistica'::text])))
);


--
-- Name: personal_taller_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.personal_taller_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: personal_taller_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.personal_taller_id_seq OWNED BY public.personal_taller.id;


--
-- Name: proveedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proveedores (
    id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    contacto character varying(150),
    email character varying(150),
    telefono character varying(30),
    rfc character varying(20),
    direccion text,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: proveedores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proveedores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proveedores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proveedores_id_seq OWNED BY public.proveedores.id;


--
-- Name: proyectos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proyectos (
    id integer NOT NULL,
    codigo character varying(30) NOT NULL,
    nombre character varying(300) NOT NULL,
    cliente character varying(200) NOT NULL,
    descripcion text,
    estado public.estado_proyecto DEFAULT 'cotizacion'::public.estado_proyecto,
    fecha_inicio date,
    fecha_fin_estimada date,
    fecha_fin_real date,
    presupuesto numeric(14,2) DEFAULT 0,
    responsable character varying(150),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: proyectos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proyectos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proyectos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proyectos_id_seq OWNED BY public.proyectos.id;


--
-- Name: qc_checklist_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qc_checklist_items (
    id integer NOT NULL,
    inspeccion_id integer NOT NULL,
    descripcion text NOT NULL,
    aprobado boolean,
    notas text
);


--
-- Name: qc_checklist_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.qc_checklist_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qc_checklist_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.qc_checklist_items_id_seq OWNED BY public.qc_checklist_items.id;


--
-- Name: qc_defectos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qc_defectos (
    id integer NOT NULL,
    inspeccion_id integer NOT NULL,
    tipo_defecto text NOT NULL,
    descripcion text NOT NULL,
    severidad text,
    foto_url text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT qc_defectos_severidad_check CHECK ((severidad = ANY (ARRAY['Menor'::text, 'Moderado'::text, 'Mayor'::text])))
);


--
-- Name: qc_defectos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.qc_defectos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qc_defectos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.qc_defectos_id_seq OWNED BY public.qc_defectos.id;


--
-- Name: qc_inspecciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qc_inspecciones (
    id integer NOT NULL,
    orden_id integer NOT NULL,
    estacion text NOT NULL,
    inspector_id integer,
    decision text,
    estacion_reproceso text,
    notas text,
    fecha_inspeccion timestamp with time zone DEFAULT now(),
    CONSTRAINT qc_inspecciones_decision_check CHECK ((decision = ANY (ARRAY['Aprobar'::text, 'Reprocesar'::text, 'Scrap'::text])))
);


--
-- Name: qc_inspecciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.qc_inspecciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qc_inspecciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.qc_inspecciones_id_seq OWNED BY public.qc_inspecciones.id;


--
-- Name: recepcion_folio_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recepcion_folio_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recepcion_materiales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recepcion_materiales (
    id integer NOT NULL,
    id_recepcion integer NOT NULL,
    id_material integer,
    cm_code character varying(50),
    descripcion character varying(300),
    recibido boolean DEFAULT false,
    nota text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: recepcion_materiales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recepcion_materiales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recepcion_materiales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recepcion_materiales_id_seq OWNED BY public.recepcion_materiales.id;


--
-- Name: recepciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recepciones (
    id integer NOT NULL,
    folio character varying(30) NOT NULL,
    orden_compra_id integer,
    estado public.estado_recepcion DEFAULT 'pendiente'::public.estado_recepcion,
    fecha_recepcion date DEFAULT CURRENT_DATE,
    recibio character varying(150),
    notas text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: recepciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recepciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recepciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recepciones_id_seq OWNED BY public.recepciones.id;


--
-- Name: solicitudes_cotizacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitudes_cotizacion (
    id integer NOT NULL,
    folio character varying(30) NOT NULL,
    proyecto_id integer,
    proveedor_id integer,
    estado public.estado_cotizacion DEFAULT 'pendiente'::public.estado_cotizacion,
    fecha_solicitud date DEFAULT CURRENT_DATE,
    fecha_respuesta date,
    monto_cotizado numeric(14,2),
    notas text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    vendor text,
    materiales_incluidos jsonb,
    email_destinatario text,
    fecha_envio timestamp with time zone
);


--
-- Name: solicitudes_cotizacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solicitudes_cotizacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solicitudes_cotizacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solicitudes_cotizacion_id_seq OWNED BY public.solicitudes_cotizacion.id;


--
-- Name: tareas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tareas (
    id integer NOT NULL,
    area text NOT NULL,
    title text NOT NULL,
    description text,
    priority text NOT NULL,
    from_email text,
    subject text,
    source_email_id text,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    asignado_a text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    origen text DEFAULT 'email'::text NOT NULL,
    source_ref text,
    closed_by_user_at timestamp with time zone,
    CONSTRAINT tareas_area_check CHECK ((area = ANY (ARRAY['procurement'::text, 'despachos'::text, 'recepcion'::text, 'administracion'::text]))),
    CONSTRAINT tareas_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'en_progreso'::text, 'completada'::text, 'descartada'::text]))),
    CONSTRAINT tareas_origen_check CHECK ((origen = ANY (ARRAY['email'::text, 'sistema'::text]))),
    CONSTRAINT tareas_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))
);


--
-- Name: tareas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tareas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tareas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tareas_id_seq OWNED BY public.tareas.id;


--
-- Name: time_pausas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_pausas (
    id integer NOT NULL,
    registro_id integer NOT NULL,
    personal_id integer NOT NULL,
    hora_inicio timestamp with time zone NOT NULL,
    hora_fin timestamp with time zone,
    motivo text,
    duracion_minutos numeric(6,2) GENERATED ALWAYS AS (
CASE
    WHEN (hora_fin IS NOT NULL) THEN (EXTRACT(epoch FROM (hora_fin - hora_inicio)) / (60)::numeric)
    ELSE NULL::numeric
END) STORED,
    dispositivo text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: time_pausas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.time_pausas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: time_pausas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.time_pausas_id_seq OWNED BY public.time_pausas.id;


--
-- Name: time_proyectos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_proyectos (
    id integer NOT NULL,
    registro_id integer NOT NULL,
    personal_id integer NOT NULL,
    proyecto_id integer NOT NULL,
    estacion text NOT NULL,
    orden_produccion_id integer,
    hora_inicio timestamp with time zone NOT NULL,
    hora_fin timestamp with time zone,
    total_horas numeric(5,2) GENERATED ALWAYS AS (
CASE
    WHEN (hora_fin IS NOT NULL) THEN (EXTRACT(epoch FROM (hora_fin - hora_inicio)) / (3600)::numeric)
    ELSE NULL::numeric
END) STORED,
    descripcion_trabajo text,
    completado boolean DEFAULT false,
    dispositivo text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: time_proyectos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.time_proyectos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: time_proyectos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.time_proyectos_id_seq OWNED BY public.time_proyectos.id;


--
-- Name: time_registros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_registros (
    id integer NOT NULL,
    personal_id integer NOT NULL,
    fecha date NOT NULL,
    hora_entrada timestamp with time zone NOT NULL,
    hora_salida timestamp with time zone,
    total_horas numeric(5,2) GENERATED ALWAYS AS (
CASE
    WHEN (hora_salida IS NOT NULL) THEN (EXTRACT(epoch FROM (hora_salida - hora_entrada)) / (3600)::numeric)
    ELSE NULL::numeric
END) STORED,
    status text DEFAULT 'activo'::text,
    dispositivo text,
    notas text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT time_registros_status_check CHECK ((status = ANY (ARRAY['activo'::text, 'finalizado'::text, 'pausado'::text])))
);


--
-- Name: time_registros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.time_registros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: time_registros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.time_registros_id_seq OWNED BY public.time_registros.id;


--
-- Name: time_resumen_diario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_resumen_diario (
    id integer NOT NULL,
    personal_id integer NOT NULL,
    fecha date NOT NULL,
    total_horas_trabajadas numeric(5,2),
    total_horas_pausas numeric(5,2),
    total_horas_netas numeric(5,2),
    proyectos_trabajados jsonb,
    generado_at timestamp with time zone DEFAULT now()
);


--
-- Name: time_resumen_diario_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.time_resumen_diario_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: time_resumen_diario_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.time_resumen_diario_id_seq OWNED BY public.time_resumen_diario.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    rol public.user_rol NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: estaciones_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estaciones_config ALTER COLUMN id SET DEFAULT nextval('public.estaciones_config_id_seq'::regclass);


--
-- Name: estaciones_distancias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estaciones_distancias ALTER COLUMN id SET DEFAULT nextval('public.estaciones_distancias_id_seq'::regclass);


--
-- Name: items_orden_compra id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_orden_compra ALTER COLUMN id SET DEFAULT nextval('public.items_orden_compra_id_seq'::regclass);


--
-- Name: items_recepcion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_recepcion ALTER COLUMN id SET DEFAULT nextval('public.items_recepcion_id_seq'::regclass);


--
-- Name: materiales_mto id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiales_mto ALTER COLUMN id SET DEFAULT nextval('public.materiales_mto_id_seq'::regclass);


--
-- Name: mto_freight id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mto_freight ALTER COLUMN id SET DEFAULT nextval('public.mto_freight_id_seq'::regclass);


--
-- Name: muestras id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras ALTER COLUMN id SET DEFAULT nextval('public.muestras_id_seq'::regclass);


--
-- Name: muestras_archivos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras_archivos ALTER COLUMN id SET DEFAULT nextval('public.muestras_archivos_id_seq'::regclass);


--
-- Name: muestras_envios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras_envios ALTER COLUMN id SET DEFAULT nextval('public.muestras_envios_id_seq'::regclass);


--
-- Name: muestras_eventos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras_eventos ALTER COLUMN id SET DEFAULT nextval('public.muestras_eventos_id_seq'::regclass);


--
-- Name: muestras_versiones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras_versiones ALTER COLUMN id SET DEFAULT nextval('public.muestras_versiones_id_seq'::regclass);


--
-- Name: oc_imagenes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oc_imagenes ALTER COLUMN id SET DEFAULT nextval('public.oc_imagenes_id_seq'::regclass);


--
-- Name: orden_avance_fotos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_avance_fotos ALTER COLUMN id SET DEFAULT nextval('public.orden_avance_fotos_id_seq'::regclass);


--
-- Name: orden_documentos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_documentos ALTER COLUMN id SET DEFAULT nextval('public.orden_documentos_id_seq'::regclass);


--
-- Name: orden_historial id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_historial ALTER COLUMN id SET DEFAULT nextval('public.orden_historial_id_seq'::regclass);


--
-- Name: orden_procesos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_procesos ALTER COLUMN id SET DEFAULT nextval('public.orden_procesos_id_seq'::regclass);


--
-- Name: ordenes_compra id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_compra ALTER COLUMN id SET DEFAULT nextval('public.ordenes_compra_id_seq'::regclass);


--
-- Name: ordenes_produccion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_produccion ALTER COLUMN id SET DEFAULT nextval('public.ordenes_produccion_id_seq'::regclass);


--
-- Name: personal_estaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_estaciones ALTER COLUMN id SET DEFAULT nextval('public.personal_estaciones_id_seq'::regclass);


--
-- Name: personal_taller id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_taller ALTER COLUMN id SET DEFAULT nextval('public.personal_taller_id_seq'::regclass);


--
-- Name: proveedores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores ALTER COLUMN id SET DEFAULT nextval('public.proveedores_id_seq'::regclass);


--
-- Name: proyectos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyectos ALTER COLUMN id SET DEFAULT nextval('public.proyectos_id_seq'::regclass);


--
-- Name: qc_checklist_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_checklist_items ALTER COLUMN id SET DEFAULT nextval('public.qc_checklist_items_id_seq'::regclass);


--
-- Name: qc_defectos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_defectos ALTER COLUMN id SET DEFAULT nextval('public.qc_defectos_id_seq'::regclass);


--
-- Name: qc_inspecciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_inspecciones ALTER COLUMN id SET DEFAULT nextval('public.qc_inspecciones_id_seq'::regclass);


--
-- Name: recepcion_materiales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recepcion_materiales ALTER COLUMN id SET DEFAULT nextval('public.recepcion_materiales_id_seq'::regclass);


--
-- Name: recepciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recepciones ALTER COLUMN id SET DEFAULT nextval('public.recepciones_id_seq'::regclass);


--
-- Name: solicitudes_cotizacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_cotizacion ALTER COLUMN id SET DEFAULT nextval('public.solicitudes_cotizacion_id_seq'::regclass);


--
-- Name: tareas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tareas ALTER COLUMN id SET DEFAULT nextval('public.tareas_id_seq'::regclass);


--
-- Name: time_pausas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_pausas ALTER COLUMN id SET DEFAULT nextval('public.time_pausas_id_seq'::regclass);


--
-- Name: time_proyectos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_proyectos ALTER COLUMN id SET DEFAULT nextval('public.time_proyectos_id_seq'::regclass);


--
-- Name: time_registros id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_registros ALTER COLUMN id SET DEFAULT nextval('public.time_registros_id_seq'::regclass);


--
-- Name: time_resumen_diario id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_resumen_diario ALTER COLUMN id SET DEFAULT nextval('public.time_resumen_diario_id_seq'::regclass);


--
-- Name: estaciones_config estaciones_config_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estaciones_config
    ADD CONSTRAINT estaciones_config_nombre_key UNIQUE (nombre);


--
-- Name: estaciones_config estaciones_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estaciones_config
    ADD CONSTRAINT estaciones_config_pkey PRIMARY KEY (id);


--
-- Name: estaciones_distancias estaciones_distancias_estacion_origen_estacion_destino_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estaciones_distancias
    ADD CONSTRAINT estaciones_distancias_estacion_origen_estacion_destino_key UNIQUE (estacion_origen, estacion_destino);


--
-- Name: estaciones_distancias estaciones_distancias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estaciones_distancias
    ADD CONSTRAINT estaciones_distancias_pkey PRIMARY KEY (id);


--
-- Name: items_orden_compra items_orden_compra_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_orden_compra
    ADD CONSTRAINT items_orden_compra_pkey PRIMARY KEY (id);


--
-- Name: items_recepcion items_recepcion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_recepcion
    ADD CONSTRAINT items_recepcion_pkey PRIMARY KEY (id);


--
-- Name: materiales_mto materiales_mto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiales_mto
    ADD CONSTRAINT materiales_mto_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: mto_freight mto_freight_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mto_freight
    ADD CONSTRAINT mto_freight_pkey PRIMARY KEY (id);


--
-- Name: mto_freight mto_freight_proyecto_id_vendor_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mto_freight
    ADD CONSTRAINT mto_freight_proyecto_id_vendor_key UNIQUE (proyecto_id, vendor);


--
-- Name: muestras_archivos muestras_archivos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras_archivos
    ADD CONSTRAINT muestras_archivos_pkey PRIMARY KEY (id);


--
-- Name: muestras muestras_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras
    ADD CONSTRAINT muestras_codigo_key UNIQUE (codigo);


--
-- Name: muestras_envios muestras_envios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras_envios
    ADD CONSTRAINT muestras_envios_pkey PRIMARY KEY (id);


--
-- Name: muestras_eventos muestras_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras_eventos
    ADD CONSTRAINT muestras_eventos_pkey PRIMARY KEY (id);


--
-- Name: muestras muestras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras
    ADD CONSTRAINT muestras_pkey PRIMARY KEY (id);


--
-- Name: muestras_versiones muestras_versiones_muestra_id_version_numero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras_versiones
    ADD CONSTRAINT muestras_versiones_muestra_id_version_numero_key UNIQUE (muestra_id, version_numero);


--
-- Name: muestras_versiones muestras_versiones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras_versiones
    ADD CONSTRAINT muestras_versiones_pkey PRIMARY KEY (id);


--
-- Name: oc_imagenes oc_imagenes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oc_imagenes
    ADD CONSTRAINT oc_imagenes_pkey PRIMARY KEY (id);


--
-- Name: orden_avance_fotos orden_avance_fotos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_avance_fotos
    ADD CONSTRAINT orden_avance_fotos_pkey PRIMARY KEY (id);


--
-- Name: orden_documentos orden_documentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_documentos
    ADD CONSTRAINT orden_documentos_pkey PRIMARY KEY (id);


--
-- Name: orden_historial orden_historial_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_historial
    ADD CONSTRAINT orden_historial_pkey PRIMARY KEY (id);


--
-- Name: orden_procesos orden_procesos_orden_id_estacion_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_procesos
    ADD CONSTRAINT orden_procesos_orden_id_estacion_key UNIQUE (orden_id, estacion);


--
-- Name: orden_procesos orden_procesos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_procesos
    ADD CONSTRAINT orden_procesos_pkey PRIMARY KEY (id);


--
-- Name: ordenes_compra ordenes_compra_numero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_compra
    ADD CONSTRAINT ordenes_compra_numero_key UNIQUE (numero);


--
-- Name: ordenes_compra ordenes_compra_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_compra
    ADD CONSTRAINT ordenes_compra_pkey PRIMARY KEY (id);


--
-- Name: ordenes_produccion ordenes_produccion_numero_orden_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_produccion
    ADD CONSTRAINT ordenes_produccion_numero_orden_key UNIQUE (numero_orden);


--
-- Name: ordenes_produccion ordenes_produccion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_produccion
    ADD CONSTRAINT ordenes_produccion_pkey PRIMARY KEY (id);


--
-- Name: personal_estaciones personal_estaciones_personal_id_estacion_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_estaciones
    ADD CONSTRAINT personal_estaciones_personal_id_estacion_key UNIQUE (personal_id, estacion);


--
-- Name: personal_estaciones personal_estaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_estaciones
    ADD CONSTRAINT personal_estaciones_pkey PRIMARY KEY (id);


--
-- Name: personal_taller personal_taller_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_taller
    ADD CONSTRAINT personal_taller_pkey PRIMARY KEY (id);


--
-- Name: proveedores proveedores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT proveedores_pkey PRIMARY KEY (id);


--
-- Name: proyectos proyectos_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyectos
    ADD CONSTRAINT proyectos_codigo_key UNIQUE (codigo);


--
-- Name: proyectos proyectos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyectos
    ADD CONSTRAINT proyectos_pkey PRIMARY KEY (id);


--
-- Name: qc_checklist_items qc_checklist_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_checklist_items
    ADD CONSTRAINT qc_checklist_items_pkey PRIMARY KEY (id);


--
-- Name: qc_defectos qc_defectos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_defectos
    ADD CONSTRAINT qc_defectos_pkey PRIMARY KEY (id);


--
-- Name: qc_inspecciones qc_inspecciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_inspecciones
    ADD CONSTRAINT qc_inspecciones_pkey PRIMARY KEY (id);


--
-- Name: recepcion_materiales recepcion_materiales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recepcion_materiales
    ADD CONSTRAINT recepcion_materiales_pkey PRIMARY KEY (id);


--
-- Name: recepciones recepciones_folio_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recepciones
    ADD CONSTRAINT recepciones_folio_key UNIQUE (folio);


--
-- Name: recepciones recepciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recepciones
    ADD CONSTRAINT recepciones_pkey PRIMARY KEY (id);


--
-- Name: solicitudes_cotizacion solicitudes_cotizacion_folio_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_cotizacion
    ADD CONSTRAINT solicitudes_cotizacion_folio_key UNIQUE (folio);


--
-- Name: solicitudes_cotizacion solicitudes_cotizacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_cotizacion
    ADD CONSTRAINT solicitudes_cotizacion_pkey PRIMARY KEY (id);


--
-- Name: tareas tareas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tareas
    ADD CONSTRAINT tareas_pkey PRIMARY KEY (id);


--
-- Name: tareas tareas_source_email_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tareas
    ADD CONSTRAINT tareas_source_email_id_key UNIQUE (source_email_id);


--
-- Name: time_pausas time_pausas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_pausas
    ADD CONSTRAINT time_pausas_pkey PRIMARY KEY (id);


--
-- Name: time_proyectos time_proyectos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_proyectos
    ADD CONSTRAINT time_proyectos_pkey PRIMARY KEY (id);


--
-- Name: time_registros time_registros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_registros
    ADD CONSTRAINT time_registros_pkey PRIMARY KEY (id);


--
-- Name: time_resumen_diario time_resumen_diario_personal_id_fecha_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_resumen_diario
    ADD CONSTRAINT time_resumen_diario_personal_id_fecha_key UNIQUE (personal_id, fecha);


--
-- Name: time_resumen_diario time_resumen_diario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_resumen_diario
    ADD CONSTRAINT time_resumen_diario_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: idx_avance_fotos_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avance_fotos_orden ON public.orden_avance_fotos USING btree (orden_id);


--
-- Name: idx_avance_fotos_orden_est; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avance_fotos_orden_est ON public.orden_avance_fotos USING btree (orden_id, estacion);


--
-- Name: idx_avance_fotos_proceso; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avance_fotos_proceso ON public.orden_avance_fotos USING btree (proceso_id) WHERE (proceso_id IS NOT NULL);


--
-- Name: idx_cotizaciones_proveedor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cotizaciones_proveedor ON public.solicitudes_cotizacion USING btree (proveedor_id);


--
-- Name: idx_cotizaciones_proyecto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cotizaciones_proyecto ON public.solicitudes_cotizacion USING btree (proyecto_id);


--
-- Name: idx_histprod_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_histprod_orden ON public.orden_historial USING btree (orden_id);


--
-- Name: idx_histprod_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_histprod_timestamp ON public.orden_historial USING btree ("timestamp");


--
-- Name: idx_items_oc_material; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_oc_material ON public.items_orden_compra USING btree (material_id);


--
-- Name: idx_items_oc_orden_compra; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_oc_orden_compra ON public.items_orden_compra USING btree (orden_compra_id);


--
-- Name: idx_items_recepcion_item_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_recepcion_item_orden ON public.items_recepcion USING btree (item_orden_id);


--
-- Name: idx_materiales_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materiales_codigo ON public.materiales_mto USING btree (codigo);


--
-- Name: idx_materiales_estado_cotiz_cotizar; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materiales_estado_cotiz_cotizar ON public.materiales_mto USING btree (estado_cotiz, cotizar);


--
-- Name: idx_materiales_fecha_importacion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materiales_fecha_importacion ON public.materiales_mto USING btree (fecha_importacion) WHERE (fecha_importacion IS NOT NULL);


--
-- Name: idx_materiales_mto_import_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materiales_mto_import_batch ON public.materiales_mto USING btree (import_batch_id) WHERE (import_batch_id IS NOT NULL);


--
-- Name: idx_materiales_origen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materiales_origen ON public.materiales_mto USING btree (proyecto_id, origen);


--
-- Name: idx_materiales_proyecto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materiales_proyecto ON public.materiales_mto USING btree (proyecto_id) WHERE (proyecto_id IS NOT NULL);


--
-- Name: idx_materiales_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materiales_vendor ON public.materiales_mto USING btree (vendor) WHERE (vendor IS NOT NULL);


--
-- Name: idx_muestras_archivos_muestra; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muestras_archivos_muestra ON public.muestras_archivos USING btree (muestra_id);


--
-- Name: idx_muestras_envios_muestra; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muestras_envios_muestra ON public.muestras_envios USING btree (muestra_id);


--
-- Name: idx_muestras_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muestras_estado ON public.muestras USING btree (estado) WHERE (estado <> 'ARCHIVADA'::public.muestra_estado);


--
-- Name: idx_muestras_eventos_muestra; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muestras_eventos_muestra ON public.muestras_eventos USING btree (muestra_id, "timestamp" DESC);


--
-- Name: idx_muestras_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muestras_owner ON public.muestras USING btree (owner_id);


--
-- Name: idx_muestras_proyecto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muestras_proyecto ON public.muestras USING btree (proyecto_id);


--
-- Name: idx_muestras_versiones_muestra; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muestras_versiones_muestra ON public.muestras_versiones USING btree (muestra_id);


--
-- Name: idx_oc_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oc_estado ON public.ordenes_compra USING btree (estado);


--
-- Name: idx_oc_fecha_emision; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oc_fecha_emision ON public.ordenes_compra USING btree (fecha_emision);


--
-- Name: idx_oc_imagenes_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oc_imagenes_orden ON public.oc_imagenes USING btree (orden_compra_id);


--
-- Name: idx_oc_origen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oc_origen ON public.ordenes_compra USING btree (origen);


--
-- Name: idx_oc_proveedor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oc_proveedor ON public.ordenes_compra USING btree (proveedor_id) WHERE (proveedor_id IS NOT NULL);


--
-- Name: idx_oc_proyecto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oc_proyecto ON public.ordenes_compra USING btree (proyecto_id) WHERE (proyecto_id IS NOT NULL);


--
-- Name: idx_orden_docs_estacion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orden_docs_estacion ON public.orden_documentos USING btree (orden_id, estacion);


--
-- Name: idx_orden_docs_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orden_docs_orden ON public.orden_documentos USING btree (orden_id);


--
-- Name: idx_ordenes_compra_muestra; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordenes_compra_muestra ON public.ordenes_compra USING btree (muestra_id) WHERE (muestra_id IS NOT NULL);


--
-- Name: idx_ordenes_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordenes_estado ON public.ordenes_compra USING btree (estado);


--
-- Name: idx_ordenes_produccion_muestra; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordenes_produccion_muestra ON public.ordenes_produccion USING btree (tipo) WHERE (tipo = 'MUESTRA'::public.op_tipo);


--
-- Name: idx_ordenes_proveedor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordenes_proveedor ON public.ordenes_compra USING btree (proveedor_id);


--
-- Name: idx_ordenes_proyecto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordenes_proyecto ON public.ordenes_compra USING btree (proyecto_id);


--
-- Name: idx_ordprod_estacion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordprod_estacion ON public.ordenes_produccion USING btree (estacion_actual);


--
-- Name: idx_ordprod_prioridad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordprod_prioridad ON public.ordenes_produccion USING btree (prioridad);


--
-- Name: idx_ordprod_proyecto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordprod_proyecto ON public.ordenes_produccion USING btree (proyecto_id);


--
-- Name: idx_ordprod_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordprod_status ON public.ordenes_produccion USING btree (status);


--
-- Name: idx_pausas_personal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pausas_personal ON public.time_pausas USING btree (personal_id);


--
-- Name: idx_pausas_registro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pausas_registro ON public.time_pausas USING btree (registro_id);


--
-- Name: idx_personal_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_personal_activo ON public.personal_taller USING btree (activo);


--
-- Name: idx_personal_est_estacion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_personal_est_estacion ON public.personal_estaciones USING btree (estacion);


--
-- Name: idx_personal_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_personal_tipo ON public.personal_taller USING btree (tipo_personal);


--
-- Name: idx_procesos_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_procesos_orden ON public.orden_procesos USING btree (orden_id);


--
-- Name: idx_proyectos_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proyectos_estado ON public.proyectos USING btree (estado);


--
-- Name: idx_qc_defectos_inspeccion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qc_defectos_inspeccion ON public.qc_defectos USING btree (inspeccion_id);


--
-- Name: idx_qc_items_inspeccion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qc_items_inspeccion ON public.qc_checklist_items USING btree (inspeccion_id);


--
-- Name: idx_qc_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qc_orden ON public.qc_inspecciones USING btree (orden_id);


--
-- Name: idx_recepcion_materiales_recepcion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recepcion_materiales_recepcion ON public.recepcion_materiales USING btree (id_recepcion);


--
-- Name: idx_recepciones_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recepciones_fecha ON public.recepciones USING btree (fecha_recepcion);


--
-- Name: idx_recepciones_oc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recepciones_oc ON public.recepciones USING btree (orden_compra_id);


--
-- Name: idx_recepciones_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recepciones_orden ON public.recepciones USING btree (orden_compra_id);


--
-- Name: idx_resumen_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resumen_fecha ON public.time_resumen_diario USING btree (fecha);


--
-- Name: idx_resumen_personal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resumen_personal ON public.time_resumen_diario USING btree (personal_id);


--
-- Name: idx_tareas_area; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tareas_area ON public.tareas USING btree (area);


--
-- Name: idx_tareas_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tareas_created_at ON public.tareas USING btree (created_at DESC);


--
-- Name: idx_tareas_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tareas_estado ON public.tareas USING btree (estado);


--
-- Name: idx_tareas_origen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tareas_origen ON public.tareas USING btree (origen);


--
-- Name: idx_tareas_system_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_tareas_system_dedup ON public.tareas USING btree (source_ref) WHERE ((origen = 'sistema'::text) AND (source_ref IS NOT NULL));


--
-- Name: idx_time_proy_inicio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_proy_inicio ON public.time_proyectos USING btree (hora_inicio);


--
-- Name: idx_time_proy_personal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_proy_personal ON public.time_proyectos USING btree (personal_id);


--
-- Name: idx_time_proy_proyecto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_proy_proyecto ON public.time_proyectos USING btree (proyecto_id);


--
-- Name: idx_time_proy_registro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_proy_registro ON public.time_proyectos USING btree (registro_id);


--
-- Name: idx_time_reg_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_reg_fecha ON public.time_registros USING btree (fecha);


--
-- Name: idx_time_reg_personal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_reg_personal ON public.time_registros USING btree (personal_id);


--
-- Name: idx_time_reg_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_reg_status ON public.time_registros USING btree (status);


--
-- Name: uq_time_pausa_personal_abierta; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_time_pausa_personal_abierta ON public.time_pausas USING btree (personal_id) WHERE (hora_fin IS NULL);


--
-- Name: uq_time_proy_personal_abierto; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_time_proy_personal_abierto ON public.time_proyectos USING btree (personal_id) WHERE (hora_fin IS NULL);


--
-- Name: uq_time_reg_personal_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_time_reg_personal_activo ON public.time_registros USING btree (personal_id) WHERE (status = 'activo'::text);


--
-- Name: muestras trg_muestras_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_muestras_updated_at BEFORE UPDATE ON public.muestras FOR EACH ROW EXECUTE FUNCTION public.update_muestras_updated_at();


--
-- Name: orden_historial fk_hist_kiosk_personal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_historial
    ADD CONSTRAINT fk_hist_kiosk_personal FOREIGN KEY (kiosk_personal_id) REFERENCES public.personal_taller(id) ON DELETE SET NULL;


--
-- Name: orden_historial fk_hist_personal_destino; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_historial
    ADD CONSTRAINT fk_hist_personal_destino FOREIGN KEY (personal_destino_id) REFERENCES public.personal_taller(id) ON DELETE SET NULL;


--
-- Name: orden_historial fk_hist_personal_origen; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_historial
    ADD CONSTRAINT fk_hist_personal_origen FOREIGN KEY (personal_origen_id) REFERENCES public.personal_taller(id) ON DELETE SET NULL;


--
-- Name: orden_procesos fk_orden_procesos_operador; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_procesos
    ADD CONSTRAINT fk_orden_procesos_operador FOREIGN KEY (operador_id) REFERENCES public.personal_taller(id) ON DELETE SET NULL;


--
-- Name: ordenes_produccion fk_ordprod_personal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_produccion
    ADD CONSTRAINT fk_ordprod_personal FOREIGN KEY (personal_asignado_id) REFERENCES public.personal_taller(id) ON DELETE SET NULL;


--
-- Name: qc_inspecciones fk_qc_inspector; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_inspecciones
    ADD CONSTRAINT fk_qc_inspector FOREIGN KEY (inspector_id) REFERENCES public.personal_taller(id) ON DELETE SET NULL;


--
-- Name: items_orden_compra items_orden_compra_orden_compra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_orden_compra
    ADD CONSTRAINT items_orden_compra_orden_compra_id_fkey FOREIGN KEY (orden_compra_id) REFERENCES public.ordenes_compra(id) ON DELETE CASCADE;


--
-- Name: items_recepcion items_recepcion_item_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_recepcion
    ADD CONSTRAINT items_recepcion_item_orden_id_fkey FOREIGN KEY (item_orden_id) REFERENCES public.items_orden_compra(id) ON DELETE RESTRICT;


--
-- Name: items_recepcion items_recepcion_recepcion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_recepcion
    ADD CONSTRAINT items_recepcion_recepcion_id_fkey FOREIGN KEY (recepcion_id) REFERENCES public.recepciones(id) ON DELETE CASCADE;


--
-- Name: materiales_mto materiales_mto_proyecto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiales_mto
    ADD CONSTRAINT materiales_mto_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES public.proyectos(id) ON DELETE CASCADE;


--
-- Name: mto_freight mto_freight_proyecto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mto_freight
    ADD CONSTRAINT mto_freight_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES public.proyectos(id) ON DELETE CASCADE;


--
-- Name: muestras_archivos muestras_archivos_muestra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras_archivos
    ADD CONSTRAINT muestras_archivos_muestra_id_fkey FOREIGN KEY (muestra_id) REFERENCES public.muestras(id) ON DELETE CASCADE;


--
-- Name: muestras_archivos muestras_archivos_subido_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras_archivos
    ADD CONSTRAINT muestras_archivos_subido_por_fkey FOREIGN KEY (subido_por) REFERENCES public.usuarios(id);


--
-- Name: muestras muestras_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras
    ADD CONSTRAINT muestras_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id);


--
-- Name: muestras_envios muestras_envios_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras_envios
    ADD CONSTRAINT muestras_envios_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id);


--
-- Name: muestras_envios muestras_envios_muestra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras_envios
    ADD CONSTRAINT muestras_envios_muestra_id_fkey FOREIGN KEY (muestra_id) REFERENCES public.muestras(id) ON DELETE CASCADE;


--
-- Name: muestras_eventos muestras_eventos_muestra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras_eventos
    ADD CONSTRAINT muestras_eventos_muestra_id_fkey FOREIGN KEY (muestra_id) REFERENCES public.muestras(id) ON DELETE CASCADE;


--
-- Name: muestras_eventos muestras_eventos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras_eventos
    ADD CONSTRAINT muestras_eventos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: muestras muestras_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras
    ADD CONSTRAINT muestras_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.usuarios(id);


--
-- Name: muestras muestras_proyecto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras
    ADD CONSTRAINT muestras_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES public.proyectos(id);


--
-- Name: muestras_versiones muestras_versiones_muestra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras_versiones
    ADD CONSTRAINT muestras_versiones_muestra_id_fkey FOREIGN KEY (muestra_id) REFERENCES public.muestras(id) ON DELETE CASCADE;


--
-- Name: muestras_versiones muestras_versiones_op_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muestras_versiones
    ADD CONSTRAINT muestras_versiones_op_id_fkey FOREIGN KEY (op_id) REFERENCES public.ordenes_produccion(id);


--
-- Name: oc_imagenes oc_imagenes_orden_compra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oc_imagenes
    ADD CONSTRAINT oc_imagenes_orden_compra_id_fkey FOREIGN KEY (orden_compra_id) REFERENCES public.ordenes_compra(id) ON DELETE CASCADE;


--
-- Name: orden_avance_fotos orden_avance_fotos_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_avance_fotos
    ADD CONSTRAINT orden_avance_fotos_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES public.ordenes_produccion(id) ON DELETE CASCADE;


--
-- Name: orden_avance_fotos orden_avance_fotos_personal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_avance_fotos
    ADD CONSTRAINT orden_avance_fotos_personal_id_fkey FOREIGN KEY (personal_id) REFERENCES public.personal_taller(id) ON DELETE SET NULL;


--
-- Name: orden_avance_fotos orden_avance_fotos_proceso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_avance_fotos
    ADD CONSTRAINT orden_avance_fotos_proceso_id_fkey FOREIGN KEY (proceso_id) REFERENCES public.orden_procesos(id) ON DELETE SET NULL;


--
-- Name: orden_avance_fotos orden_avance_fotos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_avance_fotos
    ADD CONSTRAINT orden_avance_fotos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: orden_documentos orden_documentos_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_documentos
    ADD CONSTRAINT orden_documentos_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES public.ordenes_produccion(id) ON DELETE CASCADE;


--
-- Name: orden_documentos orden_documentos_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_documentos
    ADD CONSTRAINT orden_documentos_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: orden_historial orden_historial_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_historial
    ADD CONSTRAINT orden_historial_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES public.ordenes_produccion(id) ON DELETE CASCADE;


--
-- Name: orden_historial orden_historial_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_historial
    ADD CONSTRAINT orden_historial_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: orden_procesos orden_procesos_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_procesos
    ADD CONSTRAINT orden_procesos_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES public.ordenes_produccion(id) ON DELETE CASCADE;


--
-- Name: ordenes_compra ordenes_compra_muestra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_compra
    ADD CONSTRAINT ordenes_compra_muestra_id_fkey FOREIGN KEY (muestra_id) REFERENCES public.muestras(id);


--
-- Name: ordenes_compra ordenes_compra_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_compra
    ADD CONSTRAINT ordenes_compra_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id) ON DELETE RESTRICT;


--
-- Name: ordenes_compra ordenes_compra_proyecto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_compra
    ADD CONSTRAINT ordenes_compra_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES public.proyectos(id) ON DELETE RESTRICT;


--
-- Name: ordenes_produccion ordenes_produccion_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_produccion
    ADD CONSTRAINT ordenes_produccion_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: ordenes_produccion ordenes_produccion_proyecto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_produccion
    ADD CONSTRAINT ordenes_produccion_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES public.proyectos(id) ON DELETE RESTRICT;


--
-- Name: personal_estaciones personal_estaciones_personal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_estaciones
    ADD CONSTRAINT personal_estaciones_personal_id_fkey FOREIGN KEY (personal_id) REFERENCES public.personal_taller(id) ON DELETE CASCADE;


--
-- Name: personal_taller personal_taller_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_taller
    ADD CONSTRAINT personal_taller_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: qc_checklist_items qc_checklist_items_inspeccion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_checklist_items
    ADD CONSTRAINT qc_checklist_items_inspeccion_id_fkey FOREIGN KEY (inspeccion_id) REFERENCES public.qc_inspecciones(id) ON DELETE CASCADE;


--
-- Name: qc_defectos qc_defectos_inspeccion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_defectos
    ADD CONSTRAINT qc_defectos_inspeccion_id_fkey FOREIGN KEY (inspeccion_id) REFERENCES public.qc_inspecciones(id) ON DELETE CASCADE;


--
-- Name: qc_inspecciones qc_inspecciones_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_inspecciones
    ADD CONSTRAINT qc_inspecciones_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES public.ordenes_produccion(id) ON DELETE CASCADE;


--
-- Name: recepcion_materiales recepcion_materiales_id_material_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recepcion_materiales
    ADD CONSTRAINT recepcion_materiales_id_material_fkey FOREIGN KEY (id_material) REFERENCES public.materiales_mto(id) ON DELETE SET NULL;


--
-- Name: recepcion_materiales recepcion_materiales_id_recepcion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recepcion_materiales
    ADD CONSTRAINT recepcion_materiales_id_recepcion_fkey FOREIGN KEY (id_recepcion) REFERENCES public.recepciones(id) ON DELETE CASCADE;


--
-- Name: recepciones recepciones_orden_compra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recepciones
    ADD CONSTRAINT recepciones_orden_compra_id_fkey FOREIGN KEY (orden_compra_id) REFERENCES public.ordenes_compra(id) ON DELETE RESTRICT;


--
-- Name: solicitudes_cotizacion solicitudes_cotizacion_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_cotizacion
    ADD CONSTRAINT solicitudes_cotizacion_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id) ON DELETE RESTRICT;


--
-- Name: solicitudes_cotizacion solicitudes_cotizacion_proyecto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_cotizacion
    ADD CONSTRAINT solicitudes_cotizacion_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES public.proyectos(id) ON DELETE RESTRICT;


--
-- Name: time_pausas time_pausas_personal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_pausas
    ADD CONSTRAINT time_pausas_personal_id_fkey FOREIGN KEY (personal_id) REFERENCES public.personal_taller(id) ON DELETE RESTRICT;


--
-- Name: time_pausas time_pausas_registro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_pausas
    ADD CONSTRAINT time_pausas_registro_id_fkey FOREIGN KEY (registro_id) REFERENCES public.time_registros(id) ON DELETE CASCADE;


--
-- Name: time_proyectos time_proyectos_orden_produccion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_proyectos
    ADD CONSTRAINT time_proyectos_orden_produccion_id_fkey FOREIGN KEY (orden_produccion_id) REFERENCES public.ordenes_produccion(id) ON DELETE SET NULL;


--
-- Name: time_proyectos time_proyectos_personal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_proyectos
    ADD CONSTRAINT time_proyectos_personal_id_fkey FOREIGN KEY (personal_id) REFERENCES public.personal_taller(id) ON DELETE RESTRICT;


--
-- Name: time_proyectos time_proyectos_proyecto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_proyectos
    ADD CONSTRAINT time_proyectos_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES public.proyectos(id) ON DELETE RESTRICT;


--
-- Name: time_proyectos time_proyectos_registro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_proyectos
    ADD CONSTRAINT time_proyectos_registro_id_fkey FOREIGN KEY (registro_id) REFERENCES public.time_registros(id) ON DELETE CASCADE;


--
-- Name: time_registros time_registros_personal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_registros
    ADD CONSTRAINT time_registros_personal_id_fkey FOREIGN KEY (personal_id) REFERENCES public.personal_taller(id) ON DELETE RESTRICT;


--
-- Name: time_resumen_diario time_resumen_diario_personal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_resumen_diario
    ADD CONSTRAINT time_resumen_diario_personal_id_fkey FOREIGN KEY (personal_id) REFERENCES public.personal_taller(id) ON DELETE CASCADE;


--
--

\unrestrict p5j0cZbf2xmuCpiUOjZhEUBV2DwmF7vxfCLPHzrb4TcW4rAADXDHF6hhYBOym78


-- ─── FIN DEL DUMP ───────────────────────────────────────────────────────────
