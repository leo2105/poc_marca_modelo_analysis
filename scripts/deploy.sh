#!/usr/bin/env bash
# Full deploy: CloudFormation (if needed) → build → sync app+imgs → Cognito callbacks → optional Lambda@Edge
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

STACK_NAME="${STACK_NAME:-len-validation}"
PROJECT_NAME="${PROJECT_NAME:-len-validation}"
AWS_REGION="${AWS_REGION:-us-east-1}"
COGNITO_DOMAIN_PREFIX="${COGNITO_DOMAIN_PREFIX:-}"
DASHBOARD_STACK="${DASHBOARD_STACK:-len-shoes-dashboard}"
DASHBOARD_JWT_AUDIENCE="${DASHBOARD_JWT_AUDIENCE:-}"
DASHBOARD_ORIGIN="${DASHBOARD_ORIGIN:-}"
SKIP_INFRA="${SKIP_INFRA:-false}"
ATTACH_EDGE="${ATTACH_EDGE:-true}"
SKIP_IMGS="${SKIP_IMGS:-false}"

need() { command -v "$1" >/dev/null || { echo "Falta $1"; exit 1; }; }
need aws
need npm
need node

cf_out() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text
}

cf_out_stack() {
  aws cloudformation describe-stacks \
    --stack-name "$1" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" \
    --output text 2>/dev/null || true
}

resolve_dashboard_access() {
  if [[ -z "$DASHBOARD_JWT_AUDIENCE" || "$DASHBOARD_JWT_AUDIENCE" == "None" ]]; then
    DASHBOARD_JWT_AUDIENCE="$(cf_out_stack "$DASHBOARD_STACK" UserPoolClientId)"
  fi
  if [[ -z "$DASHBOARD_ORIGIN" || "$DASHBOARD_ORIGIN" == "None" ]]; then
    DASHBOARD_ORIGIN="$(cf_out_stack "$DASHBOARD_STACK" CloudFrontUrl)"
  fi
  if [[ "$DASHBOARD_JWT_AUDIENCE" == "None" ]]; then DASHBOARD_JWT_AUDIENCE=""; fi
  if [[ "$DASHBOARD_ORIGIN" == "None" ]]; then DASHBOARD_ORIGIN=""; fi
}

stack_status() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND"
}

wait_for_stack_ready() {
  local status
  status="$(stack_status)"
  case "$status" in
    CREATE_IN_PROGRESS)
      echo "→ Stack en creación; esperando CREATE_COMPLETE (CloudFront puede tardar 5–15 min)..."
      aws cloudformation wait stack-create-complete \
        --stack-name "$STACK_NAME" --region "$AWS_REGION"
      ;;
    UPDATE_IN_PROGRESS)
      echo "→ Stack en actualización; esperando UPDATE_COMPLETE..."
      aws cloudformation wait stack-update-complete \
        --stack-name "$STACK_NAME" --region "$AWS_REGION"
      ;;
    UPDATE_ROLLBACK_IN_PROGRESS)
      echo "→ Stack revirtiendo actualización; esperando..."
      aws cloudformation wait stack-rollback-complete \
        --stack-name "$STACK_NAME" --region "$AWS_REGION"
      ;;
    DELETE_IN_PROGRESS)
      echo "Stack en borrado; espera a que termine o usa otro STACK_NAME."
      exit 1
      ;;
  esac
}

if [[ "$SKIP_INFRA" != "true" ]]; then
  if [[ -z "$COGNITO_DOMAIN_PREFIX" ]]; then
    echo "Define COGNITO_DOMAIN_PREFIX (único global, ej. len-validation-tuempresa)"
    exit 1
  fi
  wait_for_stack_ready
  resolve_dashboard_access
  echo "→ CloudFormation stack $STACK_NAME"
  PARAM_OVERRIDES=(
    "ProjectName=$PROJECT_NAME"
    "CognitoDomainPrefix=$COGNITO_DOMAIN_PREFIX"
  )
  if [[ -n "$DASHBOARD_JWT_AUDIENCE" ]]; then
    echo "→ Dashboard JWT audience: $DASHBOARD_JWT_AUDIENCE"
    PARAM_OVERRIDES+=("DashboardJwtAudience=$DASHBOARD_JWT_AUDIENCE")
  fi
  if [[ -n "$DASHBOARD_ORIGIN" ]]; then
    echo "→ Dashboard CORS origin: $DASHBOARD_ORIGIN"
    PARAM_OVERRIDES+=("DashboardOrigin=$DASHBOARD_ORIGIN")
  fi
  aws cloudformation deploy \
    --template-file infra/cloudformation.yml \
    --stack-name "$STACK_NAME" \
    --parameter-overrides "${PARAM_OVERRIDES[@]}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --region "$AWS_REGION"
