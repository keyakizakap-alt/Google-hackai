#!/usr/bin/env bash
set -euo pipefail

# Run from the repository root in Google Cloud Shell. Creates billable resources.
: "${OSHIREADY_PROJECT_ID:?Set a globally unique Google Cloud project ID}"
: "${OSHIREADY_BILLING_ACCOUNT:?Set the billing account ID (XXXXXX-XXXXXX-XXXXXX)}"

OSHIREADY_REGION="${OSHIREADY_REGION:-asia-northeast1}"
OSHIREADY_SERVICE="oshiready"
OSHIREADY_RUNTIME="oshiready-runtime"
OSHIREADY_SECRET="oshiready-session-secret"

if [[ ! "$OSHIREADY_PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "Invalid project ID. Use 6–30 lowercase letters, numbers and hyphens, starting with a letter." >&2
  exit 2
fi
if [[ ! "$OSHIREADY_BILLING_ACCOUNT" =~ ^[A-Fa-f0-9]{6}-[A-Fa-f0-9]{6}-[A-Fa-f0-9]{6}$ ]]; then
  echo "Invalid billing account ID format." >&2
  exit 2
fi
if [[ ! -f Dockerfile || ! -f package.json ]]; then
  echo "Run this script from the OshiReady repository root." >&2
  exit 2
fi
command -v gcloud >/dev/null || { echo "Use Google Cloud Shell (gcloud is required)." >&2; exit 2; }

if ! gcloud projects describe "$OSHIREADY_PROJECT_ID" --format='value(projectId)' >/dev/null 2>&1; then
  gcloud projects create "$OSHIREADY_PROJECT_ID" --name='OshiReady'
fi
gcloud billing projects link "$OSHIREADY_PROJECT_ID" --billing-account="$OSHIREADY_BILLING_ACCOUNT"
gcloud config set project "$OSHIREADY_PROJECT_ID"
gcloud services enable \
  serviceusage.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com aiplatform.googleapis.com \
  secretmanager.googleapis.com compute.googleapis.com iam.googleapis.com \
  calendar-json.googleapis.com

OSHIREADY_PROJECT_NUMBER="$(gcloud projects describe "$OSHIREADY_PROJECT_ID" --format='value(projectNumber)')"
OSHIREADY_RUNTIME_EMAIL="${OSHIREADY_RUNTIME}@${OSHIREADY_PROJECT_ID}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$OSHIREADY_RUNTIME_EMAIL" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$OSHIREADY_RUNTIME" --display-name='OshiReady runtime'
fi
gcloud projects add-iam-policy-binding "$OSHIREADY_PROJECT_ID" \
  --member="serviceAccount:${OSHIREADY_RUNTIME_EMAIL}" --role='roles/aiplatform.user' --quiet >/dev/null

if ! gcloud secrets describe "$OSHIREADY_SECRET" >/dev/null 2>&1; then
  openssl rand -base64 48 | gcloud secrets create "$OSHIREADY_SECRET" --data-file=- --replication-policy=automatic
fi
gcloud secrets add-iam-policy-binding "$OSHIREADY_SECRET" \
  --member="serviceAccount:${OSHIREADY_RUNTIME_EMAIL}" \
  --role='roles/secretmanager.secretAccessor' --quiet >/dev/null

# Current Cloud Run source deployments use this default build service account.
gcloud projects add-iam-policy-binding "$OSHIREADY_PROJECT_ID" \
  --member="serviceAccount:${OSHIREADY_PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role='roles/run.builder' --quiet >/dev/null

# Limit concurrent public requests while validating the real Gemini integration.
gcloud run deploy "$OSHIREADY_SERVICE" --source . \
  --region "$OSHIREADY_REGION" --project "$OSHIREADY_PROJECT_ID" \
  --service-account "$OSHIREADY_RUNTIME_EMAIL" \
  --allow-unauthenticated --min-instances=0 --max-instances=1 \
  --concurrency=5 --timeout=180 --memory=1Gi \
  --set-env-vars="GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=${OSHIREADY_PROJECT_ID},GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=${OSHIREADY_GEMINI_MODEL:-gemini-3.5-flash},AGENT_MAX_STEPS=12,AGENT_DAILY_LIMIT=25" \
  --set-secrets="SESSION_SECRET=${OSHIREADY_SECRET}:latest"

OSHIREADY_URL="$(gcloud run services describe "$OSHIREADY_SERVICE" \
  --region "$OSHIREADY_REGION" --project "$OSHIREADY_PROJECT_ID" \
  --format='value(status.url)')"
# OAuth remains disabled until its client credentials and redirect URI are configured.
gcloud run services update "$OSHIREADY_SERVICE" \
  --region "$OSHIREADY_REGION" --project "$OSHIREADY_PROJECT_ID" \
  --update-env-vars="APP_BASE_URL=${OSHIREADY_URL}"
curl --fail --silent --show-error "${OSHIREADY_URL}/api/health"
echo
echo "Cloud Run URL: ${OSHIREADY_URL}"
echo "Next: test real Gemini planning, then configure Calendar OAuth using docs/cloud-run-launch.md."
