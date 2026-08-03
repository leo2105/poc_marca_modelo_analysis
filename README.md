# Consola de validación LEN · Marca / Modelo

Dashboard en React + TypeScript para revisar predicciones de marca y modelo de zapatillas de carrera, aprobar, corregir, rechazar o descartar, y exportar el resultado al contrato `validation.json`.

## Vistas

1. **Panel de corrida** — progreso, KPIs y avance por marca
2. **Validación · mosaico** — filtros, selección múltiple y acciones por lote
3. **Validación · detalle** — revisión individual con atajos de teclado (`A`, `R`, `D`, flechas)
4. **Publicación** — gate antes de liberar al cliente

## Ejecución

Requiere Node.js 20 o superior.

```bash
npm install
npm run dev
```

En WSL con Conda:

```bash
conda activate len_shoes
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

## Datos y contrato

- Catálogo de marcas/modelos: `marcas-modelos-lista.json`
- Registros demo: `src/data/demoData.ts` (191 recortes de la corrida Malecon Test)
- Esquema de exportación: `validation.schema.json`
- Ejemplo de salida: `validation.example.json`

Las revisiones se persisten en `localStorage` y pueden exportarse como JSON desde la consola (**Exportar JSON**).

## Imágenes y sprites

Los recortes reales viven en `public/imgs/sprites/<nombre_carrera>/`. Cada archivo es un **sprite** con hasta 4 vistas de la misma zapatilla en un layout 2×2 (celdas de 256 px). Puede haber 1, 2, 3 o 4 celdas con contenido; las vacías se detectan en el cliente y no cuentan como perspectiva.

La anotación inicial del motor (marca, modelo, score) viene del CSV homónimo en la misma carpeta, p. ej. `Malecon_Test_42k_07.26_….csv` con columnas `person_id`, `marca`, `modelo`, `score`.

| # imgs | Tamaño sprite | Posiciones |
|--------|---------------|------------|
| 1 | 256 × cell_h | una celda |
| 2 | 256 × (cell_h×2) | arriba / abajo |
| 3 | 512 × (cell_h×2) | arriba-izq, arriba-der, abajo-izq |
| 4 | 512 × (cell_h×2) | grid 2×2 |

- Manifiesto: `python scripts/gen_sprite_manifest.py` → `spriteManifest.ts` + `spriteAnnotations.ts`
- Demo: los 191 sprites de `Malecon_Test_42k_07.26_…` con anotaciones del CSV
- En desarrollo y build, Vite sirve `/imgs/…` desde `public/imgs/` (copiado a `dist/imgs/` al hacer build)

En **validación · detalle**, los puntitos bajo la imagen reflejan solo las celdas activas (no las blancas). En **mosaico**, se muestra la primera perspectiva válida de cada sprite y el score junto a la marca.
