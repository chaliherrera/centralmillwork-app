"""
Carga la biblioteca y un estimado en las tablas de las migraciones 102 y 103,
y verifica leyendo de la base.

    python3 tools/estimados/cargar.py "dbname=cm_estimados_test"

Entra:
  datos/catalogo.json       las 167 recetas del catálogo del proyecto (modo 'directo')
  datos/maestro.json        los materiales y la composición de las 67 del maestro
  datos/estimado.json       el proyecto

Las recetas del maestro se emparejan contra las del catálogo por nombre (exacto o
aproximado) y SOLO se acepta el emparejamiento si además los costos coinciden:
los nombres derivaron entre el maestro y las copias de proyecto, así que el costo
es el árbitro.

Emparejada = se le carga la composición y queda en modo 'calculado'.
El resto queda en 'directo', con su número de siempre.

⚠ El repo es público: este script no contiene ningún costo, los lee de datos/.
"""
import json, os, sys, re, difflib, decimal, collections

try:
    import psycopg2
except ImportError:
    sys.exit("falta psycopg2: pip3 install --user psycopg2-binary")

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "datos")
DSN = sys.argv[1] if len(sys.argv) > 1 else "dbname=cm_estimados_test"
MODO_CALCULADO = "--solo-directo" not in sys.argv

cat = json.load(open(os.path.join(D, "catalogo.json")))
mae = json.load(open(os.path.join(D, "maestro.json")))
est = json.load(open(os.path.join(D, "estimado.json")))
p = est["parametros"]
Q = decimal.Decimal


def norm(s):
    return re.sub(r'[^a-z0-9]+', ' ', str(s).lower()).strip()


# ── un precio por material: el más repetido gana ────────────────────────
precios = collections.defaultdict(collections.Counter)
for r in mae["recetas"]:
    for l in r["lineas"]:
        precios[norm(l["material"])][round(l["costo"], 4)] += 1
canon = {k: v.most_common(1)[0][0] for k, v in precios.items()}
corregidos = sum(1 for k, v in precios.items() if len(v) > 1)

# ── emparejar maestro <-> catálogo del proyecto ─────────────────────────
# El nombre derivó mucho entre el maestro y las copias de proyecto ("Lower P. Lam
# Mid" vs 'Melamine Interior + Plam Doors "Lower Mid"'), así que el COSTO es mejor
# llave que el texto: son casi únicos. Se empareja por costo y el nombre desempata.
TOL = 0.005          # 0,5 %
porcat = [r for r in cat["recetas"] if r.get("_cogs_excel")]
pares, dudosos, sin_par = [], [], []
tomadas = {}
for m in sorted(mae["recetas"], key=lambda x: -(x["total"] or 0)):
    tot = m["total"] or 0
    if not tot:
        sin_par.append((m, "sin costo")); continue
    cands = [r for r in porcat if abs(r["_cogs_excel"] - tot) / tot <= TOL]
    if not cands:
        sin_par.append((m, "ningún costo parecido")); continue
    k = norm(m["nombre"])
    cands.sort(key=lambda r: -difflib.SequenceMatcher(None, k, norm(r["descripcion"])).ratio())
    elegido = next((r for r in cands if r["descripcion"] not in tomadas), None)
    if elegido is None:
        dudosos.append((m, cands[0], cands[0]["_cogs_excel"], tot)); continue
    sim = difflib.SequenceMatcher(None, k, norm(elegido["descripcion"])).ratio()
    tomadas[elegido["descripcion"]] = m
    pares.append((m, elegido, "exacto" if sim > 0.95 else
                  ("parecido" if sim > 0.55 else "sólo por costo")))

# ── base ────────────────────────────────────────────────────────────────
cn = psycopg2.connect(DSN); cn.autocommit = False; cx = cn.cursor()
cx.execute("TRUNCATE est_estimados, est_recetas, est_grupos, est_tarifas, "
           "est_materiales, est_catalogo_versiones RESTART IDENTITY CASCADE")

cx.execute("INSERT INTO est_tarifas (clave, valor, vigente_desde, nota) VALUES "
           "('taller', %s, '2025-06-12', 'Labor upgrade jun-2025')",
           (mae["tarifa_taller"],))
cx.execute("INSERT INTO est_tarifas (clave, valor, vigente_desde, nota) VALUES "
           "('instalacion', %s, '2025-06-12', 'portado del Excel')",
           (p["tarifa_instalacion"],))

