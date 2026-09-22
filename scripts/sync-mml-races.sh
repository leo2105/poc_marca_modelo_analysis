#!/usr/bin/env bash
# Copia sprites MML del bucket del dashboard al de validación.
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
SRC_BUCKET="${SRC_BUCKET:-len-shoes-dashboard-imgs-797601857677}"
DST_BUCKET="${DST_BUCKET:-len-shoes-validation-imgs-797601857677}"
DIST_ID="${DIST_ID:-E3RQO291XV1T2L}"

for event_id in mml-21k mml-10k; do
  echo "Sync ${event_id}"
  aws s3 sync \
    "s3://${SRC_BUCKET}/imgs/races/${event_id}/" \
    "s3://${DST_BUCKET}/imgs/races/${event_id}/" \
    --region "$AWS_REGION"
done

echo "Invalidate CloudFront /imgs/races/*"
aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/imgs/races/*" \
  --query "Invalidation.Id" \
  --output text

echo "Done"