fi

echo "→ Empaquetar validation-api Lambda"
bash scripts/package-validation-api.sh

APP_BUCKET="$(cf_out AppBucketName)"
IMGS_BUCKET="$(cf_out ImgsBucketName)"
DIST_ID="$(cf_out CloudFrontDistributionId)"
CF_DOMAIN="$(cf_out CloudFrontDomain)"
USER_POOL_ID="$(cf_out UserPoolId)"
CLIENT_ID="$(cf_out UserPoolClientId)"
COGNITO_DOMAIN="$(cf_out CognitoDomain)"
API_URL="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query "Stacks[0].Outputs[?OutputKey=='ValidationApiUrl'].OutputValue | [0]" --output text 2>/dev/null || true)"
[[ "$API_URL" == "None" || -z "$API_URL" ]] && API_URL=""
CF_URL="https://$CF_DOMAIN"

echo "→ Actualizar Cognito callback URLs → $CF_URL"
aws cognito-idp update-user-pool-client \
  --user-pool-id "$USER_POOL_ID" \
  --client-id "$CLIENT_ID" \
  --callback-urls \
    "http://localhost:5173/" \
    "http://localhost:5173/auth/callback" \
    "$CF_URL/" \
    "$CF_URL/auth/callback" \
  --logout-urls \
    "http://localhost:5173/" \
    "$CF_URL/" \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client \
  --supported-identity-providers COGNITO \
  --explicit-auth-flows ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_SRP_AUTH \
  --prevent-user-existence-errors ENABLED \
  --region "$AWS_REGION" >/dev/null

cat > .env.production <<EOF
VITE_COGNITO_ENABLED=true
VITE_COGNITO_REGION=$AWS_REGION
VITE_COGNITO_USER_POOL_ID=$USER_POOL_ID
VITE_COGNITO_CLIENT_ID=$CLIENT_ID
VITE_COGNITO_DOMAIN=$COGNITO_DOMAIN
VITE_API_BASE_URL=$API_URL
EOF

# Vite prioriza variables ya exportadas en el shell sobre .env.production.
# .env local suele tener VITE_COGNITO_ENABLED=false para dev — hay que limpiarlas.
unset VITE_COGNITO_ENABLED VITE_COGNITO_REGION VITE_COGNITO_USER_POOL_ID VITE_COGNITO_CLIENT_ID VITE_COGNITO_DOMAIN VITE_API_BASE_URL
export VITE_COGNITO_ENABLED=true
export VITE_COGNITO_REGION="$AWS_REGION"
export VITE_COGNITO_USER_POOL_ID="$USER_POOL_ID"
export VITE_COGNITO_CLIENT_ID="$CLIENT_ID"
export VITE_COGNITO_DOMAIN="$COGNITO_DOMAIN"
export VITE_API_BASE_URL="$API_URL"

echo "→ npm run build"
npm run build
if ! grep -rq "$USER_POOL_ID" dist/assets/*.js 2>/dev/null; then
  echo "ERROR: el build no incluyó Cognito (User Pool). Revisa variables VITE_* exportadas antes del build."
  exit 1
fi
rm -rf dist/imgs

echo "→ Sync app → s3://$APP_BUCKET/"
aws s3 sync dist/ "s3://$APP_BUCKET/" --delete --region "$AWS_REGION" \
  --exclude "imgs/*" --exclude "imgs/**"

if [[ "$SKIP_IMGS" != "true" && -d public/imgs ]]; then
  echo "→ Sync imgs"
  IMGS_BUCKET="$IMGS_BUCKET" STACK_NAME="$STACK_NAME" AWS_REGION="$AWS_REGION" bash scripts/sync-imgs.sh
elif [[ "$SKIP_IMGS" == "true" ]]; then
  echo "→ Skip sync de imágenes (SKIP_IMGS=true)"
else
  echo "⚠ public/imgs no existe — omite sync de sprites"
fi

if [[ "$ATTACH_EDGE" == "true" ]]; then
  echo "→ Empaquetar / adjuntar Lambda@Edge"
  bash scripts/attach-auth-edge.sh
fi

echo "→ Invalidar CloudFront $DIST_ID"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" >/dev/null

echo ""
echo "Deploy listo:"
echo "  URL:     $CF_URL"
echo "  API:     $API_URL"
echo "  Cognito: $COGNITO_DOMAIN"
echo "  Invite:  bash scripts/invite-user.sh someone@empresa.com"
