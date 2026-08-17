# Consola de validación LEN · Marca / Modelo

Dashboard en React + TypeScript para revisar predicciones de marca y modelo de zapatillas de carrera, aprobar, corregir, descartar, y exportar el resultado al contrato `validation.json`.

## Vistas

1. **Panel de corrida** — progreso, KPIs y avance por marca
2. **Validación · mosaico** — filtros, selección múltiple y acciones por lote
3. **Validación · detalle** — revisión individual con atajos de teclado (`A`, `R`, `D`, flechas)
4. **Publicación** — gate antes de liberar al cliente

## Ejecución local (WSL / Ubuntu)

Requiere Node.js 20 o superior.

```bash
npm install
npm run dev
```

Con Conda:

```bash
conda activate len_shoes
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

Copia `.env.example` → `.env` y deja `VITE_COGNITO_ENABLED=false` para trabajar sin login.

## Datos y contrato

- Catálogo de marcas/modelos: `marcas-modelos-lista.json`
- Registros demo: `src/data/demoData.ts` (1943 recortes · Carrera Homenaje Fiestas Patrias)
- Esquema de exportación: `validation.schema.json`
- Ejemplo de salida: `validation.example.json`

Las revisiones se persisten en `localStorage` y pueden exportarse como JSON desde la consola (**Exportar JSON**).

## Imágenes y sprites

Los recortes viven en `public/imgs/sprites/<experimento>/` (gitignored). La anotación del motor viene del CSV en `public/imgs/serpapi_results/<experimento>.csv` (`person_id`, `marca`, `modelo`, `score`).

| # imgs | Tamaño sprite | Posiciones |
|--------|---------------|------------|
| 1 | 256 × cell_h | una celda |
| 2 | 256 × (cell_h×2) | arriba / abajo |
| 3 | 512 × (cell_h×2) | arriba-izq, arriba-der, abajo-izq |
| 4 | 512 × (cell_h×2) | grid 2×2 |

- Experimento activo: `carrera_homenaje_fiestas_patria_sam3_yoloworld-onnx_pose-onnx_clip-vit-l14_384`
- Manifiesto: `python scripts/gen_sprite_manifest.py` → `spriteManifest.ts` + `spriteAnnotations.ts`
- En **mosaico**, la miniatura muestra solo la **primera perspectiva** activa (lazy al entrar en viewport). En **detalle**, los puntitos reflejan las celdas activas.

## Deploy privado en AWS (WSL)

Stack: **S3 (app + imgs) + CloudFront + Cognito + Lambda@Edge**.

Guía completa: [`infra/DEPLOY.md`](infra/DEPLOY.md)

```bash
cp .env.example .env          # editar COGNITO_DOMAIN_PREFIX
chmod +x scripts/*.sh
npm run deploy
npm run invite:user -- companero@empresa.com
```

Sync solo de imágenes tras cambiar sprites:

```bash
npm run sync:imgs
```

Actualizar solo la app (sin recrear infra ni Lambda@Edge):

```bash
npm run deploy:app
```
