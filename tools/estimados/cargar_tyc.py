"""
Carga los Terminos y Condiciones a `est_tyc_versiones`, leyendolos de una
propuesta ya emitida (la pagina que dice "Terms and Conditions Version ...").

    python3 tools/estimados/cargar_tyc.py "<propuesta>.pdf" "dbname=cm_est"

Por que de un PDF y no de una migracion: el repo es PUBLICO y los T&C son el
documento legal de la empresa. La migracion 105 crea la tabla vacia; el texto
entra por aca, desde un archivo que no esta en el repo.

La version importa: la hoja dice "Version 04/11/2025" y hay que poder probar
cual acepto cada GC. `est_estimados.tyc_version` la clava al enviar.

Necesita pdftotext (brew install poppler).
"""
import re, subprocess, sys

if len(sys.argv) < 2:
    sys.exit('uso: python3 cargar_tyc.py "<propuesta>.pdf" ["dbname=..."]')
PDF = sys.argv[1]
DSN = sys.argv[2] if len(sys.argv) > 2 else "dbname=cm_est"

try:
    texto = subprocess.run(["pdftotext", "-layout", PDF, "-"],
                           capture_output=True, text=True, check=True).stdout
except FileNotFoundError:
    try:
        texto = subprocess.run(["/opt/homebrew/bin/pdftotext", "-layout", PDF, "-"],
                               capture_output=True, text=True, check=True).stdout
    except FileNotFoundError:
        sys.exit("falta pdftotext: brew install poppler")

# Los terminos de pago del encabezado: la lista numerada del bloque TERMS.
# Son siempre los mismos, asi que viajan con la version de los T&C.
cabecera = texto.split("Presented on:")[0]
puntos, actual = [], ""
for linea in cabecera.splitlines():
    cols = re.split(r"\s{2,}", linea.strip())
    if not cols:
        continue
    ultima = cols[-1].strip()
    if re.match(r"^\d+\.\s", ultima):
        if actual: puntos.append(actual)
        actual = ultima
    elif actual and ultima and not ultima.endswith(":"):
        actual = f"{actual} {ultima}"
if actual: puntos.append(actual)
terminos_pago = "\n".join(re.sub(r"\s+", " ", p).strip() for p in puntos) or None

m = re.search(r"Terms and Conditions\s+Version\s+([\d/]+)", texto)
if not m:
    sys.exit("no encontre la linea 'Terms and Conditions Version ...' en ese PDF")
version = m.group(1)

# Del encabezado de los T&C hasta el pie con la direccion.
cuerpo = texto[m.end():]
corte = re.search(r"\n\s*\d+\s+[A-Z][\w.]*\s+(Ln|St|Ave|Blvd|Rd)\.", cuerpo)
if corte:
    cuerpo = cuerpo[:corte.start()]
cuerpo = re.sub(r"\n\s*Page \d+ of \d+\s*\n", "\n", cuerpo)
# Reunir los renglones partidos por el ancho de la hoja: un parrafo nuevo
# arranca con "Titulo:" o con una linea en blanco.
lineas = [l.strip() for l in cuerpo.splitlines()]
parrafos, actual = [], ""
for l in lineas:
    if not l:
        if actual: parrafos.append(actual); actual = ""
        continue
    if re.match(r"^[A-Z][A-Za-z ,/()&-]{2,60}:", l) and actual:
        parrafos.append(actual); actual = l
    else:
        actual = f"{actual} {l}".strip()
if actual: parrafos.append(actual)
contenido = "\n\n".join(p for p in parrafos if len(p) > 40)

if len(contenido) < 500:
    sys.exit(f"el texto extraido parece incompleto ({len(contenido)} caracteres)")

try:
    import psycopg2
except ImportError:
    sys.exit("falta psycopg2: pip3 install --user psycopg2-binary")

cn = psycopg2.connect(DSN); cx = cn.cursor()
# Una sola version vigente a la vez (hay un indice unico que lo exige).
cx.execute("UPDATE est_tyc_versiones SET vigente = FALSE WHERE vigente AND version <> %s",
           (version,))
cx.execute("""
    INSERT INTO est_tyc_versiones (version, vigente_desde, contenido, terminos_pago, vigente)
    VALUES (%s, to_date(%s, 'MM/DD/YYYY'), %s, %s, TRUE)
    ON CONFLICT (version) DO UPDATE
      SET contenido = EXCLUDED.contenido,
          terminos_pago = COALESCE(EXCLUDED.terminos_pago, est_tyc_versiones.terminos_pago),
          vigente = TRUE
""", (version, version, contenido, terminos_pago))
cn.commit()

print("version:    %s" % version)
print("parrafos:   %d" % len(parrafos))
print("caracteres: %d" % len(contenido))
print("primer parrafo: %s…" % contenido[:110].replace("\n", " "))
print("terminos de pago: %s" % (("\n                  ".join(terminos_pago.splitlines()))
                                if terminos_pago else "NO ENCONTRADOS"))
cn.close()
