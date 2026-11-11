# Porteo del motor de costeo de Estimados

Herramientas para extraer el modelo de costeo que hoy vive en el Excel de estimados
y verificar que la implementación de la app da exactamente el mismo número.

## ⚠️ Este repo es PÚBLICO

**Ningún costo, margen o tarifa real puede commitearse acá.** El catálogo expone la
estructura de costos y los márgenes de Central Millwork.

Los scripts escriben siempre a `tools/estimados/datos/`, que está en `.gitignore`.
Si alguna vez ves un `catalogo.json` como "untracked" fuera de esa carpeta, **no lo agregues**.

## Qué hace cada cosa

| Script | Qué hace |
|---|---|
| `extraer.py` | Lee el `.xlsx` del estimado y escribe `datos/catalogo.json` (grupos + recetas) y `datos/estimado_<nro>.json` (ítems, componentes, parámetros) |
| `calcular.py` | Recalcula el estimado **solo desde los JSON**, sin abrir el Excel. Es la prueba de fidelidad. |

## Cómo correrlo

```bash
python3 tools/estimados/extraer.py "/ruta/al/estimado.xlsx"
python3 tools/estimados/calcular.py
```

Necesita `openpyxl` (`pip3 install --user openpyxl`).

## La prueba de fidelidad

El proyecto de referencia tiene que dar el total esperado **al centavo** y sus componentes
tienen que coincidir uno por uno. Si `calcular.py` dice `OK — cierra al centavo`, el modelo
está bien portado.

El total esperado NO vive acá: el repo es público. Va en la clave `_total_referencia` del
`datos/estimado.json` (que está en `.gitignore`), o en la variable `CMW_TOTAL_REF`.

Ese mismo número es la prueba de regresión del motor en TypeScript: cualquier cambio futuro
tiene que seguir dando lo mismo (ver `ESTIMADOS_TEST_TOTAL` en `backend/tests/costeo.db.test.ts`).

## La regla madre

Todo el Excel —45.726 fórmulas— se reduce a esto:

```
cogs_unidad   = costo_material + horas_unidad × tarifa_taller
precio_unidad = cogs_unidad / (1 − margen_del_grupo)
```

En el modo híbrido, `costo_material` viene de uno de dos lados según `fuente_costo`:

- `directo`   → el número cargado a mano (lo que hace el Excel hoy; lleva el colchón adentro)
- `calculado` → la suma de `est_receta_materiales`, que se mueve sola con el precio de cada material
