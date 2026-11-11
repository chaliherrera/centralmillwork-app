"""
Extrae el modelo de costeo del Excel de un estimado a datos limpios.
Salida: catalogo.json (biblioteca) + estimado.json (el proyecto).
Nada de esto lee formulas de Excel: se queda solo con DATOS.
"""
import openpyxl, warnings, json, os, sys
warnings.filterwarnings("ignore")

if len(sys.argv) < 2:
    sys.exit("uso: python3 extraer.py '/ruta/al/estimado.xlsx'")
XLSX = sys.argv[1]
# Los datos de costo NUNCA van al repo (es publico). datos/ esta en .gitignore.
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "datos")
os.makedirs(OUT, exist_ok=True)

V = openpyxl.load_workbook(XLSX, data_only=True)

# La tarifa de taller, la regla de instalacion y los datos del proyecto NO van en
# el repo (es publico): salen de datos/proyecto.json, que esta en .gitignore.
# Formato:
#   {"tarifa_taller": 0.0, "dolares_por_dia_instalacion": 0.0,
#    "proyecto": "", "ubicacion": "",
#    "gc": "", "estimador": "", "draft": 1,
#    "fecha": "AAAA-MM-DD", "print_set": "AAAA-MM-DD"}
#
# dolares_por_dia_instalacion es la regla de la casa: cuanto producto se instala
# en un dia. El Excel no la tiene como celda —los dias estan tipeados por item—
# pero el motor la usa para PROPONER los dias, asi que viaja como parametro.
#
# Ojo con la tarifa: el workbook del proyecto todavia separa material/labor a la
# tarifa ANTERIOR al ultimo upgrade, asi que su "Material Budget" queda inflado y
# su "Labor Budget" corto. El costo total y el precio al cliente NO se ven
# afectados: salen del COGS, no del reparto. Por eso aca mandamos la tarifa real.
META_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "datos", "proyecto.json")
if not os.path.exists(META_PATH):
    sys.exit("falta %s — crealo con la tarifa y los datos del proyecto (ver el comentario de arriba)" % META_PATH)
META = json.load(open(META_PATH))
TARIFA_TALLER = float(META["tarifa_taller"])
if "dolares_por_dia_instalacion" not in META:
    sys.exit("falta 'dolares_por_dia_instalacion' en %s (la regla de la casa: "
             "cuanto producto se instala en un dia)" % META_PATH)
DOLARES_POR_DIA_INSTALACION = float(META["dolares_por_dia_instalacion"])

# ── 1. GRUPOS (margen por grupo) ────────────────────────────────────────
pm = V["Price Model"]
grupos = []
for r in range(2, 17):
    nom = pm.cell(r, 2).value
    if nom:
        grupos.append({"nombre": nom, "margen": pm.cell(r, 3).value})

# ── 2. RECETAS (el catalogo: 359 lineas) ────────────────────────────────
# Guardamos material y horas POR SEPARADO (decision B de Chali):
#   costo_material lleva el colchon adentro, como hoy.
#   costo_material_real queda NULL hasta que las recepciones lo llenen.
mp = V["Materials Pricing Jun-25 Rev28"]
recetas = []
for r in range(9, mp.max_row + 1):
    desc = mp.cell(r, 2).value
    if not desc:
        continue
    cogs  = mp.cell(r, 5).value or 0.0
    horas = mp.cell(r, 13).value or 0.0
    recetas.append({
        "descripcion":          desc,
        "grupo":                mp.cell(r, 1).value,
        "unidad":               mp.cell(r, 3).value,
        "horas_unidad":         horas,
        "costo_material":       max(0.0, cogs - horas * TARIFA_TALLER),  # <- con colchon
        # Si el material daria negativo, la receta no se costea a la tarifa
        # estandar: es mano de obra a otra tarifa. Se guarda la implicita.
        "tarifa_override":      (round(cogs / horas, 6)
                                 if horas and cogs - horas * TARIFA_TALLER < -0.005 else None),
        "costo_material_real":  None,                            # <- a llenar
        "colchon_origen":       None,
        "material_estandar":    str(mp.cell(r, 17).value).strip().upper() == "YES",
        "fees_extra":           mp.cell(r, 6).value or 0.0,      # ship/handling/tax
        "comentario":           mp.cell(r, 4).value,
        "_cogs_excel":          cogs,                            # solo para verificar
    })

# Las cinco lineas de texto que van en la propuesta viven en la hoja Estimate,
# en las filas que siguen al titulo de cada item:
#   +1 Description  +2 Approx. Size  +3 Finishes  +4 Hardware  +5 Exclusions
# Son el texto que lee el GC y nunca se habian portado.
es_ = V["Estimate"]
narrativa = {}
for r in range(25, 719):
    n = es_.cell(r, 2).value              # columna B = numero de item
    if not isinstance(n, int):
        continue
    def linea(off):
        v = es_.cell(r + off, 3).value    # columna C
        return str(v).strip() if v else None
    dias = es_.cell(r, 12).value      # columna L = dias de instalacion del item
    excl = linea(5)
    narrativa[n] = {
        "descripcion": linea(1),
        "tamanos":     linea(2),          # lo que hoy se tipea a mano
        "acabados":    linea(3),
        "herrajes":    linea(4),
        # el texto ya viene con "Exclusions: " adelante; el rotulo lo pone el PDF
        "exclusiones": excl[len("Exclusions:"):].strip()
                       if excl and excl.lower().startswith("exclusions:") else excl,
        # Se tipean a mano en el Excel, asi que entran como decision del estimador.
        "dias_instalacion": dias if isinstance(dias, (int, float)) else 0,
    }

