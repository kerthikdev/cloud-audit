#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — Build AMD64 images, push to ECR, update ECS service
#
# Usage:
#   chmod +x infra/deploy.sh
#   ./infra/deploy.sh
#
# Prerequisites:
#   - AWS CLI installed & configured (aws configure)
#   - Docker Desktop running (with BuildKit / buildx)
#   - Correct values filled in for ACCOUNT_ID, REGION, CLUSTER, SERVICE below
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ─── EDIT THESE ──────────────────────────────────────────────────────────────
ACCOUNT_ID="YOUR_AWS_ACCOUNT_ID"        # e.g. 123456789012
REGION="ap-south-1"                     # your AWS region
CLUSTER="cloudaudit-cluster"            # your ECS cluster name
SERVICE="cloudaudit-service"            # your ECS service name
# ─────────────────────────────────────────────────────────────────────────────

ECR_BASE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
BACKEND_IMAGE="${ECR_BASE}/cloudaudit-backend"
FRONTEND_IMAGE="${ECR_BASE}/cloudaudit-frontend"
TAG="latest"

echo ""
echo "🔐  Logging into ECR..."
aws ecr get-login-password --region "${REGION}" \
  | docker login --username AWS --password-stdin "${ECR_BASE}"

# ─── Create ECR repos if they don't exist ────────────────────────────────────
echo ""
echo "📦  Ensuring ECR repositories exist..."
aws ecr describe-repositories --repository-names cloudaudit-backend \
  --region "${REGION}" > /dev/null 2>&1 \
  || aws ecr create-repository --repository-name cloudaudit-backend \
       --region "${REGION}" --image-scanning-configuration scanOnPush=true

aws ecr describe-repositories --repository-names cloudaudit-frontend \
  --region "${REGION}" > /dev/null 2>&1 \
  || aws ecr create-repository --repository-name cloudaudit-frontend \
       --region "${REGION}" --image-scanning-configuration scanOnPush=true

# ─── Setup multi-platform builder (first time only) ──────────────────────────
echo ""
echo "🔨  Setting up Docker buildx for multi-platform..."
docker buildx inspect cloudaudit-builder > /dev/null 2>&1 \
  || docker buildx create --name cloudaudit-builder --use
docker buildx use cloudaudit-builder

# ─── Build & Push BACKEND ─────────────────────────────────────────────────────
echo ""
echo "🐍  Building backend image (linux/amd64)..."
cd "$(dirname "$0")/../backend"

docker buildx build \
  --platform linux/amd64 \
  --tag "${BACKEND_IMAGE}:${TAG}" \
  --push \
  .

echo "✅  Backend pushed → ${BACKEND_IMAGE}:${TAG}"

# ─── Build & Push FRONTEND ────────────────────────────────────────────────────
echo ""
echo "⚛️   Building frontend image (linux/amd64)..."
cd "$(dirname "$0")/../frontend"

docker buildx build \
  --platform linux/amd64 \
  --build-arg BACKEND_URL="" \
  --tag "${FRONTEND_IMAGE}:${TAG}" \
  --push \
  .

echo "✅  Frontend pushed → ${FRONTEND_IMAGE}:${TAG}"

# ─── Deploy to ECS ────────────────────────────────────────────────────────────
echo ""
echo "🚀  Forcing ECS service redeployment..."
aws ecs update-service \
  --cluster "${CLUSTER}" \
  --service "${SERVICE}" \
  --force-new-deployment \
  --region "${REGION}" \
  --output text --query 'service.serviceName'

echo ""
echo "⏳  Waiting for ECS to stabilise (this takes 2-5 minutes)..."
aws ecs wait services-stable \
  --cluster "${CLUSTER}" \
  --services "${SERVICE}" \
  --region "${REGION}"

echo ""
echo "🎉  Deployment complete!"
echo "    Backend  → ${BACKEND_IMAGE}:${TAG}"
echo "    Frontend → ${FRONTEND_IMAGE}:${TAG}"
echo "    Cluster  → ${CLUSTER} / ${SERVICE}"
