"""
Recalcula el estimado SOLO desde catalogo.json + estimado.json.
No abre el Excel. Si da el total esperado al centavo, el modelo esta portado bien.

El total esperado no vive en el repo (es publico): sale de la clave
"_total_referencia" del estimado.json, o de la variable CMW_TOTAL_REF.

La regla madre:
    cogs_unidad   = costo_material + horas_unidad * tarifa_taller
    precio_unidad = cogs_unidad / (1 - margen_del_grupo)
"""
import json, os

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "datos")
cat = json.load(open(os.path.join(D, "catalogo.json")))
est = json.load(open(os.path.join(D, "estimado.json")))

TARIFA = cat["tarifa_taller"]
margen_de = {g["nombre"]: g["margen"] for g in cat["grupos"]}
receta_de = {r["descripcion"]: r for r in cat["recetas"]}
p = est["parametros"]
unidades_de = {i["n"]: i["unidades"] for i in est["items"]}


def cogs_unidad(rec):
    tarifa = rec.get("tarifa_override") or TARIFA
    return rec["costo_material"] + rec["horas_unidad"] * tarifa


def precio_unidad(rec, override=None):
    margen = override if override else margen_de.get(rec["grupo"])
    if margen is None:
        return 0.0
    return cogs_unidad(rec) / (1 - margen)


# ── componentes ────────────────────────────────────────────────────────
lineas, usado = [], {}
for c in est["componentes"]:
    rec = receta_de.get(c["receta"])
    if rec is None:                      # fila de encabezado tipo "MILLWORK"
        continue
    unidades = unidades_de[c["item"]]
    qty_total = c["cantidad_unidad"] * unidades
    lineas.append({
        "item":    c["item"],
        "receta":  c["receta"],
        "grupo":   rec["grupo"],
        "qty":     qty_total,
        "cogs":    cogs_unidad(rec) * qty_total,
        "precio":  precio_unidad(rec, c["margen_override"]) * qty_total,
        "horas":   rec["horas_unidad"] * qty_total,
        "_excel":  c["_precio_excel"] or 0.0,
    })
    usado[c["receta"]] = usado.get(c["receta"], 0) + qty_total

suma_items   = sum(l["precio"] for l in lineas)
cogs_items   = sum(l["cogs"]   for l in lineas)
horas_taller = sum(l["horas"]  for l in lineas)

# ── fees y flete de material ───────────────────────────────────────────
# Los fees se cobran por receta USADA, una vez cada una (no la columna entera).
fees = sum(r["fees_extra"] for r in cat["recetas"] if usado.get(r["descripcion"], 0) > 0)
# La base del flete sale de la tarifa REAL de taller (el Excel usa la anterior).
TAR_PPTO = p.get("tarifa_presupuesto_material", TARIFA)
flete_std = p["flete_material_pct"] * sum(
    (r["_cogs_excel"] - r["horas_unidad"] * TAR_PPTO) * usado.get(r["descripcion"], 0)
    for r in cat["recetas"] if r["material_estandar"]
)
extra_cogs   = fees + flete_std
extra_precio = extra_cogs / (1 - p["margen_fees_material"])

# ── los siete renglones ────────────────────────────────────────────────
solid_surface = sum(l["precio"] for l in lineas if l["grupo"] == "Solid Surface")
millwork = suma_items - solid_surface + extra_precio

inst_labor  = p["dias_instalacion"] * p["instaladores"] * p["tarifa_instalacion"] * p["horas_por_dia"]
local       = p["proyecto_local"] == "YES"
inst_viaje  = (p["dias_instalacion"] * 2 * p["millas_ida"]) if local else 0.0
inst_otros  = p["punch_list_dias"] * p["tarifa_instalacion"] * p["horas_por_dia"]
instalacion = (inst_labor / (1 - p["margen_labor_inst"])
               + inst_viaje / (1 - p["margen_viaje_inst"])
               + inst_otros / (1 - p["margen_otros_inst"]))

packaging = p["crates"] * p["costo_crate"] / (1 - p["margen_packaging"])
entrega   = (p["camion_base"] * p["camion_factor"] * p["viajes_entrega"]
             / (1 - p["margen_entrega"]))

items_con_precio = len({l["item"] for l in lineas if l["precio"] > 0})
planos = items_con_precio * p["costo_plano_taller"] / (1 - p["margen_planos"])
vif = (p["viajes_vif"] * p["costo_vif"] / (1 - p["margen_vif"])
       if p["vif_incluido"] == "YES" else 0.0)

renglones = [
    ("1  Millwork Base Bid",        millwork),
    ("2  Millwork & SS Install",    instalacion),
    ("3  Solid Surface Base Bid",   solid_surface),
    ("4  Packaging",                packaging),
    ("5  Delivery",                 entrega),
    ("6  Fabrication Documents",    planos),
    ("7  Field Verification",       vif),
]
total = sum(v for _, v in renglones)

# ── salida ─────────────────────────────────────────────────────────────
def money(x):
    return "{:>12,.2f}".format(x).replace(",", "@").replace(".", ",").replace("@", ".")

print("=" * 62)
print("  %s — recalculado desde datos limpios" % est.get("proyecto", "estimado"))
print("=" * 62)
for n, v in renglones:
    print("  %-28s %s" % (n, money(v)))
print("  " + "-" * 58)
print("  %-28s %s" % ("TOTAL", money(total)))
print()
print("  %-28s %s" % ("Total segun Excel", money(est["_total_excel"])))
dif = total - est["_total_excel"]
print("  %-28s %s" % ("Diferencia", money(dif)))
print("     (el Excel cobra de mas por calcular el flete del 8% con la tarifa vieja)")
print()
cogs_total = (cogs_items + extra_cogs
              + inst_labor + inst_viaje + inst_otros
              + p["crates"] * p["costo_crate"]
              + p["camion_base"] * p["camion_factor"] * p["viajes_entrega"]
              + items_con_precio * p["costo_plano_taller"]
              + p["viajes_vif"] * p["costo_vif"])
print("  %-28s %s" % ("COGS total", money(cogs_total)))
print("  %-28s %11.2f %%" % ("Margen", 100 * (1 - cogs_total / total)))
print("  %-28s %11.2f hr" % ("Horas de taller", horas_taller))
print("  %-28s %s" % ("Presupuesto de taller", money(horas_taller * TARIFA)))
print("  %-28s %s" % ("  (el Excel dice)", money(horas_taller * TAR_PPTO)))
print()

malos = [l for l in lineas if abs(l["precio"] - l["_excel"]) > 0.005]

print("  Componentes verificados uno por uno: %d" % len(lineas))
print("  Que NO coinciden con el Excel:       %d" % len(malos))
for l in malos[:10]:
    print("     item %d  %-44s  calc=%10.2f  excel=%10.2f"
          % (l["item"], l["receta"][:44], l["precio"], l["_excel"]))
print("=" * 62)
# El total de referencia: el del Excel con el flete corregido a la tarifa real.
REF = est.get("_total_referencia") or os.environ.get("CMW_TOTAL_REF")
if REF is None:
    print("  RESULTADO: total %s (sin referencia para comparar:" % money(total).strip(),
          'pone "_total_referencia" en estimado.json o CMW_TOTAL_REF)')
else:
    print("  RESULTADO:", "OK — %s, los componentes coinciden" % money(total).strip()
          if abs(total - float(REF)) < 0.005 and not malos else "NO CIERRA — revisar")
print("=" * 62)
