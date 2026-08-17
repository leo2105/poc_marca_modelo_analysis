import csv
from pathlib import Path

root = Path(__file__).resolve().parents[1]
folder = 'carrera_homenaje_fiestas_patria_sam3_yoloworld-onnx_pose-onnx_clip-vit-l14_384'
sprite_dir = root / 'public' / 'imgs' / 'sprites' / folder
csv_path = root / 'public' / 'imgs' / 'serpapi_results' / f'{folder}.csv'

files = sorted(p.name for p in sprite_dir.glob('person_*.jpg'))

annotations: list[dict[str, object]] = []
if csv_path.exists():
    with csv_path.open(encoding='utf-8', newline='') as handle:
        for row in csv.DictReader(handle):
            annotations.append(
                {
                    'personId': row['person_id'].strip(),
                    'brand': row['marca'].strip(),
                    'model': row['modelo'].strip(),
                    'score': float(row['score']),
                }
            )

sprite_out = root / 'src' / 'data' / 'spriteManifest.ts'
sprite_out.write_text(
    f"export const RACE_SPRITE_FOLDER = {folder!r}\n"
    f"export const SPRITE_FILES = {files!r} as const\n"
    "export function spriteUrl(filename: string) {\n"
    "  return `/imgs/sprites/${RACE_SPRITE_FOLDER}/${filename}`\n"
    "}\n"
    f"export const DEMO_SPRITE_COUNT = {len(files)}\n",
    encoding='utf-8',
)

annotation_lines = [
    "export interface SpriteAnnotation {",
    "  brand: string",
    "  model: string",
    "  score: number",
    "}",
    "",
    "export const SPRITE_ANNOTATIONS: Record<string, SpriteAnnotation> = {",
]
for item in annotations:
    annotation_lines.append(
        f"  {item['personId']!r}: {{ brand: {item['brand']!r}, model: {item['model']!r}, score: {item['score']} }},"
    )
annotation_lines.append("}")
annotation_lines.append("")

annotation_out = root / 'src' / 'data' / 'spriteAnnotations.ts'
annotation_out.write_text("\n".join(annotation_lines), encoding='utf-8')

print(f'wrote {len(files)} sprites to {sprite_out}')
print(f'wrote {len(annotations)} annotations to {annotation_out}')