for g in cat["grupos"]:
    cx.execute("INSERT INTO est_grupos (nombre, margen) VALUES (%s, %s)",
               (g["nombre"], g["margen"]))

cx.execute("INSERT INTO est_catalogo_versiones (nombre, fecha, nota) VALUES "
           "(%s, %s, %s) RETURNING id",
           (est.get("version_catalogo", "porteo inicial"),
            est.get("fecha_catalogo", est.get("fecha")),
            "porteo del maestro + catálogo del proyecto"))
version_id = cx.fetchone()[0]

mat_id = {}
for m in mae["materiales"]:
    k = norm(m["descripcion"])
    cx.execute("INSERT INTO est_materiales (descripcion, unidad, costo, tipo, costo_origen, "
               "costo_fecha) VALUES (%s, %s, %s, %s, 'catalogo', '2025-06-12') RETURNING id",
               (m["descripcion"], m["unidad"], canon[k], m["tipo"]))
    mat_id[k] = cx.fetchone()[0]

rec_id = {}
for r in cat["recetas"]:
    cx.execute("""
        INSERT INTO est_recetas (descripcion, unidad, grupo_id, horas_unidad, tarifa_override,
                                 fuente_costo, costo_directo, material_estandar, fees_extra,
                                 comentario)
        VALUES (%s, %s, (SELECT id FROM est_grupos WHERE nombre = %s), %s, %s,
                'directo', %s, %s, %s, %s) RETURNING id
    """, (r["descripcion"], r["unidad"], r["grupo"], r["horas_unidad"], r["tarifa_override"],
          r["costo_material"], r["material_estandar"], r["fees_extra"], r["comentario"]))
    rec_id[r["descripcion"]] = cx.fetchone()[0]

# ── composiciones ───────────────────────────────────────────────────────
for m, c, _ in pares:
    rid = rec_id[c["descripcion"]]
    vistos = set()
    for l in m["lineas"]:
        k = norm(l["material"])
        if k in vistos:          # misma materia dos veces en la receta: se suma
            cx.execute("UPDATE est_receta_materiales SET cantidad = cantidad + %s "
                       "WHERE receta_id = %s AND material_id = %s",
                       (l["cantidad"], rid, mat_id[k]))
            continue
        vistos.add(k)
        cx.execute("INSERT INTO est_receta_materiales (receta_id, material_id, cantidad) "
                   "VALUES (%s, %s, %s)", (rid, mat_id[k], l["cantidad"]))
    # Las horas NO se tocan: las del catálogo del proyecto son las que produjeron
    # el estimado. Si el maestro tiene otras, la diferencia aparece como colchón.

# ── el estimado ─────────────────────────────────────────────────────────
cx.execute("""INSERT INTO est_estimados (codigo, nombre, ubicacion, gc, estimador, draft,
              estado, print_set_fecha, presentado_en, catalogo_version_id)
              VALUES (%s,%s,%s,%s,%s,%s,'borrador',%s,%s,%s) RETURNING id""",
           (est["proyecto"].split()[0], est["proyecto"], est["ubicacion"], est["gc"],
            est["estimador"], est["draft"], est["print_set"], est["fecha"], version_id))
estimado_id = cx.fetchone()[0]

item_ids = {}
for it in est["items"]:
    # Las cinco lineas de texto que lee el GC vienen de la hoja Estimate. Se
    # guarda tambien el "Approx. Size" tal como estaba escrito: un estimado
    # portado conserva lo que decia, y los NUEVOS lo generan solos.
    cx.execute("""INSERT INTO est_estimado_items
                    (estimado_id, n, nombre, ref_plano, unidades, orden,
                     descripcion, acabados, herrajes, exclusiones, tamanos,
                     dias_instalacion, dias_instalacion_manual)
                  VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,TRUE) RETURNING id""",
               (estimado_id, it["n"], it["nombre"], it["ref_plano"], it["unidades"], it["n"],
                it.get("descripcion"), it.get("acabados"), it.get("herrajes"),
                it.get("exclusiones"), it.get("tamanos"), it.get("dias_instalacion") or 0))
    item_ids[it["n"]] = cx.fetchone()[0]

for i, c in enumerate(est["componentes"]):
    if c["receta"] not in rec_id:
        continue
    cx.execute("""INSERT INTO est_estimado_componentes
                  (item_id, receta_id, cantidad_unidad, margen_override, orden)
                  VALUES (%s,%s,%s,%s,%s)""",
               (item_ids[c["item"]], rec_id[c["receta"]], c["cantidad_unidad"],
                c["margen_override"], i))
