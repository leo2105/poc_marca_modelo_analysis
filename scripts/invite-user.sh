#!/usr/bin/env bash
# Invite a Cognito user (admin create + temp password email)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/scripts/fix-crlf.pl" ]] && command -v perl >/dev/null; then
  perl "$ROOT/scripts/fix-crlf.pl" >/dev/null 2>&1 || true
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(sed 's/\r$//' .env)
  set +a
fi

EMAIL="${1:-}"
TEMP_PASSWORD="${2:-ChangeMe-Temp1}"
STACK_NAME="${STACK_NAME:-len-validation}"
AWS_REGION="${AWS_REGION:-us-east-1}"

if [[ -z "$EMAIL" ]]; then
  echo "Uso: $0 user@empresa.com [TempPassword1]"
  exit 1
fi

USER_POOL_ID="${VITE_COGNITO_USER_POOL_ID:-$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
  --output text)}"

aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$EMAIL" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
  --temporary-password "$TEMP_PASSWORD" \
  --desired-delivery-mediums EMAIL \
  --region "$AWS_REGION"

echo "Usuario creado: $EMAIL (deberá cambiar la contraseña en el primer login)."
