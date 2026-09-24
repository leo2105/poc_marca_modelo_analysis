#!/usr/bin/env bash
# Invite a Cognito user (admin create + temp password email) and assign a group.
# Uso: ./scripts/invite-user.sh user@empresa.com [administrador|mantenedor|validador] [TempPassword1]
# El nivel por defecto es validador. Los grupos los crea el stack de CloudFormation.
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
ROLE="validador"
ROLE_SET=0
TEMP_PASSWORD="ChangeMe-Temp1"

if [[ -z "$EMAIL" ]]; then
  echo "Uso: $0 user@empresa.com [administrador|mantenedor|validador] [TempPassword1]"
  exit 1
fi

shift
for arg in "$@"; do
  case "$arg" in
    administrador|mantenedor|validador) ROLE="$arg"; ROLE_SET=1 ;;
    *) TEMP_PASSWORD="$arg" ;;
  esac
done

STACK_NAME="${STACK_NAME:-len-validation}"
AWS_REGION="${AWS_REGION:-us-east-1}"

USER_POOL_ID="${VITE_COGNITO_USER_POOL_ID:-$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
  --output text)}"

set +e
CREATE_OUT=$(aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$EMAIL" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
  --temporary-password "$TEMP_PASSWORD" \
  --desired-delivery-mediums EMAIL \
  --region "$AWS_REGION" 2>&1)
STATUS=$?
set -e

if [[ $STATUS -ne 0 ]]; then
  if grep -q UsernameExistsException <<<"$CREATE_OUT"; then
    if [[ $ROLE_SET -eq 0 ]]; then
      echo "La cuenta ya existe. Indica el nivel para cambiarlo: administrador, mantenedor o validador."
      exit 0
    fi
    echo "La cuenta ya existe. Se actualiza el nivel a $ROLE."
  else
    echo "$CREATE_OUT"
    exit "$STATUS"
  fi
else
  echo "Usuario creado: $EMAIL (deberá cambiar la contraseña en el primer login)."
fi

ensure_group() {
  local name="$1"
  local precedence="$2"
  local description="$3"
  if aws cognito-idp get-group --user-pool-id "$USER_POOL_ID" --group-name "$name" --region "$AWS_REGION" >/dev/null 2>&1; then
    return 0
  fi
  aws cognito-idp create-group \
    --user-pool-id "$USER_POOL_ID" \
    --group-name "$name" \
    --description "$description" \
    --precedence "$precedence" \
    --region "$AWS_REGION" >/dev/null
  echo "Grupo creado: $name"
}

ensure_group administrador 1 "Publica al dashboard y administra cuentas"
ensure_group mantenedor 2 "Valida en su propio espacio"
ensure_group validador 3 "Valida en su propio espacio"

for group in administrador mantenedor validador invitado; do
  if [[ "$group" == "$ROLE" ]]; then
    continue
  fi
  aws cognito-idp admin-remove-user-from-group \
    --user-pool-id "$USER_POOL_ID" \
    --username "$EMAIL" \
    --group-name "$group" \
    --region "$AWS_REGION" >/dev/null 2>&1 || true
done

aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$USER_POOL_ID" \
  --username "$EMAIL" \
  --group-name "$ROLE" \
  --region "$AWS_REGION"

echo "Nivel asignado: $ROLE. Si la sesión ya estaba abierta, hay que volver a entrar para ver el cambio."