for k, v in p.items():
    cx.execute("INSERT INTO est_estimado_parametros (estimado_id, clave, valor) VALUES (%s,%s,%s)",
               (estimado_id, k, str(v)))

# Las perillas que el Excel NO trae (las que se agregaron despues, como la
# exencion de los Fabrication Documents) se completan desde los defaults: un
# estimado tiene que tener TODAS, o el motor calcula con cero sin avisar.
cx.execute("""
    INSERT INTO est_estimado_parametros (estimado_id, clave, valor)
    SELECT %s, clave, valor FROM est_parametros_default WHERE valor IS NOT NULL
    ON CONFLICT (estimado_id, clave) DO NOTHING
""", (estimado_id,))

# Los DEFAULTS de la casa (migracion 104). El catalogo de perillas viaja en el
# repo; los VALORES no, porque son informacion comercial. Se cargan de aca.
# Sin esto, un estimado creado desde cero cotiza solo el mueble: instalacion,
# embalaje, flete, planos y verificacion dan 0 (el 36% del precio).
sembrados = 0
for k, v in p.items():
    cx.execute("UPDATE est_parametros_default SET valor = %s, actualizado_en = now() "
               "WHERE clave = %s AND %s IS NOT NULL", (str(v), k, str(v)))
    sembrados += cx.rowcount
cn.commit()


# ── verificación ────────────────────────────────────────────────────────
def total_proyecto():
    def num(k):
        cx.execute("SELECT valor FROM est_estimado_parametros WHERE estimado_id=%s AND clave=%s",
                   (estimado_id, k)); return Q(cx.fetchone()[0])

    def txt(k):
        cx.execute("SELECT valor FROM est_estimado_parametros WHERE estimado_id=%s AND clave=%s",
                   (estimado_id, k)); return cx.fetchone()[0]

    cx.execute("""SELECT COALESCE(SUM(precio_unidad_efectivo*cantidad_total),0),
                         COALESCE(SUM(cogs_unidad_efectivo*cantidad_total),0),
                         COALESCE(SUM(horas_total),0)
                  FROM est_estimado_componente_calc WHERE estimado_id=%s""", (estimado_id,))
    suma, cogs, horas = cx.fetchone()
    cx.execute("""SELECT COALESCE(SUM(precio_unidad_efectivo*cantidad_total),0)
                  FROM est_estimado_componente_calc
                  WHERE estimado_id=%s AND grupo='Solid Surface'""", (estimado_id,))
    ss = cx.fetchone()[0]
    cx.execute("""SELECT COALESCE(SUM(r.fees_extra),0) FROM est_recetas r
                   WHERE EXISTS (SELECT 1 FROM est_estimado_componente_calc c
                                  WHERE c.receta_id = r.id AND c.estimado_id = %s
                                    AND c.cantidad_total > 0)""", (estimado_id,))
    fees = cx.fetchone()[0]
    # Base del flete: el costo de MATERIAL (sin mano de obra) de lo estándar.
    # Sale de la vista, así que respeta el modo híbrido de cada receta.
    cx.execute("""SELECT COALESCE(SUM(rc.costo_material * c.cantidad_total),0)
                  FROM est_estimado_componente_calc c
                  JOIN est_receta_costo rc ON rc.id=c.receta_id
                  WHERE c.estimado_id=%s AND rc.material_estandar""", (estimado_id,))
    base = cx.fetchone()[0]
    extra = (fees + num("flete_material_pct") * base) / (1 - num("margen_fees_material"))
    millwork = suma - ss + extra
    d = num("dias_instalacion")
    inst = (d * num("instaladores") * num("tarifa_instalacion") * num("horas_por_dia")
            / (1 - num("margen_labor_inst"))
            + (d * 2 * num("millas_ida") if txt("proyecto_local") == "YES" else Q(0))
            / (1 - num("margen_viaje_inst"))
            + num("punch_list_dias") * num("tarifa_instalacion") * num("horas_por_dia")
            / (1 - num("margen_otros_inst")))
    pack = num("crates") * num("costo_crate") / (1 - num("margen_packaging"))
    ent = num("camion_base") * num("camion_factor") * num("viajes_entrega") / (1 - num("margen_entrega"))
    cx.execute("""SELECT COUNT(DISTINCT item_n) FROM est_estimado_componente_calc
                  WHERE estimado_id=%s AND precio_unidad_efectivo*cantidad_total>0""", (estimado_id,))
    pl = cx.fetchone()[0] * num("costo_plano_taller") / (1 - num("margen_planos"))
    vif = (num("viajes_vif") * num("costo_vif") / (1 - num("margen_vif"))
           if txt("vif_incluido") == "YES" else Q(0))
    return millwork + inst + ss + pack + ent + pl + vif, horas


