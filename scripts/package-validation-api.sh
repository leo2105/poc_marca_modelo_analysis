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
WORKDIR="$ROOT/infra/validation-api/dist"
ZIP="$ROOT/infra/validation-api/validation-api.zip"

rm -rf "$WORKDIR" "$ZIP"
mkdir -p "$WORKDIR"
cp "$ROOT/infra/validation-api/index.mjs" "$WORKDIR/index.mjs"

(
  cd "$WORKDIR"
  if command -v zip >/dev/null; then
    zip -q "$ZIP" index.mjs
  else
    python3 - <<'PY'
import zipfile
with zipfile.ZipFile("../validation-api.zip", "w", zipfile.ZIP_DEFLATED) as zf:
    zf.write("index.mjs")
PY
  fi
)

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
