"""
Extrae el CATALOGO MAESTRO (Pricing.xlsx) a datos limpios: los materiales y la
composicion de cada receta.

    python3 tools/estimados/extraer_maestro.py "/ruta/Pricing.xlsx" ["Labor Upgrade 06-12-25"]

Estructura de la hoja:
    "> M01"  categoria            ("In House - Plastic Laminate")
    ">006"   receta  | unidad | total = SUM de sus lineas
    1,2,3…   linea   | unidad | costo unitario (col D) | cantidad (col E) | parcial (col F)

La linea "Labor" NO es un material: es la tarifa de taller aplicada a las horas de
la receta. Se separa, porque es la que tiene que vivir en est_tarifas y moverse
en un solo lugar.

Ojo con la tarifa: la hoja 'Pricing' trae la tarifa de Labor ANTERIOR y la hoja del
upgrade la vigente. El script lee la tarifa de los datos, no la asume.

Salida: datos/maestro.json  (⚠ con costos reales: datos/ esta en .gitignore)
"""
import openpyxl, warnings, json, os, re, sys, collections
warnings.filterwarnings("ignore")

if len(sys.argv) < 2:
    sys.exit('uso: python3 extraer_maestro.py "/ruta/Pricing.xlsx" [hoja]')
XLSX = sys.argv[1]
HOJA = sys.argv[2] if len(sys.argv) > 2 else "Labor Upgrade 06-12-25"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "datos")
os.makedirs(OUT, exist_ok=True)

ws = openpyxl.load_workbook(XLSX, data_only=True)[HOJA]


def norm(s):
    """Clave para deduplicar materiales escritos de dos formas.
    '1/2" Baltic Birch Plywood 5x5' y '1/2" Baltic Birch Plywood - 5x5' -> misma clave."""
    return re.sub(r'[^a-z0-9]+', ' ', str(s).lower()).strip()


recetas, categoria, cur = [], None, None
for r in range(1, ws.max_row + 1):
    a, b = ws.cell(r, 1).value, ws.cell(r, 2).value
    if isinstance(a, str) and a.strip().startswith("> M"):
        categoria = (b or "").strip()
        continue
    if isinstance(a, str) and re.match(r'^>\s*\d+$', a.strip()):
        cur = {"id": a.strip().replace(" ", ""), "nombre": (b or "").strip(),
               "unidad": ws.cell(r, 3).value, "categoria": categoria,
               "total": ws.cell(r, 6).value, "fila": r,
               "horas": 0.0, "tarifa": None, "lineas": []}
        recetas.append(cur)
        continue
    if cur is not None and isinstance(a, (int, float)) and b:
        desc = str(b).strip()
        costo, cant = ws.cell(r, 4).value, ws.cell(r, 5).value
        if desc.lower() == "labor":                      # no es material: es la tarifa
            cur["horas"] = cant or 0.0
            cur["tarifa"] = costo
            continue
        cur["lineas"].append({"material": desc, "unidad": ws.cell(r, 3).value,
                              "costo": costo, "cantidad": cant,
                              "parcial": ws.cell(r, 6).value})

# ── materiales deduplicados ─────────────────────────────────────────────
mats, conflictos = {}, []
for rec in recetas:
    for l in rec["lineas"]:
        k = norm(l["material"])
        if k not in mats:
            mats[k] = {"descripcion": l["material"], "unidad": l["unidad"],
                       "costo": l["costo"], "alias": set()}
        mats[k]["alias"].add(l["material"])
        if l["costo"] is not None and abs((mats[k]["costo"] or 0) - l["costo"]) > 0.005:
            conflictos.append((l["material"], mats[k]["costo"], l["costo"]))

# "Linear Cutting Cost" y "Miscelanous Materials" no se compran: son procesos.
PROCESOS = {"linear cutting cost", "miscelanous materials", "miscellaneous materials"}
for k, m in mats.items():
    m["tipo"] = "proceso" if k in PROCESOS else "material"
    m["alias"] = sorted(m["alias"])

tarifas = collections.Counter(r["tarifa"] for r in recetas if r["tarifa"])
tarifa = tarifas.most_common(1)[0][0] if tarifas else None

# ── control: el total de cada receta tiene que ser la suma de sus partes ─
desvios = []
for rec in recetas:
    s = sum(l["parcial"] or 0 for l in rec["lineas"]) + rec["horas"] * (rec["tarifa"] or 0)
    if rec["total"] is None or abs(s - rec["total"]) > 0.01:
        desvios.append((rec["id"], rec["nombre"], rec["total"], s))

json.dump({"hoja": HOJA, "tarifa_taller": tarifa,
           "materiales": list(mats.values()), "recetas": recetas},
          open(os.path.join(OUT, "maestro.json"), "w"), indent=1, ensure_ascii=False)

print("hoja:               %s" % HOJA)
print("tarifa de taller:   $%s  (de las líneas 'Labor': %s)"
      % (tarifa, dict(tarifas)))
print("recetas:            %d   (todas con despiece: %s)"
      % (len(recetas), all(r["lineas"] for r in recetas)))
print("líneas por receta:  min %d / max %d / prom %.1f"
      % (min(len(r["lineas"]) for r in recetas), max(len(r["lineas"]) for r in recetas),
         sum(len(r["lineas"]) for r in recetas) / len(recetas)))
print("materiales únicos:  %d   (%d procesos)"
      % (len(mats), sum(1 for m in mats.values() if m["tipo"] == "proceso")))
dups = [m for m in mats.values() if len(m["alias"]) > 1]
print("deduplicados:       %d" % len(dups))
for m in dups:
    print("    %-26s <- %s" % (m["descripcion"][:26], " | ".join(m["alias"])))
print("conflictos de costo: %d %s" % (len(conflictos), conflictos[:3] if conflictos else ""))
print("recetas donde total != suma de partes: %d" % len(desvios))
for d in desvios:
    print("    %-7s %-44s hoja=%8.2f  partes=%8.2f" % (d[0], str(d[1])[:44], d[2] or 0, d[3]))
