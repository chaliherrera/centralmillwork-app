--
-- PostgreSQL database dump
--

\restrict T5wI5Fl8ITN0YkZegAaORh5RM8uV7tJ7YB3l7qD3fxoaWA3Wh9rHEW9rdgG50nl

-- Dumped from database version 18.3 (Debian 18.3-1.pgdg13+1)
-- Dumped by pg_dump version 18.3

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

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


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
-- Name: user_rol; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_rol AS ENUM (
    'ADMIN',
    'PROCUREMENT',
    'PRODUCTION',
    'PROJECT_MANAGEMENT',
    'RECEPTION'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

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
    cotizar text DEFAULT 'SI'::text
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
    categoria character varying(100) DEFAULT ''::character varying
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
-- Name: oc_imagenes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oc_imagenes ALTER COLUMN id SET DEFAULT nextval('public.oc_imagenes_id_seq'::regclass);


--
-- Name: ordenes_compra id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_compra ALTER COLUMN id SET DEFAULT nextval('public.ordenes_compra_id_seq'::regclass);


--
-- Name: proveedores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores ALTER COLUMN id SET DEFAULT nextval('public.proveedores_id_seq'::regclass);


--
-- Name: proyectos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyectos ALTER COLUMN id SET DEFAULT nextval('public.proyectos_id_seq'::regclass);


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
-- Data for Name: items_orden_compra; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.items_orden_compra (id, orden_compra_id, material_id, descripcion, unidad, cantidad, precio_unitario) FROM stdin;
1	37	93	4'' WALL FLANGES - BLACKENED STEEL - 2'' OD	EA	6.000	11.00
2	38	103	1/4''X8'' SOLID POPLAR	EA	50.000	6.95
3	38	104	1/4'' X 8''THICK - SOLID WHITE OAK	EA	90.000	8.98
4	38	105	5/8''X 8''-SOLID POPLAR	EA	40.000	3.05
5	38	102	5/8''X 8''-SOLID WHITE OAK	EA	100.000	8.40
6	39	99	PAINT	GAL	1.000	59.99
7	39	100	PAINT	GAL	1.000	59.99
8	39	101	STAIN	GAL	2.000	59.99
9	39	98	PAINT	GAL	1.000	59.99
10	40	97	ABS BANDING	ROLL	1.000	141.00
11	40	96	ABS BANDING	ROLL	1.000	141.00
12	40	95	3/4''  PREFINISHED WOOD VENEER	EA	1.000	436.75
13	40	94	3/4''  PREFINISHED WOOD VENEER	EA	1.000	393.75
14	41	91	3/8'' PLYWOOD CHINA	EA	5.000	48.95
15	42	92	METAL ROUND TUBES	EA	3.000	54.00
16	43	33	36"L FLAT BRACKETS	EACH	2.000	19.51
17	44	106	ROUGH POPLAR WOOD	EACH	20.000	29.10
18	45	108	STAIN TO MATCH SAMPLE	EACH	2.000	60.00
19	46	107	1/4'' PLYWOOD	EACH	3.000	22.50
20	47	116	4'' C-C FUNCTIONAL STEEL PULL	EA	16.000	3.40
21	48	109	1/2'' SOLID SURFACE	EA	3.000	773.00
\.


--
-- Data for Name: items_recepcion; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.items_recepcion (id, recepcion_id, item_orden_id, cantidad_ordenada, cantidad_recibida, observaciones) FROM stdin;
\.


--
-- Data for Name: materiales_mto; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.materiales_mto (id, codigo, descripcion, unidad, categoria, created_at, updated_at, proyecto_id, item, vendor_code, vendor, color, size, qty, unit_price, total_price, estado_cotiz, mill_made, notas, fecha_importacion, manufacturer, cotizar) FROM stdin;
13	EDGE BND-300	15/16'' W - THIN EDGE BANDING	ROLL	EDGEBANDING	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	12-13-14-15		FRAMATECH	LANDMARK WOOD	600 LF	1.000	72.50	72.50	COTIZADO	NO	\N	2026-04-22		SI
14	WD-304	13/16'' T X 8'' W X 8'L ROUGH WHITE OAK SOLID WOOD	EACH	SOLID WOOD	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	1-15-20		BRAZOS			7.000	78.83	551.81	COTIZADO	NO	\N	2026-04-22		SI
16	HW-1	2 3/4'' L- EDGE PULL	EACH	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	1-15-18-19-20	BP969650170	RICHELIEU	STAINLESS STEEL	2 3/4''L	24.000	5.00	120.00	COTIZADO	NO	\N	2026-04-22		SI
17	HW-2	8'' DIA- TRASH GROMMET	EACH	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	15-18-19	TM2B	MOCKETT	SATIN STAINLESS STEEL	8'' DIA	5.000	69.66	348.30	COTIZADO	NO	\N	2026-04-22		SI
20	MDF	3/4" MDF	EACH	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	9	1-2-3		RUGBY		4 X 8	10.000	28.76	287.60	COTIZADO	NO	\N	2026-04-22		SI
21	MDF-1	1/4" MDF	EACH	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	9	2-3		RUGBY		4 X 8	2.000	14.26	28.52	COTIZADO	NO	\N	2026-04-22		SI
22	PLY-0	3/4" PLYWOOD CHINA 4X8	EACH	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	9	2-3-4		RUGBY		4 X 8	20.000	48.10	962.00	COTIZADO	NO	\N	2026-04-22		SI
23	PLY-2	1/4" PLYWOOD CHINA	EACH	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	9	2		RUGBY		4 X 8	4.000	22.50	90.00	COTIZADO	NO	\N	2026-04-22		SI
24	BEN-1	3/8" BENDER BOARD	EACH	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	9	2-3		RUGBY		4 X 8	3.000	43.28	129.84	COTIZADO	NO	\N	2026-04-22		SI
25	WD	PLASTIC LAMINATE	EACH	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	9	1-2-3	7996	RUGBY	NATURAL RECON/FINE VELVET TEXTURE	4 X 8	26.000	68.16	1772.16	COTIZADO	NO	\N	2026-04-22		SI
26	CM	MAGNETIC LAMINATE	EACH	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	9	2	150 SERIES	RUGBY	HPL MAGNETIC BOARD	4 X 8	2.000	796.80	1593.60	COTIZADO	NO	\N	2026-04-22		SI
27	MB	PLASTIC LAMINATE	EACH	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	9	2	1500-60	RUGBY	GREY, MATTE FINISH (60)	4X8	2.000	68.16	136.32	COTIZADO	NO	\N	2026-04-22		SI
28	EB-1	EDGE BANDING ROLL	ROLL	EDGEBANDING	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	9	1-2-3		FRAMATECH	TO MATCH NATURAL REACON	600 LF	1.000	60.00	60.00	COTIZADO	NO	\N	2026-04-22		SI
31	HW-1	2" STEEL TUBE LEGS: 38"H	EACH	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	9	2	8802	TLO	STEEL SILVER	38"H	13.000	91.34	1187.42	COTIZADO	NO	\N	2026-04-22		SI
32	HW-2	2" STEEL TUBE LEGS: 36"H	EACH	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	9	4	8802	TLO	STEEL SILVER	36"H	3.000	91.34	274.02	COTIZADO	NO	\N	2026-04-22		SI
3	PL-301	FAWN CYPRESS- CASUAL RUSTIC	SHEET	PLASTIC LAMINATE	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	1-19-20	8208K-16	RUGBY		4X8	45.000	81.28	3657.60	COTIZADO	NO	\N	2026-04-22		SI
45	RUSSIAN BIRCH 4''	4'' X 1/2'' T - RUSSIAN BIRCH (DRAWER SIDE)	EACH	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	11	RBSQUV4	RUGBY	RUSSIAN BIRCH- UV	5'L	14.000	4.94	69.16	COTIZADO	NO	\N	2026-04-22		SI
46	BALTIC BIRCH 1/4	1/4'' T - BALTIC BIRCH	EACH	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	11		RUGBY	BALTIC BIRCH	4X8	2.000	48.75	97.50	COTIZADO	NO	\N	2026-04-22		SI
49	WD-406	LIVE EDGE	EACH	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	11	60925	ROCKLER	WALNUT SLAB	48'' L	10.000	82.98	829.80	COTIZADO	NO	\N	2026-04-22		SI
50	HW-2	8'' DIA- TRASH GROMMET	EACH	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	7	TM2B	MOCKETT	SATIN STAINLESS STEEL	8'' DIA	2.000	69.66	139.32	COTIZADO	NO	\N	2026-04-22		SI
51	HW-3	4 3/16'' L - METAL PULL	EACH	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	11	BP87396900	RICHELIEU	MATTE BLACK	4 3/16''L	10.000	7.10	71.00	COTIZADO	NO	\N	2026-04-22		SI
52	HW-4	DRAWER CAM LOCK	EACH	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	11	OL960346US19	RICHELIEU	MATTE BLACK	1 3/4''L	10.000	21.28	212.80	COTIZADO	NO	\N	2026-04-22		SI
53	HW-5	2 3/8'' DIA -GROMMET BORE	EACH	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	11	9006090	RICHELIEU	BLACK	2 3/8''DIA	12.000	1.68	20.16	COTIZADO	NO	\N	2026-04-22		SI
55	HW-7	1 3/4'' DOOR CAM LOCK	EACH	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	7	OL96034614A	RICHELIEU	NICKEL	1 3/4''	11.000	13.81	151.91	COTIZADO	NO	\N	2026-04-22		SI
54	HW-6	9'' x 9'' SURFACE MOUNTED FLAT BRACKET	EACH	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-26 00:29:16.710574+00	8	11	SF9	A&M	BLACK	9''X9''	8.000	9.95	79.60	COTIZADO	NO	\N	2026-04-22		SI
39	PL-402	PLASTIC LAMINATE	EACH	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-26 00:28:38.664338+00	8	11	Y0621K-16	RUGBY	YAKI OAK/CASUAL RUSTIC	4X8	14.000	104.64	1464.96	COTIZADO	NO	\N	2026-04-22		SI
41	EDGE BND-15/16''	15/16'' W - THIN EDGE BANDING	ROLL	EDGEBANDING	2026-04-22 22:22:23.113384+00	2026-04-26 00:28:50.749374+00	8	7	TO MATCH WD-403	FRAMATECH	PLAIN SLICE WHITE OAK	500LF	1.000	76.25	76.25	COTIZADO	NO	\N	2026-04-22		SI
47	WD-400	ROUGH WHITE OAK SOLID WOOD	EACH	SOLID WOOD	2026-04-22 22:22:23.113384+00	2026-04-26 15:00:18.27196+00	8	9		BRAZOS	PLAIN SLICE WHITE OAK	2'' T X 8''W X 12'L	19.000	242.88	4614.72	COTIZADO	NO	\N	2026-04-22		NO
48	WD-401	ROUGH WHITE OAK SOLID WOOD	EACH	SOLID WOOD	2026-04-22 22:22:23.113384+00	2026-04-26 15:00:42.422946+00	8	7		BRAZOS	PLAIN SLICE WHITE OAK	13/16'' T X 8'' W X 8'L	15.000	67.12	1006.80	PENDIENTE	NO	\N	2026-04-22		SI
92	MT-02A	METAL ROUND TUBES	EA	HARDWARE	2026-04-27 05:19:31.25482+00	2026-04-28 20:03:09.500575+00	11	8		METALS4U	STEEL	2'' OD x 8LF	3.000	54.00	162.00	COTIZADO	NO	\N	2026-04-27	REAL STEEL GUYS	SI
102	5/8WOAK	5/8''X 8''-SOLID WHITE OAK	EA	SOLID WOOD	2026-04-27 05:19:31.25482+00	2026-04-28 01:49:26.098888+00	11	10		BRAZOS		LF	100.000	8.40	840.27	COTIZADO	NO	\N	2026-04-27		SI
105	5/8POP	5/8''X 8''-SOLID POPLAR	EA	SOLID WOOD	2026-04-27 05:19:31.25482+00	2026-04-28 01:49:26.098888+00	11	10		BRAZOS		LF	40.000	3.05	121.88	COTIZADO	NO	\N	2026-04-27		SI
98	PT-100	PAINT	GAL	PAINT	2026-04-27 05:19:31.25482+00	2026-04-28 01:50:46.306188+00	11	8		GEMINI	MATTE BLACK FINISH		1.000	59.99	59.99	COTIZADO	NO	\N	2026-04-27		SI
99	PT-03	PAINT	GAL	PAINT	2026-04-27 05:19:31.25482+00	2026-04-28 01:50:46.306188+00	11	10	SW-7566	GEMINI	WESTHIGHLAND WHITE, SEMIGLOSS		1.000	59.99	59.99	COTIZADO	NO	\N	2026-04-27	SHERWING WILLIAMS	SI
100	PT-06	PAINT	GAL	PAINT	2026-04-27 05:19:31.25482+00	2026-04-28 01:50:46.306188+00	11	10		GEMINI	SEALSKIN, SEMIGLOSS		1.000	59.99	59.99	COTIZADO	NO	\N	2026-04-27	SHERWING WILLIAMS	SI
91	3/8PLY	3/8'' PLYWOOD CHINA	EA	MILLWORK	2026-04-27 05:19:31.25482+00	2026-04-28 01:54:20.044904+00	11	10		RUGBY		4''X8''	5.000	48.95	244.75	COTIZADO	NO	\N	2026-04-27		SI
1	PT-304	PAINT	EACH	PAINT	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	18		GEMINI	SW 7625 MOUNT ETNA- SEMI GLOSS	GAL	1.000	60.00	60.00	COTIZADO	NO	\N	2026-04-22		SI
2	PRIMER 304	PRIMER	EACH	PAINT	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	18		GEMINI	TO MATCH MOUNT ETNA	GAL	1.000	60.00	60.00	COTIZADO	NO	\N	2026-04-22		SI
4	PL-300	LANDMARK WOOD- SOFT GRAIN	SHEET	PLASTIC LAMINATE	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	12-13-14-15	7981K-12	RUGBY		4X8	11.000	81.28	894.08	COTIZADO	NO	\N	2026-04-22		SI
5	MEL-B	3/4'' BLACK MELAMINE	SHEET	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	1-12-13-14-15-18-19-20		RUGBY	BLACK	4X8	81.000	31.00	2511.00	COTIZADO	NO	\N	2026-04-22		SI
6	1/4'' BACKER	1/4'' BLACK BACKER	SHEET	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	1-15-19-20		RUGBY	BLACK	4X8	17.000	17.00	289.00	COTIZADO	NO	\N	2026-04-22		SI
97	EB-WD-08	ABS BANDING	ROLL	EDGEBANDING	2026-04-27 05:19:31.25482+00	2026-04-30 13:40:29.369141+00	11	10		HARDWOODS	PURE WALNUT	1MMX24MMX50M	1.000	126.95	126.95	COTIZADO	NO	\N	2026-04-27	SHINNOKI	SI
7	1/4'' MDF	1/4'' MDF	SHEET	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	15-18		RUGBY		4X8	2.000	14.26	28.52	COTIZADO	NO	\N	2026-04-22		SI
18	NC1	HINGES OVERLAY	EACH	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-26 00:41:53.864717+00	8	1-15-18-19-20		RICHELIEU			82.000	0.00	0.00	EN_STOCK	SI	\N	2026-04-22		EN_STOCK
19	NC2	PLATE	EACH	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-26 00:45:20.670385+00	8	1-15-18-19-20		RICHELIEU			82.000	0.00	0.00	EN_STOCK	SI	\N	2026-04-22		EN_STOCK
29	NC-1	HINGES	EACH	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	9	1-2-3		RICHELIEU	UNFINISHED		20.000	0.00	0.00	EN_STOCK	SI	\N	2026-04-22		EN_STOCK
30	NC-2	PLATES	EACH	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	9	1-2-3		RICHELIEU	UNFINISHED		20.000	0.00	0.00	EN_STOCK	SI	\N	2026-04-22		EN_STOCK
57	NC1	HINGES OVERLAY	EACH	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	11		RICHELIEU			46.000	0.00	0.00	EN_STOCK	SI	\N	2026-04-22		EN_STOCK
103	1/4POP	1/4''X8'' SOLID POPLAR	EA	SOLID WOOD	2026-04-27 05:19:31.25482+00	2026-04-28 01:49:26.098888+00	11	10		BRAZOS		LF	50.000	6.95	347.50	COTIZADO	NO	\N	2026-04-27		SI
104	1/4WOAK	1/4'' X 8''THICK - SOLID WHITE OAK	EA	SOLID WOOD	2026-04-27 05:19:31.25482+00	2026-04-28 01:49:26.098888+00	11	10		BRAZOS		LF	90.000	8.98	808.20	COTIZADO	NO	\N	2026-04-27		SI
101	WD-15 MATCH	STAIN	GAL	PAINT	2026-04-27 05:19:31.25482+00	2026-04-29 16:03:34.811294+00	11	10		GEMINI	STAIN TO MATCH WD-15 SHINNOKI BURLEY OAK		2.000	59.99	119.98	PENDIENTE	NO	\N	2026-04-27		SI
108	STAIN	STAIN TO MATCH SAMPLE	EACH	PAINT	2026-04-29 18:08:30.044902+00	2026-04-29 18:13:57.797517+00	12	ITEM26		GEMINI	TO MATACH SAMPLE	GAL	2.000	60.00	120.00	COTIZADO	NO	\N	2026-04-29		SI
8	PLY-3/4	3/4'' PLYWOOD	SHEET	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	1-12-13-14-15-18-19-20		RUGBY		4X8	24.000	47.84	1148.16	COTIZADO	NO	\N	2026-04-22		SI
9	MDF-3/4 M	3/4'' PLAIN SLICE MAPLE MDF	SHEET	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	18		RUGBY	PLAIN SLICE MAPLE	4X8	5.000	75.50	377.50	COTIZADO	NO	\N	2026-04-22		SI
107	1/4 PLY	1/4'' PLYWOOD	EACH	MILLWORK	2026-04-29 18:08:30.044902+00	2026-04-29 18:19:14.068058+00	12	ITEM26		RUGBY	N/A	4X8	3.000	22.50	67.50	COTIZADO	NO	\N	2026-04-29		SI
10	MDF-3/4 WO	3/4'' PLAIN SLICE WHITE OAK MDF	SHEET	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	15		RUGBY	PLAIN SLICE WHITE OAK	4X8	2.000	93.42	186.84	COTIZADO	NO	\N	2026-04-22		SI
11	BENDING	5/16'' BENDING BOARD	SHEET	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	18		RUGBY		4X8	1.000	43.28	43.28	COTIZADO	NO	\N	2026-04-22		SI
12	EDGE BND-301	15/16'' W - THIN EDGE BANDING	ROLL	EDGEBANDING	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	1-19-20		FRAMATECH	TO MATCH FAWN CYPRESS	600 LF	1.000	72.50	72.50	COTIZADO	NO	\N	2026-04-22		SI
15	WD-304A	13/16'' T X 8'' W X 8'LROUGH MAPLE SOLID WOOD	EACH	SOLID WOOD	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	18		BRAZOS			3.000	24.00	72.00	COTIZADO	NO	\N	2026-04-22		SI
33	NC-3	36"L FLAT BRACKETS	EACH	METAL	2026-04-22 22:22:23.113384+00	2026-04-29 21:07:26.321848+00	9	3	6240120290	METALS4U	BLACK	36"	2.000	19.51	39.02	COTIZADO	NO	\N	2026-04-22		SI
106	WD-POPLAR	ROUGH POPLAR WOOD	EACH	MILLWORK	2026-04-29 18:08:30.044902+00	2026-04-30 03:56:17.786612+00	12	ITEM26		BRAZOS	PLAIN SLICE POPLAR	1'' T x 8'' W x 10'L	20.000	29.10	582.00	COTIZADO	NO	\N	2026-04-29		SI
93	MT-02B	4'' WALL FLANGES - BLACKENED STEEL - 2'' OD	EA	HARDWARE	2026-04-27 05:19:31.25482+00	2026-04-28 02:13:43.586733+00	11	8	SKU: BLKSTL-76921-2	AMAZON	BLACK	4'' OVERALL DIAM x 2'' OD	6.000	11.00	66.00	COTIZADO	NO	CAMBIO DE VENDOR	2026-04-27	KEGWORKS	SI
56	GL-400	1/4'' T - CUSTOM GLASS	EACH	GLASS	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	7	ANTIQUE MIRROR	TCG ADVANCED ARCHITECTURAL GLASS	OIL SLICK- WITH POLISHED EDGES	1/4''	0.000	0.00	0.00	PENDIENTE	NO	\N	2026-04-22		SI
58	NC2	PLATE	EACH	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-26 01:36:33.934854+00	8	11		RICHELIEU			46.000	0.00	0.00	EN_STOCK	SI	\N	2026-04-22		EN_STOCK
59	NC3	16'' L SIDE MOUNTED SLIDES	PAIR	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	11		RICHELIEU		16''L	10.000	0.00	0.00	EN_STOCK	SI	\N	2026-04-22		EN_STOCK
60	NC4	18'' L SIDE MOUNTED SLIDES	PAIR	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	11		RICHELIEU		18''L	6.000	0.00	0.00	EN_STOCK	SI	\N	2026-04-22		EN_STOCK
34	HW-3	36"L, ARANA GAS STRUTS - 100 LB	PAIR	HARDWARE	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	9	2	B0DKT11LXG	AMAZON	BLACK		1.000	61.99	61.99	COTIZADO	NO	\N	2026-04-22		SI
35	WD-403	3/4''T - WHITE OAK MDF	EACH	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	7		RUGBY	PLAIN SLICE WHITE OAK	4X8	44.000	93.42	4110.48	COTIZADO	NO	\N	2026-04-22		SI
36	MDF-3/4	3/4''T- MDF	EACH	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	11		RUGBY		4X8	4.000	28.76	115.04	COTIZADO	NO	\N	2026-04-22		SI
37	MDF-1/2	1/2''T-MDF	EACH	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	11		RUGBY		4X8	2.000	21.35	42.70	COTIZADO	NO	\N	2026-04-22		SI
38	PLY-3/4	3/4''T - PLYWOOD	EACH	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	11		RUGBY		4X8	17.000	48.10	817.70	COTIZADO	NO	\N	2026-04-22		SI
40	EDGE BND-2 1/4''	2 1/4'' W - THIN VENEER EDGE BANDING	ROLL	EDGEBANDING	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	7	TO MATCH WD-403	FRAMATECH	PLAIN SLICE WHITE OAK	500LF	2.000	312.27	624.54	COTIZADO	NO	\N	2026-04-22		SI
42	EDGE BND-PL-402	15/16'' W - THIN EDGE BANDING	ROLL	EDGEBANDING	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	11	TO MATCH PL-402	FRAMATECH	TO MATCH PL-402	600 LF	1.000	402.75	402.75	COTIZADO	NO	\N	2026-04-22		SI
43	MEL-B	3/4'' BLACK MELAMINE	EACH	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	7/11/2026		RUGBY	BLACK	4X8	25.000	31.00	775.00	COTIZADO	NO	\N	2026-04-22		SI
44	1/4'' BACKER	1/4'' BLACK BACKER	EACH	MILLWORK	2026-04-22 22:22:23.113384+00	2026-04-22 22:22:23.113384+00	8	7/11/2026		RUGBY	BLACK	4X8	15.000	17.00	255.00	COTIZADO	NO	\N	2026-04-22		SI
95	WD-08	3/4''  PREFINISHED WOOD VENEER	EA	MILLWORK	2026-04-27 05:19:31.25482+00	2026-04-30 13:40:29.369141+00	11	10		HARDWOODS	PURE WALNUT	4''X11''	1.000	473.50	473.50	COTIZADO	NO	\N	2026-04-27	SHINNOKI	SI
113	PLAM-1	WILSONART 7984-38 MANGALORE MANGO	EA	MILLWORK	2026-04-30 14:39:55.452923+00	2026-04-30 19:31:03.764568+00	15	1,2	7984-38	RUGBY	MANGALORE MANGO - FINE VELVET TEXTURE FINISH	4X8	5.000	0.00	0.00	EN_STOCK	NO	\N	2026-04-30	WILSONART	EN_STOCK
110	MEL-W	3/4'' MELAMINE	EA	MILLWORK	2026-04-30 14:39:55.452923+00	2026-04-30 14:39:55.452923+00	15	1,2		RUGBY	WHITE	4X8	12.000	0.00	0.00	PENDIENTE	NO	\N	2026-04-30		SI
109	SS-1	1/2'' SOLID SURFACE	EA	SOLID SURFACE	2026-04-30 14:39:55.452923+00	2026-04-30 20:00:03.447076+00	15	1,2	9208CS	WILSONART	WHITE STONE	30''X144''	3.000	773.00	2319.00	COTIZADO	NO	\N	2026-04-30	WILSONART	SI
96	EB-WD-15	ABS BANDING	ROLL	EDGEBANDING	2026-04-27 05:19:31.25482+00	2026-04-30 13:40:29.369141+00	11	10		HARDWOODS	BURLEY OAK	1MMX24MMX50M	1.000	126.95	126.95	COTIZADO	NO	\N	2026-04-27	SHINNOKI	SI
94	WD-15	3/4''  PREFINISHED WOOD VENEER	EA	MILLWORK	2026-04-27 05:19:31.25482+00	2026-04-30 13:40:29.369141+00	11	10		HARDWOODS	BURLEY OAK	4''X11''	1.000	426.20	426.20	COTIZADO	NO	\N	2026-04-27	SHINNOKI	SI
111	MEL-W1	1/4'' MELAMINE	EA	MILLWORK	2026-04-30 14:39:55.452923+00	2026-04-30 14:39:55.452923+00	15	1,2		RUGBY	WHITE	4X8	1.000	0.00	0.00	PENDIENTE	NO	\N	2026-04-30		SI
112	PLY	1'' PLYWOOD CHINA	EA	MILLWORK	2026-04-30 14:39:55.452923+00	2026-04-30 14:39:55.452923+00	15	1,2		RUGBY	0	4X8	2.000	0.00	0.00	PENDIENTE	NO	\N	2026-04-30		SI
114	DWR	4''W x 1/2''T DRAWER SIDE, UV BIRCH	BAR	MILLWORK	2026-04-30 14:39:55.452923+00	2026-04-30 14:39:55.452923+00	15	1,2		RUGBY	UV FINISH	5LF	9.000	0.00	0.00	PENDIENTE	NO	\N	2026-04-30		SI
115	DWR-PLY	1/4'' PLYWOOD	EA	MILLWORK	2026-04-30 14:39:55.452923+00	2026-04-30 14:39:55.452923+00	15	1,2		RUGBY	UV FINISH	4X8	1.000	0.00	0.00	PENDIENTE	NO	\N	2026-04-30		SI
117	NC1	20'' SLIDES	PAIR	HARDWARE	2026-04-30 14:39:55.452923+00	2026-04-30 14:39:55.452923+00	15	1,2		RICHELIEU		0	8.000	0.00	0.00	EN_STOCK	NO	\N	2026-04-30		EN_STOCK
118	NC2A	HINGES	EA	HARDWARE	2026-04-30 14:39:55.452923+00	2026-04-30 14:39:55.452923+00	15	1,2		RICHELIEU		0	16.000	0.00	0.00	EN_STOCK	NO	\N	2026-04-30		EN_STOCK
119	NC2B	PLATES	EA	HARDWARE	2026-04-30 14:39:55.452923+00	2026-04-30 14:39:55.452923+00	15	1,2		RICHELIEU		0	16.000	0.00	0.00	EN_STOCK	NO	\N	2026-04-30		EN_STOCK
116	HW-1	4'' C-C FUNCTIONAL STEEL PULL	EA	HARDWARE	2026-04-30 14:39:55.452923+00	2026-04-30 19:42:08.345412+00	15	1,2	BP33206195	RICHELIEU	BRUSHED NICKEL	0	16.000	3.40	54.40	COTIZADO	NO	\N	2026-04-30		SI
121	EB-W	EDGE BANDING	0		2026-04-30 14:39:55.452923+00	2026-04-30 19:44:57.671915+00	15	1,2		FRAMATECH	TO MATCH WHITE MELAMINE	LF	70.000	0.00	0.00	EN_STOCK	NO	\N	2026-04-30		EN_STOCK
120	EB-1	EDGE BANDING	0		2026-04-30 14:39:55.452923+00	2026-04-30 19:46:36.743461+00	15	1,2		FRAMATECH	TO MATCH PLAM-1	LF	1.000	0.00	0.00	PENDIENTE	NO	\N	2026-04-30		SI
\.


--
-- Data for Name: mto_freight; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mto_freight (id, proyecto_id, vendor, freight, updated_at) FROM stdin;
1	11	BRAZOS	0.00	2026-04-28 01:49:26.098888+00
2	11	GEMINI	0.00	2026-04-28 01:50:46.306188+00
4	11	RUGBY	17.00	2026-04-28 01:54:20.044904+00
5	11	AMAZON	0.00	2026-04-28 02:13:43.586733+00
6	11	METALS4U	0.00	2026-04-28 20:03:09.500575+00
7	12	GEMINI	0.00	2026-04-29 18:13:57.797517+00
8	12	RUGBY	17.00	2026-04-29 18:19:14.068058+00
9	9	METALS4U	0.00	2026-04-29 21:07:26.321848+00
10	12	BRAZOS	0.00	2026-04-30 03:56:17.786612+00
3	11	HARDWOODS	700.00	2026-04-30 13:40:29.369141+00
12	15	WILSONART	100.00	2026-04-30 19:38:48.787039+00
13	15	RICHELIEU	12.50	2026-04-30 19:42:08.345412+00
\.


--
-- Data for Name: oc_imagenes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.oc_imagenes (id, orden_compra_id, tipo, filename, original_name, created_at) FROM stdin;
2	35	material_recibido	1777345274530-gt9mzcqdaeo.jpeg	ROCKLER.jpeg	2026-04-28 03:01:14.534842+00
3	35	delivery_ticket	1777345367238-atm4k36nyqr.png	Screenshot 2026-04-27 220229.png	2026-04-28 03:02:47.287236+00
4	33	material_recibido	1777345947294-dpme1s4k56o.jpeg	RICHELIU.jpeg	2026-04-28 03:12:27.360253+00
5	33	material_recibido_2	1777346035117-i8u3xpxwuc.jpeg	RICHELIU HW-5.jpeg	2026-04-28 03:13:55.124056+00
6	37	material_recibido	1777470805913-p69h4web41.jpeg	MT-02B.jpeg	2026-04-29 13:53:25.933089+00
7	37	material_recibido	1777470816429-7f5bfwvufhx.jpeg	DELIVERY TICKET.jpeg	2026-04-29 13:53:36.437489+00
8	41	material_recibido	1777475457419-i0mobrlfdgb.jpeg	DT RUGBY.jpeg	2026-04-29 15:10:57.483738+00
10	41	material_recibido	1777475792952-n79lqzxsz4p.jpeg	3-8 PLY.jpeg	2026-04-29 15:16:32.955162+00
11	42	material_recibido	1777495208269-nx0182hhtfr.jpeg	DT METALS4U.jpeg	2026-04-29 20:40:08.318066+00
12	42	material_recibido	1777495214114-urc0k6ww3hp.jpeg	ROUND TUBES.jpeg	2026-04-29 20:40:14.11974+00
13	43	material_recibido	1777496933877-ikv3rhcngu.jpeg	DT METASL 4U.jpeg	2026-04-29 21:08:53.884631+00
14	43	material_recibido	1777496940600-f0j2tf5ruv8.jpeg	FLAT BRACKETS.jpeg	2026-04-29 21:09:00.605035+00
\.


--
-- Data for Name: ordenes_compra; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ordenes_compra (id, numero, proyecto_id, proveedor_id, estado, fecha_emision, fecha_entrega_estimada, fecha_entrega_real, subtotal, iva, total, notas, created_at, updated_at, fecha_mto, categoria) FROM stdin;
37	OC-2026-0019	11	23	recibida	2026-04-27	2026-04-29	2026-04-29	66.00	10.56	76.56	\N	2026-04-28 02:41:05.283367+00	2026-04-29 13:59:49.510868+00	2026-04-27	HARDWARE
38	OC-2026-0020	11	18	enviada	2026-04-27	2026-04-29	\N	2117.70	338.83	2456.53	\N	2026-04-28 02:41:05.283367+00	2026-04-28 02:41:05.283367+00	2026-04-27	SOLID WOOD
39	OC-2026-0021	11	15	enviada	2026-04-27	2026-04-30	\N	299.95	47.99	347.94	\N	2026-04-28 02:41:05.283367+00	2026-04-28 02:41:05.283367+00	2026-04-27	PAINT
40	OC-2026-0022	11	26	enviada	2026-04-27	2026-05-11	\N	1112.50	178.00	1290.50	\N	2026-04-28 02:41:05.283367+00	2026-04-28 02:41:05.283367+00	2026-04-27	EDGEBANDING
41	OC-2026-0023	11	16	recibida	2026-04-27	2026-04-29	2026-04-29	244.75	39.16	283.91	\N	2026-04-28 02:41:05.283367+00	2026-04-29 15:21:06.454589+00	2026-04-27	MILLWORK
42	OC-2026-0024	11	22	recibida	2026-04-28	2026-04-29	2026-04-29	162.00	25.92	187.92	\N	2026-04-28 20:03:59.371526+00	2026-04-29 21:03:29.207776+00	2026-04-27	HARDWARE
43	OC-2026-0025	9	22	recibida	2026-04-29	2026-04-29	2026-04-29	39.02	6.24	45.26	\N	2026-04-29 21:08:25.295514+00	2026-04-29 21:09:11.603763+00	2026-04-22	METAL
20	OC-2026-002	8	16	recibida	2026-04-14	2026-04-15	2026-04-15	7875.84	1260.14	9135.98	THERE ARE 40 FAWN CYPRESS STILL PENDING	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00	\N	PLASTIC LAMINATE
21	OC-2026-003	8	17	recibida	2026-04-14	2026-04-16	2026-04-19	125.00	20.00	145.00	COMPLETED	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00	\N	EDGEBANDING
22	OC-2026-004	8	18	recibida	2026-04-14	2026-04-16	2026-04-16	537.77	86.04	623.81	Entrega est.: 04/17/2026	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00	\N	SOLID WOOD
23	OC-2026-005	8	19	confirmada	2026-04-14	2026-04-16	\N	103.45	16.55	120.00	NEW ETA 4.23.2026	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00	\N	HARDWARE
24	OC-2026-006	8	20	recibida	2026-04-14	2026-04-16	2026-04-16	296.55	47.45	344.00	ORDEN COMPLETA	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00	\N	HARDWARE
25	OC-2026-007	9	16	recibida	2026-04-14	2026-04-15	2026-04-15	4310.38	689.66	5000.04	THERE ARE 21 NATURAL REACON STILL PENDING & CHEMETAL ETA 4 WEEKS	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00	\N	MILLWORK
26	OC-2026-008	9	17	recibida	2026-04-14	2026-04-16	2026-04-16	51.72	8.28	60.00	COMPLETED	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00	\N	EDGEBANDING
27	OC-2026-009	9	21	confirmada	2026-04-14	2026-04-21	\N	1259.86	201.58	1461.44	\N	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00	\N	HARDWARE
28	OC-2026-010	9	22	confirmada	2026-04-14	2026-04-19	\N	46.55	7.45	54.00	\N	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00	\N	METAL
29	OC-2026-011	9	23	recibida	2026-04-14	2026-04-16	2026-04-15	53.44	8.55	61.99	COMPLETED	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00	\N	HARDWARE
30	OC-2026-012	8	16	confirmada	2026-04-20	2026-04-21	\N	6678.91	1068.63	7747.54	PL Y0621K-16 WAS REMOVED BY CLIENT	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00	\N	PLASTIC LAMINATE
31	OC-2026-013	8	17	confirmada	2026-04-20	2026-04-22	\N	951.33	152.21	1103.54	\N	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00	\N	EDGEBANDING
32	OC-2026-014	8	18	confirmada	2026-04-20	2026-04-22	\N	4846.14	775.38	5621.52	\N	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00	\N	SOLID WOOD
34	OC-2026-016	8	20	confirmada	2026-04-20	2026-04-26	\N	120.10	19.22	139.32	\N	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00	\N	HARDWARE
36	OC-2026-018	8	25	confirmada	2026-04-20	2026-04-26	\N	68.62	10.98	79.60	\N	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00	\N	HARDWARE
35	OC-2026-017	8	24	recibida	2026-04-20	2026-04-26	\N	715.34	114.46	829.80	\N	2026-04-22 21:34:55.707461+00	2026-04-28 03:09:12.926151+00	\N	HARDWARE
33	OC-2026-015	8	19	recibida	2026-04-20	2026-04-26	\N	392.99	62.88	455.87	\N	2026-04-22 21:34:55.707461+00	2026-04-28 03:14:38.861035+00	\N	HARDWARE
19	OC-2026-001	8	15	recibida	2026-04-14	2026-04-21	2026-04-19	103.45	16.55	120.00	COMPLETED	2026-04-22 21:34:55.707461+00	2026-04-29 21:00:35.874555+00	\N	PAINT
48	OC-2026-0030	15	30	enviada	2026-04-30	2026-05-06	\N	2319.00	371.04	2690.04	\N	2026-04-30 19:55:02.750231+00	2026-04-30 19:55:02.750231+00	2026-04-30	SOLID SURFACE
44	OC-2026-0026	12	18	enviada	2026-04-29	2026-05-01	\N	582.00	93.12	675.12	\N	2026-04-30 03:57:43.123382+00	2026-04-30 03:57:43.123382+00	2026-04-29	MILLWORK
45	OC-2026-0027	12	15	enviada	2026-04-29	2026-05-06	\N	120.00	19.20	139.20	\N	2026-04-30 03:57:43.123382+00	2026-04-30 03:57:43.123382+00	2026-04-29	PAINT
46	OC-2026-0028	12	16	enviada	2026-04-29	2026-05-01	\N	67.50	10.80	78.30	\N	2026-04-30 03:57:43.123382+00	2026-04-30 03:57:43.123382+00	2026-04-29	MILLWORK
47	OC-2026-0029	15	19	enviada	2026-04-30	\N	\N	54.40	8.70	63.10	\N	2026-04-30 19:48:25.492453+00	2026-04-30 19:48:25.492453+00	2026-04-30	HARDWARE
\.


--
-- Data for Name: proveedores; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.proveedores (id, nombre, contacto, email, telefono, rfc, direccion, activo, created_at, updated_at) FROM stdin;
1	Maderas del Norte S.A.	Carlos Ramírez	ventas@maderasnorte.mx	81-1234-5678	MDN8901014A1	\N	t	2026-04-20 22:40:44.342705+00	2026-04-20 22:40:44.342705+00
2	Herrajes y Accesorios HYA	Laura Vega	laura@hya.mx	55-9876-5432	HYA0203055B2	\N	t	2026-04-20 22:40:44.342705+00	2026-04-20 22:40:44.342705+00
3	Pinturas Corona MX	Miguel Flores	mflores@corona.mx	33-4567-8901	PCM1105122C3	\N	t	2026-04-20 22:40:44.342705+00	2026-04-20 22:40:44.342705+00
15	GEMINI				\N	\N	t	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00
17	FRAMATECH				\N	\N	t	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00
19	RICHELIEU				\N	\N	t	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00
20	MOCKETT				\N	\N	t	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00
21	TLO				\N	\N	t	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00
22	METALS4U				\N	\N	t	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00
23	AMAZON				\N	\N	t	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00
24	ROCKLER				\N	\N	t	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00
25	A&M				\N	\N	t	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00
27	KEGWORKS						t	2026-04-27 19:20:02.756117+00	2026-04-27 19:20:02.756117+00
28	TCG ADVANCED ARCHITECTURAL GLASS						t	2026-04-27 19:20:02.761738+00	2026-04-27 19:20:02.761738+00
29	REAL STEEL GUYS						t	2026-04-27 19:20:02.762098+00	2026-04-27 19:20:02.762098+00
26	HARDWOODS	SABRINA CORNEJO	SCornejo@hardwoods-inc.com				t	2026-04-27 19:20:02.755517+00	2026-04-27 20:29:49.188091+00
18	BRAZOS	OTONIEL ALVAREZ	tonyalvarez@brazosfp.com				t	2026-04-22 21:34:55.707461+00	2026-04-27 20:30:05.638131+00
16	RUGBY	MEAGAN MOONEY	mmooney@rugbyabp.com				t	2026-04-22 21:34:55.707461+00	2026-04-30 18:45:13.053901+00
30	WILSONART			2146342310			t	2026-04-30 20:01:22.131738+00	2026-04-30 20:01:22.131738+00
\.


--
-- Data for Name: proyectos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.proyectos (id, codigo, nombre, cliente, descripcion, estado, fecha_inicio, fecha_fin_estimada, fecha_fin_real, presupuesto, responsable, created_at, updated_at) FROM stdin;
8	PRY-2026-577	JDV BY HYATT PHASE 1	SAMANTA LEGUIZAMON	\N	activo	\N	\N	\N	144515.60	\N	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00
9	PRY-2026-586	ASCENSION COFFEE RENOVATION FORT WORTH	DANIELA PINELL	\N	activo	\N	\N	\N	10760.87	\N	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00
11	PRY-2026-579	BOSQUE AT WATERLINE AUSTIN, TX	KAROI		activo	\N	\N	\N	82708.13	VIVAN QUIÑONES	2026-04-26 23:25:39.319735+00	2026-04-27 04:35:09.304459+00
12	PRY-2026-547	SANDMAN ELEVATOR	FIRST ONSITE	SANDAMAN HOTEL ELEVATOR	activo	\N	\N	\N	142359.84	SAMANTHA LEGUIZAMON	2026-04-29 18:07:49.565554+00	2026-04-29 18:07:49.565554+00
15	PRY-2026-590	HALSEY HALL BARIATRIC ROOM	ICGM GROUP	\N	activo	\N	\N	\N	4073.71	VIVAN QUIÑONES	2026-04-30 14:38:37.801705+00	2026-04-30 14:38:37.801705+00
\.


--
-- Data for Name: recepcion_materiales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.recepcion_materiales (id, id_recepcion, id_material, cm_code, descripcion, recibido, nota, created_at) FROM stdin;
2	19	49	WD-406	LIVE EDGE	t	\N	2026-04-28 03:09:12.926151+00
3	20	16	HW-1	2 3/4'' L- EDGE PULL	t	\N	2026-04-28 03:13:04.52851+00
4	20	18	NC1	HINGES OVERLAY	t	\N	2026-04-28 03:13:04.52851+00
5	20	19	NC2	PLATE	t	\N	2026-04-28 03:13:04.52851+00
6	20	59	NC3	16'' L SIDE MOUNTED SLIDES	t	\N	2026-04-28 03:13:04.52851+00
7	20	60	NC4	18'' L SIDE MOUNTED SLIDES	t	\N	2026-04-28 03:13:04.52851+00
8	20	53	HW-5	2 3/8'' DIA -GROMMET BORE	f	\N	2026-04-28 03:13:04.52851+00
9	20	51	HW-3	4 3/16'' L - METAL PULL	t	\N	2026-04-28 03:13:04.52851+00
10	20	52	HW-4	DRAWER CAM LOCK	t	\N	2026-04-28 03:13:04.52851+00
11	20	57	NC1	HINGES OVERLAY	t	\N	2026-04-28 03:13:04.52851+00
12	20	58	NC2	PLATE	t	\N	2026-04-28 03:13:04.52851+00
13	20	55	HW-7	1 3/4'' DOOR CAM LOCK	t	\N	2026-04-28 03:13:04.52851+00
14	21	16	HW-1	2 3/4'' L- EDGE PULL	f	\N	2026-04-28 03:14:38.861035+00
15	21	18	NC1	HINGES OVERLAY	f	\N	2026-04-28 03:14:38.861035+00
16	21	19	NC2	PLATE	f	\N	2026-04-28 03:14:38.861035+00
17	21	59	NC3	16'' L SIDE MOUNTED SLIDES	f	\N	2026-04-28 03:14:38.861035+00
18	21	60	NC4	18'' L SIDE MOUNTED SLIDES	f	\N	2026-04-28 03:14:38.861035+00
19	21	53	HW-5	2 3/8'' DIA -GROMMET BORE	t	\N	2026-04-28 03:14:38.861035+00
20	21	51	HW-3	4 3/16'' L - METAL PULL	f	\N	2026-04-28 03:14:38.861035+00
21	21	52	HW-4	DRAWER CAM LOCK	f	\N	2026-04-28 03:14:38.861035+00
22	21	57	NC1	HINGES OVERLAY	f	\N	2026-04-28 03:14:38.861035+00
23	21	58	NC2	PLATE	f	\N	2026-04-28 03:14:38.861035+00
24	21	55	HW-7	1 3/4'' DOOR CAM LOCK	f	\N	2026-04-28 03:14:38.861035+00
25	22	92	MT-02A	METAL ROUND TUBES	f	\N	2026-04-28 20:04:23.333205+00
26	24	94	WD-15	3/4''  PREFINISHED WOOD VENEER	f	\N	2026-04-28 20:04:44.208615+00
27	24	95	WD-08	3/4''  PREFINISHED WOOD VENEER	f	\N	2026-04-28 20:04:44.208615+00
28	24	96	EB-WD-15	ABS BANDING	f	\N	2026-04-28 20:04:44.208615+00
29	24	97	EB-WD-08	ABS BANDING	f	\N	2026-04-28 20:04:44.208615+00
30	26	91	3/8PLY	3/8'' PLYWOOD CHINA	f	\N	2026-04-28 23:46:48.824882+00
31	28	93	MT-02B	4'' WALL FLANGES - BLACKENED STEEL - 2'' OD	f	\N	2026-04-29 13:45:43.674647+00
32	30	93	MT-02B	4'' WALL FLANGES - BLACKENED STEEL - 2'' OD	t	\N	2026-04-29 13:53:54.449469+00
33	31	91	3/8PLY	3/8'' PLYWOOD CHINA	t	\N	2026-04-29 15:11:22.697521+00
43	42	92	MT-02A	METAL ROUND TUBES	t	\N	2026-04-29 21:03:29.207776+00
44	43	33	NC-3	36"L FLAT BRACKETS	f	\N	2026-04-29 21:08:31.458838+00
45	45	33	NC-3	36"L FLAT BRACKETS	t	\N	2026-04-29 21:09:11.603763+00
\.


--
-- Data for Name: recepciones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.recepciones (id, folio, orden_compra_id, estado, fecha_recepcion, recibio, notas, created_at, updated_at) FROM stdin;
6	REC-2026-003	22	completa	2026-04-16	JOHN GONZALES	COMPLETED 4.20.26	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00
7	REC-2026-019	24	completa	2026-04-16	JOHN GONZALES	ORDEN COMPLETA	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00
8	REC-2026-020	25	completa	2026-04-15	CHALI HERRERA	THERE ARE 21 NATURAL REACON STILL PENDING & CHEMETAL ETA 4 WEEKS	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00
9	REC-2026-021	26	completa	2026-04-16	CHALI HERRERA	COMPLETED	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00
10	REC-2026-022	29	completa	2026-04-15	CHALI HERRERA	COMPLETED	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00
11	REC-2026-023	19	completa	2026-04-22	CHALI HERRERA	COMPLETED	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00
12	REC-2026-024	21	completa	2026-04-19	JOHN GONZALES	COMPLETED	2026-04-22 21:34:55.707461+00	2026-04-22 21:34:55.707461+00
19	REC-2026-0025	35	completa	2026-04-28	CHALI HERRERA	ORDEN COMPLETA 10 CAJAS	2026-04-28 03:09:12.926151+00	2026-04-28 03:09:12.926151+00
20	REC-2026-0026	33	con_diferencias	2026-04-28	CHALI HERRERA	FALTA HW-5	2026-04-28 03:13:04.52851+00	2026-04-28 03:13:04.52851+00
21	REC-2026-0027	33	completa	2026-04-28	CHALI HERRERA	ENTREGA TOTAL 4.27.28 SE COMPLETO CON HW5	2026-04-28 03:14:38.861035+00	2026-04-28 03:14:38.861035+00
22	REC-2026-0028	42	pendiente	\N	\N	\N	2026-04-28 20:04:23.333205+00	2026-04-28 20:04:23.333205+00
24	REC-2026-0029	40	pendiente	\N	\N	\N	2026-04-28 20:04:44.208615+00	2026-04-28 20:04:44.208615+00
26	REC-2026-0030	41	pendiente	\N	\N	\N	2026-04-28 23:46:48.824882+00	2026-04-28 23:46:48.824882+00
28	REC-2026-0031	37	pendiente	\N	\N	\N	2026-04-29 13:45:43.674647+00	2026-04-29 13:45:43.674647+00
30	REC-2026-0032	37	completa	2026-04-29	CHALI HERRERA	COMPLETA	2026-04-29 13:53:54.449469+00	2026-04-29 13:59:49.519374+00
31	REC-2026-0033	41	completa	2026-04-29	CHALI HERRERA	COMPLETA	2026-04-29 15:11:22.697521+00	2026-04-29 15:11:22.697521+00
42	REC-2026-0034	42	completa	2026-04-29	CHALI HERRERA	COMPLETA	2026-04-29 21:03:29.207776+00	2026-04-29 21:03:29.207776+00
43	REC-2026-0035	43	pendiente	\N	\N	\N	2026-04-29 21:08:31.458838+00	2026-04-29 21:08:31.458838+00
45	REC-2026-0036	43	completa	2026-04-29	CHALI HERRERA	COMPLETA	2026-04-29 21:09:11.603763+00	2026-04-29 21:09:11.603763+00
\.


--
-- Data for Name: solicitudes_cotizacion; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.solicitudes_cotizacion (id, folio, proyecto_id, proveedor_id, estado, fecha_solicitud, fecha_respuesta, monto_cotizado, notas, created_at, updated_at, vendor, materiales_incluidos, email_destinatario, fecha_envio) FROM stdin;
1	COT-2026-0001	11	\N	enviada	2026-04-27	\N	\N	\N	2026-04-27 18:53:33.059828+00	2026-04-27 18:53:33.059828+00	BRAZOS	[{"qty": "50.000", "codigo": "1/4POP", "unidad": "EA", "descripcion": "1/4''X8'' SOLID POPLAR"}, {"qty": "90.000", "codigo": "1/4WOAK", "unidad": "EA", "descripcion": "1/4'' X 8''THICK - SOLID WHITE OAK"}, {"qty": "40.000", "codigo": "5/8POP", "unidad": "EA", "descripcion": "5/8''X 8''-SOLID POPLAR"}, {"qty": "100.000", "codigo": "5/8WOAK", "unidad": "EA", "descripcion": "5/8''X 8''-SOLID WHITE OAK"}]	chali@centralmillwork.com	2026-04-27 18:53:33.059828+00
2	COT-2026-0002	11	\N	enviada	2026-04-27	\N	\N	\N	2026-04-27 19:12:28.657937+00	2026-04-27 19:12:28.657937+00	BRAZOS	[{"qty": "50.000", "codigo": "1/4POP", "unidad": "EA", "descripcion": "1/4''X8'' SOLID POPLAR"}, {"qty": "90.000", "codigo": "1/4WOAK", "unidad": "EA", "descripcion": "1/4'' X 8''THICK - SOLID WHITE OAK"}, {"qty": "40.000", "codigo": "5/8POP", "unidad": "EA", "descripcion": "5/8''X 8''-SOLID POPLAR"}, {"qty": "100.000", "codigo": "5/8WOAK", "unidad": "EA", "descripcion": "5/8''X 8''-SOLID WHITE OAK"}]	chali@centralmillwork.com	2026-04-27 19:12:28.657937+00
3	COT-2026-0003	11	\N	enviada	2026-04-27	\N	\N	\N	2026-04-27 20:30:34.64616+00	2026-04-27 20:30:34.64616+00	BRAZOS	[{"qty": "50.000", "codigo": "1/4POP", "unidad": "EA", "descripcion": "1/4''X8'' SOLID POPLAR"}, {"qty": "90.000", "codigo": "1/4WOAK", "unidad": "EA", "descripcion": "1/4'' X 8''THICK - SOLID WHITE OAK"}, {"qty": "40.000", "codigo": "5/8POP", "unidad": "EA", "descripcion": "5/8''X 8''-SOLID POPLAR"}, {"qty": "100.000", "codigo": "5/8WOAK", "unidad": "EA", "descripcion": "5/8''X 8''-SOLID WHITE OAK"}]	tonyalvarez@brazosfp.com	2026-04-27 20:30:34.64616+00
4	COT-2026-0004	11	\N	enviada	2026-04-27	\N	\N	\N	2026-04-27 20:43:43.010976+00	2026-04-27 20:43:43.010976+00	GEMINI	[{"qty": "1.000", "codigo": "PT-03", "unidad": "GAL", "descripcion": "PAINT"}, {"qty": "1.000", "codigo": "PT-06", "unidad": "GAL", "descripcion": "PAINT"}, {"qty": "2.000", "codigo": "WD-15 MATCH", "unidad": "GAL", "descripcion": "STAIN"}, {"qty": "1.000", "codigo": "PT-100", "unidad": "GAL", "descripcion": "PAINT"}]	chali@centralmillwork.com	2026-04-27 20:43:43.010976+00
5	COT-2026-0005	11	\N	enviada	2026-04-27	\N	\N	\N	2026-04-27 20:50:29.531062+00	2026-04-27 20:50:29.531062+00	GEMINI	[{"qty": "1.000", "codigo": "PT-03", "unidad": "GAL", "descripcion": "PAINT"}, {"qty": "1.000", "codigo": "PT-06", "unidad": "GAL", "descripcion": "PAINT"}, {"qty": "2.000", "codigo": "WD-15 MATCH", "unidad": "GAL", "descripcion": "STAIN"}, {"qty": "1.000", "codigo": "PT-100", "unidad": "GAL", "descripcion": "PAINT"}]	chali@centralmillwork.com	2026-04-27 20:50:29.531062+00
6	COT-2026-0006	11	\N	enviada	2026-04-27	\N	\N	\N	2026-04-27 20:57:55.847037+00	2026-04-27 20:57:55.847037+00	GEMINI	[{"qty": "1.000", "codigo": "PT-03", "unidad": "GAL", "descripcion": "PAINT"}, {"qty": "1.000", "codigo": "PT-06", "unidad": "GAL", "descripcion": "PAINT"}, {"qty": "2.000", "codigo": "WD-15 MATCH", "unidad": "GAL", "descripcion": "STAIN"}, {"qty": "1.000", "codigo": "PT-100", "unidad": "GAL", "descripcion": "PAINT"}]	chali@centralmillwork.com	2026-04-27 20:57:55.847037+00
7	COT-2026-0007	11	\N	enviada	2026-04-27	\N	\N	\N	2026-04-27 21:14:19.085879+00	2026-04-27 21:14:19.085879+00	GEMINI	[{"qty": "1.000", "codigo": "PT-03", "unidad": "GAL", "descripcion": "PAINT"}, {"qty": "1.000", "codigo": "PT-06", "unidad": "GAL", "descripcion": "PAINT"}, {"qty": "2.000", "codigo": "WD-15 MATCH", "unidad": "GAL", "descripcion": "STAIN"}, {"qty": "1.000", "codigo": "PT-100", "unidad": "GAL", "descripcion": "PAINT"}]	chali@centralmillwork.com	2026-04-27 21:14:19.085879+00
8	COT-2026-0008	11	\N	enviada	2026-04-27	\N	\N	\N	2026-04-27 21:31:17.410779+00	2026-04-27 21:31:17.410779+00	GEMINI	[{"qty": "1.000", "codigo": "PT-03", "unidad": "GAL", "descripcion": "PAINT"}, {"qty": "1.000", "codigo": "PT-06", "unidad": "GAL", "descripcion": "PAINT"}, {"qty": "2.000", "codigo": "WD-15 MATCH", "unidad": "GAL", "descripcion": "STAIN"}, {"qty": "1.000", "codigo": "PT-100", "unidad": "GAL", "descripcion": "PAINT"}]	chali@centralmillwork.com	2026-04-27 21:31:17.410779+00
9	COT-2026-0009	11	\N	enviada	2026-04-27	\N	\N	\N	2026-04-27 21:42:48.854242+00	2026-04-27 21:42:48.854242+00	GEMINI	[{"qty": "1.000", "codigo": "PT-03", "unidad": "GAL", "descripcion": "PAINT"}, {"qty": "1.000", "codigo": "PT-06", "unidad": "GAL", "descripcion": "PAINT"}, {"qty": "2.000", "codigo": "WD-15 MATCH", "unidad": "GAL", "descripcion": "STAIN"}, {"qty": "1.000", "codigo": "PT-100", "unidad": "GAL", "descripcion": "PAINT"}]	chali@centralmillwork.com	2026-04-27 21:42:48.854242+00
10	COT-2026-0010	11	\N	enviada	2026-04-27	\N	\N	\N	2026-04-27 21:59:19.439863+00	2026-04-27 21:59:19.439863+00	GEMINI	[{"qty": "1.000", "codigo": "PT-03", "unidad": "GAL", "descripcion": "PAINT"}, {"qty": "1.000", "codigo": "PT-06", "unidad": "GAL", "descripcion": "PAINT"}, {"qty": "2.000", "codigo": "WD-15 MATCH", "unidad": "GAL", "descripcion": "STAIN"}, {"qty": "1.000", "codigo": "PT-100", "unidad": "GAL", "descripcion": "PAINT"}]	chali@centralmillwork.com	2026-04-27 21:59:19.439863+00
11	COT-2026-0011	11	\N	enviada	2026-04-27	\N	\N	\N	2026-04-28 01:33:46.16232+00	2026-04-28 01:33:46.16232+00	GEMINI	[{"qty": "1.000", "codigo": "PT-03", "unidad": "GAL", "descripcion": "PAINT"}, {"qty": "1.000", "codigo": "PT-06", "unidad": "GAL", "descripcion": "PAINT"}, {"qty": "2.000", "codigo": "WD-15 MATCH", "unidad": "GAL", "descripcion": "STAIN"}, {"qty": "1.000", "codigo": "PT-100", "unidad": "GAL", "descripcion": "PAINT"}]	chali@centralmillwork.com	2026-04-28 01:33:46.16232+00
12	COT-2026-0012	11	\N	enviada	2026-04-28	\N	\N	\N	2026-04-29 01:18:04.157123+00	2026-04-29 01:18:04.157123+00	METALS4U	[{"qty": "3.000", "codigo": "MT-02A", "unidad": "EA", "descripcion": "METAL ROUND TUBES"}]	chali@centralmillwork.com	2026-04-29 01:18:04.157123+00
13	COT-2026-0013	11	\N	enviada	2026-04-28	\N	\N	\N	2026-04-29 01:24:20.779217+00	2026-04-29 01:24:20.779217+00	AMAZON	[{"qty": "6.000", "codigo": "MT-02B", "unidad": "EA", "descripcion": "4'' WALL FLANGES - BLACKENED STEEL - 2'' OD"}]	chali@centralmillwork.com	2026-04-29 01:24:20.779217+00
14	COT-2026-0014	11	\N	enviada	2026-04-28	\N	\N	\N	2026-04-29 01:45:17.643944+00	2026-04-29 01:45:17.643944+00	GEMINI	[{"qty": "1.000", "codigo": "PT-03", "unidad": "GAL", "descripcion": "PAINT"}, {"qty": "1.000", "codigo": "PT-06", "unidad": "GAL", "descripcion": "PAINT"}, {"qty": "2.000", "codigo": "WD-15 MATCH", "unidad": "GAL", "descripcion": "STAIN"}, {"qty": "1.000", "codigo": "PT-100", "unidad": "GAL", "descripcion": "PAINT"}]	chali@centralmillwork.com	2026-04-29 01:45:17.643944+00
15	COT-2026-0015	12	\N	enviada	2026-04-29	\N	\N	\N	2026-04-29 18:12:00.603785+00	2026-04-29 18:12:00.603785+00	BRAZOS	[{"qty": "20.000", "codigo": "WD-POPLAR", "unidad": "EACH", "descripcion": "ROUGH POPLAR WOOD"}]	tonyalvarez@brazosfp.com	2026-04-29 18:12:00.603785+00
\.


--
-- Data for Name: usuarios; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.usuarios (id, nombre, email, password_hash, rol, activo, created_at, updated_at) FROM stdin;
6938d6ba-6914-46f0-a2ee-a513aa584573	Chali Herrera	chali@centralmillwork.com	$2a$10$p2m/RVnb.jcUtTqlGTOWweUynjG2.Pee/2eFkzXpT4cYzEPlApKrO	ADMIN	t	2026-04-29 04:56:23.094243+00	2026-04-29 04:56:23.094243+00
\.


--
-- Name: items_orden_compra_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.items_orden_compra_id_seq', 21, true);


--
-- Name: items_recepcion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.items_recepcion_id_seq', 1, false);


--
-- Name: materiales_mto_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.materiales_mto_id_seq', 121, true);


--
-- Name: mto_freight_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mto_freight_id_seq', 13, true);


--
-- Name: oc_imagenes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.oc_imagenes_id_seq', 14, true);


--
-- Name: ordenes_compra_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.ordenes_compra_id_seq', 48, true);


--
-- Name: proveedores_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.proveedores_id_seq', 30, true);


--
-- Name: proyectos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.proyectos_id_seq', 15, true);


--
-- Name: recepcion_materiales_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.recepcion_materiales_id_seq', 45, true);


--
-- Name: recepciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.recepciones_id_seq', 45, true);


--
-- Name: solicitudes_cotizacion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.solicitudes_cotizacion_id_seq', 15, true);


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
-- Name: oc_imagenes oc_imagenes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oc_imagenes
    ADD CONSTRAINT oc_imagenes_pkey PRIMARY KEY (id);


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
-- Name: idx_cotizaciones_proveedor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cotizaciones_proveedor ON public.solicitudes_cotizacion USING btree (proveedor_id);


--
-- Name: idx_cotizaciones_proyecto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cotizaciones_proyecto ON public.solicitudes_cotizacion USING btree (proyecto_id);


--
-- Name: idx_oc_imagenes_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oc_imagenes_orden ON public.oc_imagenes USING btree (orden_compra_id);


--
-- Name: idx_ordenes_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordenes_estado ON public.ordenes_compra USING btree (estado);


--
-- Name: idx_ordenes_proveedor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordenes_proveedor ON public.ordenes_compra USING btree (proveedor_id);


--
-- Name: idx_ordenes_proyecto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordenes_proyecto ON public.ordenes_compra USING btree (proyecto_id);


--
-- Name: idx_proyectos_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proyectos_estado ON public.proyectos USING btree (estado);


--
-- Name: idx_recepcion_materiales_recepcion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recepcion_materiales_recepcion ON public.recepcion_materiales USING btree (id_recepcion);


--
-- Name: idx_recepciones_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recepciones_orden ON public.recepciones USING btree (orden_compra_id);


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
-- Name: oc_imagenes oc_imagenes_orden_compra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oc_imagenes
    ADD CONSTRAINT oc_imagenes_orden_compra_id_fkey FOREIGN KEY (orden_compra_id) REFERENCES public.ordenes_compra(id) ON DELETE CASCADE;


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
-- PostgreSQL database dump complete
--

\unrestrict T5wI5Fl8ITN0YkZegAaORh5RM8uV7tJ7YB3l7qD3fxoaWA3Wh9rHEW9rdgG50nl

