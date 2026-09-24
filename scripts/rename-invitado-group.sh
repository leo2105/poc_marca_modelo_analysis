#!/usr/bin/env bash
# Mueve las cuentas del grupo invitado al grupo validador.
set -euo pipefail
AWS_REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-len-shoes-validation}"
POOL="$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
  --output text)"

if ! aws cognito-idp get-group --user-pool-id "$POOL" --group-name validador --region "$AWS_REGION" >/dev/null 2>&1; then
  aws cognito-idp create-group \
    --user-pool-id "$POOL" \
    --group-name validador \
    --description "Valida en su propio espacio" \
    --precedence 3 \
    --region "$AWS_REGION" >/dev/null
  echo "Grupo creado: validador"
fi

if aws cognito-idp get-group --user-pool-id "$POOL" --group-name invitado --region "$AWS_REGION" >/dev/null 2>&1; then
  mapfile -t USERS < <(aws cognito-idp list-users-in-group \
    --user-pool-id "$POOL" \
    --group-name invitado \
    --region "$AWS_REGION" \
    --query "Users[].Username" \
    --output text | tr '\t' '\n')
  for user in "${USERS[@]}"; do
    [[ -z "$user" || "$user" == "None" ]] && continue
    aws cognito-idp admin-add-user-to-group \
      --user-pool-id "$POOL" \
      --username "$user" \
      --group-name validador \
      --region "$AWS_REGION"
    aws cognito-idp admin-remove-user-from-group \
      --user-pool-id "$POOL" \
      --username "$user" \
      --group-name invitado \
      --region "$AWS_REGION"
    echo "Movido a validador: $user"
  done
  aws cognito-idp delete-group --user-pool-id "$POOL" --group-name invitado --region "$AWS_REGION"
  echo "Grupo invitado eliminado."
else
  echo "No había grupo invitado."
fi