def money(x):
    return "{:>12,.2f}".format(x).replace(",", "@").replace(".", ",").replace("@", ".")


print("=" * 70)
print("  CARGA EN POSTGRES")
print("=" * 70)
print("  materiales:   %3d  (%d procesos) — %d tenían más de un precio, normalizados"
      % (len(mae["materiales"]), sum(1 for m in mae["materiales"] if m["tipo"] == "proceso"),
         corregidos))
print("  recetas:      %3d del catálogo del proyecto" % len(cat["recetas"]))
cx.execute("SELECT COUNT(*) FROM est_parametros_default WHERE valor IS NOT NULL")
cx.execute("SELECT COUNT(*) FILTER (WHERE valor IS NOT NULL), COUNT(*) FILTER (WHERE requerido AND valor IS NULL) FROM est_parametros_default")
_con, _falta = cx.fetchone()
print("  perillas:     %3d con valor por defecto cargado · %d requeridas SIN valor" % (_con, _falta))
print("  del maestro:  %3d  ->  emparejadas %d (mismo nombre %d / renombradas %d)"
      % (len(mae["recetas"]), len(pares),
         sum(1 for _, _, c in pares if c == "exacto"),
         sum(1 for _, _, c in pares if c != "exacto")))
print("                     ->  sin pareja %d · ambiguas %d"
      % (len(sin_par), len(dudosos)))
for m, c, a, b in dudosos[:6]:
    print("        ? %-34s vs %-34s  %8.2f / %8.2f" % (m["nombre"][:34], c["descripcion"][:34], b, a))
for m, _ in sin_par[:8]:
    print("        – %-50s (maestro $%.2f)" % (m["nombre"][:50], m["total"] or 0))

# El Excel cobra de mas: calcula el flete del 8% con la tarifa de taller ANTERIOR.
# Corregido a la tarifa real, el total esperado es el de los datos (no va en el
# repo, que es publico): clave "_total_referencia" del estimado.json.
ref = Q(str(est.get("_total_referencia") or est["_total_excel"]))
t_dir, h_dir = total_proyecto()
print()
print("  TODO EN 'directo' (el número de siempre)")
print("    total %s   esperado %s   dif %s" % (money(t_dir), money(ref), money(t_dir - ref)))
print("    el Excel dice %s — cobra de más por calcular el flete del 8%% con la tarifa vieja"
      % money(Q(str(est["_total_excel"]))))

if MODO_CALCULADO and pares:
    cx.execute("""UPDATE est_recetas SET fuente_costo='calculado' WHERE id IN (
                    SELECT DISTINCT receta_id FROM est_receta_materiales)""")
    cn.commit()
    cx.execute("SELECT COUNT(*) FROM est_recetas WHERE fuente_costo='calculado'")
    n = cx.fetchone()[0]
    t_cal, h_cal = total_proyecto()
    print()
    print("  CON %d RECETAS EN 'calculado' (costo desde sus materiales)" % n)
    print("    total %s   esperado %s   dif %s" % (money(t_cal), money(ref), money(t_cal - ref)))
    print("    la diferencia es la deriva entre el maestro y la copia del proyecto.")
    cx.execute("""SELECT descripcion, round(costo_directo,2), round(costo_calculado,2),
                         round(colchon,2)
                  FROM est_receta_costo WHERE costo_calculado IS NOT NULL
                    AND abs(colchon) > 0.005 ORDER BY abs(colchon) DESC LIMIT 8""")
    filas = cx.fetchall()
    if filas:
        print("\n    recetas donde el maestro y la copia NO coinciden:")
        for d, cd, cc, co in filas:
            print("      %-44s copia=%8.2f  maestro=%8.2f  %+7.2f" % (d[:44], cd, cc, co))

print("=" * 70)
ok = abs(t_dir - ref) < Q("0.005")
print("  RESULTADO:", "OK — el porteo cierra al centavo" if ok else "NO CIERRA")
print("=" * 70)
cn.close()
sys.exit(0 if ok else 1)