# ── 3. ITEMS del proyecto (Item Matrix) ─────────────────────────────────
im = V["Item Matrix"]
items = []
for r in range(2, 102):
    nom = im.cell(r, 2).value
    unidades = im.cell(r, 5).value or 0
    if not nom:
        continue
    n = im.cell(r, 1).value
    items.append({
        "n":          n,
        "nombre":     nom,
        "ref_plano":  im.cell(r, 3).value,
        "unidades":   round(unidades),
        **narrativa.get(n, {}),
    })

# ── 4. COMPONENTES (receta + cantidad) ──────────────────────────────────
# Price Model: bloque de 28 filas por item, 25 slots de componente.
componentes = []
for it in items:
    r0 = 20 + (it["n"] - 1) * 28 + 1
    for r in range(r0, r0 + 25):
        desc = pm.cell(r, 4).value
        qty  = pm.cell(r, 5).value
        if not desc or not qty:
            continue
        componentes.append({
            "item":             it["n"],
            "receta":           desc,
            "cantidad_unidad":  qty,                       # por unidad de item
            "margen_override":  pm.cell(r, 11).value,      # columna K
            "_precio_excel":    pm.cell(r, 14).value,      # solo para verificar
        })

# ── 5. PARAMETROS del proyecto (CALCULATORS) ────────────────────────────
ca = V["CALCULATORS"]
es = V["Estimate"]
dias_instalacion = sum(v for r in range(25, 719)
                       for v in [es.cell(r, 12).value]
                       if isinstance(v, (int, float)))

parametros = {
    # La regla de la casa con la que el motor PROPONE los dias por item. No es
    # una celda del Excel: ahi los dias estan tipeados a mano, uno por uno.
    "dolares_por_dia_instalacion": DOLARES_POR_DIA_INSTALACION,
    "instalacion_incluida":   ca["C2"].value,
    "proyecto_local":         ca["C3"].value,
    "viajes_instalacion":     ca["C4"].value,
    "instaladores":           ca["C5"].value,
    "horas_por_dia":          ca["C6"].value,
    "millas_ida":             ca["C7"].value,
    "dias_instalacion":       dias_instalacion,
    "tarifa_instalacion":     ca["C11"].value,
    "punch_list_dias":        ca["D21"].value,
    "margen_labor_inst":      ca["D24"].value,
    "margen_viaje_inst":      ca["D25"].value,
    "margen_otros_inst":      ca["D26"].value,
    "costo_crate":            ca["G2"].value,
    "crates":                 ca["G3"].value,
    "margen_packaging":       ca["G5"].value,
    "camion_base":            450.0,
    "camion_factor":          0.7,
    "viajes_entrega":         ca["G10"].value,
    "margen_entrega":         ca["G12"].value,
    "costo_plano_taller":     ca["G30"].value,
    "margen_planos":          ca["G31"].value,
    "vif_incluido":           ca["G21"].value,
    "viajes_vif":             ca["G22"].value,
    "costo_vif":              ca["G23"].value,
    "margen_vif":             ca["G25"].value,
    "flete_material_pct":     ca["G36"].value,
    "margen_fees_material":   pm["C17"].value,
    "incluir_sales_tax":      ca["G16"].value,
    "tasa_sales_tax":         ca["G17"].value,
    "resale_certificate":     True,
    "tarifa_taller":          TARIFA_TALLER,
    # CORREGIDO (2026-10-01): la base del flete del 8% usa la tarifa REAL. El
    # Excel la arma con COGS - horas x la tarifa ANTERIOR al upgrade, y como el
    # flete va al precio al cliente, eso cobraba de mas. Ahora sale de
    # tarifa_taller, un solo lugar.
    "tarifa_presupuesto_material": TARIFA_TALLER,
}

catalogo = {"tarifa_taller": TARIFA_TALLER, "grupos": grupos, "recetas": recetas}
estimado = {
    "proyecto":   META["proyecto"],
    "ubicacion":  META.get("ubicacion", ""),
    "gc":         META.get("gc", ""),
    "estimador":  META.get("estimador", ""),
    "draft":      META.get("draft", 1),
    "fecha":      META.get("fecha", ""),
    "print_set":  META.get("print_set", ""),
    "items":      items,
    "componentes": componentes,
    "parametros": parametros,
    "_total_excel": es["F21"].value,
}

json.dump(catalogo, open(os.path.join(OUT, "catalogo.json"), "w"), indent=1, ensure_ascii=False)
json.dump(estimado, open(os.path.join(OUT, "estimado.json"), "w"), indent=1, ensure_ascii=False)

print("grupos:       %d" % len(grupos))
print("recetas:      %d" % len(recetas))
print("items:        %d  (con unidades > 0: %d)" % (len(items), sum(1 for i in items if i["unidades"])))
print("componentes:  %d" % len(componentes))
ovr = [r for r in recetas if r["tarifa_override"]]
print("tarifa:       $%.2f/hr  (recetas con tarifa propia: %d)" % (TARIFA_TALLER, len(ovr)))
for r in ovr:
    print("                %-44s cogs=%7.2f hr=%6.4f -> $%.2f/hr"
          % (r["descripcion"][:44], r["_cogs_excel"], r["horas_unidad"], r["tarifa_override"]))
print("dias inst.:   %s" % dias_instalacion)
print("total Excel:  %.2f" % estimado["_total_excel"])
