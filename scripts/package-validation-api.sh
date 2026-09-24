#!/usr/bin/env bash
# Empaqueta y sube el código de la Lambda validation-api
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(sed 's/\r$//' .env)
  set +a
fi

STACK_NAME="${STACK_NAME:-len-validation}"
AWS_REGION="${AWS_REGION:-us-east-1}"
FN_NAME="${STACK_NAME}-validation-api"
SRC="$ROOT/infra/validation-api"
WORKDIR="$SRC/dist"
ZIP="$SRC/validation-api.zip"

rm -rf "$WORKDIR" "$ZIP"
mkdir -p "$WORKDIR"
cp "$SRC/index.mjs" "$SRC/package.json" "$WORKDIR/"

echo "→ npm install (validation-api)"
npm install --omit=dev --prefix "$WORKDIR"

python3 - <<PY
import os
import zipfile
root = r"$WORKDIR"
zip_path = r"$ZIP"
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirnames, filenames in os.walk(root):
        for filename in filenames:
            full = os.path.join(dirpath, filename)
            arc = os.path.relpath(full, root).replace(os.sep, "/")
            if arc.startswith("node_modules/.bin/"):
                continue
            zf.write(full, arc)
print(f"zip {os.path.getsize(zip_path)} bytes")
PY

rm -rf "$WORKDIR"

if ! aws lambda get-function --function-name "$FN_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "⚠ Lambda $FN_NAME no existe — créala con CloudFormation (npm run deploy)"
  exit 0
fi

echo "→ Update Lambda $FN_NAME"
aws lambda update-function-code \
  --function-name "$FN_NAME" \
  --zip-file "fileb://$ZIP" \
  --region "$AWS_REGION" >/dev/null
aws lambda wait function-updated --function-name "$FN_NAME" --region "$AWS_REGION"
echo "Lambda validation-api actualizada."
