#!/usr/bin/env bash
# Package Cognito JWT gate as Lambda@Edge (us-east-1) and attach to CloudFront viewer-request
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
EDGE_REGION="us-east-1"
FN_NAME="${STACK_NAME}-auth-at-edge"
ROLE_NAME="${STACK_NAME}-auth-at-edge-role"

cf_out() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text
}

USER_POOL_ID="$(cf_out UserPoolId)"
CLIENT_ID="$(cf_out UserPoolClientId)"
DIST_ID="$(cf_out CloudFrontDistributionId)"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

WORKDIR="$ROOT/infra/auth-at-edge/dist"
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"

sed \
  -e "s/{{USER_POOL_ID}}/$USER_POOL_ID/g" \
  -e "s/{{CLIENT_ID}}/$CLIENT_ID/g" \
  -e "s/{{REGION}}/$AWS_REGION/g" \
  "$ROOT/infra/auth-at-edge/index.mjs" > "$WORKDIR/index.mjs"

(
  cd "$WORKDIR"
  if command -v zip >/dev/null; then
    zip -q -r ../auth-at-edge.zip index.mjs
  else
    python3 - <<'PY'
import zipfile
from pathlib import Path
root = Path("..")
with zipfile.ZipFile(root / "auth-at-edge.zip", "w", zipfile.ZIP_DEFLATED) as zf:
    zf.write("index.mjs")
PY
  fi
)

ZIP="$ROOT/infra/auth-at-edge/auth-at-edge.zip"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":["lambda.amazonaws.com","edgelambda.amazonaws.com"]},"Action":"sts:AssumeRole"}]}'

if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "→ Crear IAM role $ROLE_NAME"
  aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document "$TRUST" >/dev/null
  aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "Esperando propagación IAM (12s)…"
  sleep 12
fi

if aws lambda get-function --function-name "$FN_NAME" --region "$EDGE_REGION" >/dev/null 2>&1; then
  echo "→ Update Lambda $FN_NAME"
  aws lambda update-function-code \
    --function-name "$FN_NAME" \
    --zip-file "fileb://$ZIP" \
    --region "$EDGE_REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FN_NAME" --region "$EDGE_REGION"
else
  echo "→ Create Lambda $FN_NAME en $EDGE_REGION"
  aws lambda create-function \
    --function-name "$FN_NAME" \
    --runtime nodejs20.x \
    --role "$ROLE_ARN" \
    --handler index.handler \
    --timeout 5 \
    --memory-size 128 \
    --zip-file "fileb://$ZIP" \
    --region "$EDGE_REGION" >/dev/null
  aws lambda wait function-active --function-name "$FN_NAME" --region "$EDGE_REGION"
fi

VERSION=$(aws lambda publish-version --function-name "$FN_NAME" --region "$EDGE_REGION" --query Version --output text)
FN_ARN=$(aws lambda get-function --function-name "$FN_NAME" --qualifier "$VERSION" --region "$EDGE_REGION" --query Configuration.FunctionArn --output text)

echo "→ Asociar Lambda@Edge a $DIST_ID"
python3 - <<PY
import json, subprocess, tempfile, os

dist_id = "$DIST_ID"
fn_arn = "$FN_ARN"

raw = subprocess.check_output(
    ["aws", "cloudfront", "get-distribution-config", "--id", dist_id, "--output", "json"],
    text=True,
)
data = json.loads(raw)
etag = data["ETag"]
cfg = data["DistributionConfig"]
assoc = {
    "Quantity": 1,
    "Items": [{
        "LambdaFunctionARN": fn_arn,
        "EventType": "viewer-request",
        "IncludeBody": False,
    }],
}
cfg["DefaultCacheBehavior"]["LambdaFunctionAssociations"] = assoc
behaviors = cfg.get("CacheBehaviors") or {}
items = behaviors.get("Items") or []
for item in items:
    item["LambdaFunctionAssociations"] = dict(assoc)
if items:
    cfg["CacheBehaviors"] = {"Quantity": len(items), "Items": items}

with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
    json.dump(cfg, fh)
    path = fh.name

subprocess.check_call([
    "aws", "cloudfront", "update-distribution",
    "--id", dist_id,
    "--if-match", etag,
    "--distribution-config", f"file://{path}",
])
os.unlink(path)
print(f"Lambda@Edge adjuntada (versión $VERSION). Propagación CF: 5–15 min.")
PY
