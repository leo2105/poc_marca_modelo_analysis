#!/usr/bin/env bash
# Sync local public/imgs → S3 imgs bucket (keys under imgs/)
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

IMGS_BUCKET="${IMGS_BUCKET:-$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ImgsBucketName'].OutputValue" \
  --output text)}"

if [[ -z "$IMGS_BUCKET" || "$IMGS_BUCKET" == "None" ]]; then
  echo "No se pudo resolver ImgsBucketName. Define IMGS_BUCKET o STACK_NAME."
  exit 1
fi

SRC="$ROOT/public/imgs"
if [[ ! -d "$SRC" ]]; then
  echo "No existe $SRC — coloca sprites/CSV ahí antes de sincronizar."
  exit 1
fi

echo "→ Sync $SRC → s3://$IMGS_BUCKET/imgs/"
# No borrar imgs/races/* si no están en local (pueden copiarse desde el bucket del dashboard).
aws s3 sync "$SRC" "s3://$IMGS_BUCKET/imgs/" --delete --region "$AWS_REGION" \
  --exclude "races/*" --exclude "races/**"
if [[ -d "$SRC/races" ]]; then
  echo "→ Sync races"
  aws s3 sync "$SRC/races" "s3://$IMGS_BUCKET/imgs/races/" --region "$AWS_REGION"
fi
echo "Listo."
