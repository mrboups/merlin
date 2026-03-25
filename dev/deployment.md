# Deployment Guide

## Overview

Merlin is deployed on Google Cloud Platform in the `europe-west1` region:

| Component | Service | URL |
|-----------|---------|-----|
| Frontend | Firebase Hosting (static PWA) | https://merlin-app.web.app |
| Backend | Cloud Run (serverless FastAPI) | https://merlin-api-795485039698.europe-west1.run.app |
| Database | Firestore (Native mode) | Real-time sync, security rules |
| Secrets | Google Secret Manager | Encrypted at rest |
| Docker | Artifact Registry | `europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker` |

API requests from the frontend are proxied through Firebase Hosting rewrites (`/api/**` routes to Cloud Run), so the frontend only talks to `merlin-app.web.app`.

## Prerequisites

- **gcloud CLI** installed and authenticated as `mrboups@gmail.com`
- **firebase CLI** installed and authenticated
- **Docker** installed (for backend image builds)
- **Node.js 22+** and **pnpm** (for frontend builds)
- **Python 3.12** (for local backend development)

Verify your setup:
```bash
gcloud auth list                  # Must show mrboups@gmail.com as ACTIVE
gcloud config get-value project   # Must show merlin-wallet-prod
firebase projects:list            # Must show merlin-wallet-prod
```

## GCP Project Details

| Property | Value |
|----------|-------|
| Project ID | `merlin-wallet-prod` |
| Project Number | `795485039698` |
| Region | `europe-west1` |
| Billing Account | `01BD75-FFCD2A-B7C532` |
| Active Account | `mrboups@gmail.com` |

## Environment Variables

Copy `.env.example` to `.env` and fill in real values. Never commit `.env` to version control.

| Variable | Description | Required For |
|----------|-------------|--------------|
| `GCP_PROJECT_ID` | `merlin-wallet-prod` | All deploys |
| `GCP_ACCOUNT` | `mrboups@gmail.com` | All deploys |
| `GCP_REGION` | `europe-west1` | All deploys |
| `ETH_RPC_URL` | Ethereum mainnet RPC endpoint | Backend runtime |
| `SEPOLIA_RPC_URL` | Sepolia testnet RPC endpoint | Development |
| `OPENAI_API_KEY` | OpenAI API key (chat + intent parsing) | Backend runtime |
| `GROK_API_KEY` | Grok/xAI API key (social sentiment) | Optional |
| `COINMARKETCAP_API_KEY` | CoinMarketCap API key (price data) | Backend runtime |
| `CORS_ORIGINS` | Allowed origins, comma-separated | Production |

## Deployment Safety Protocol (MANDATORY)

Before running ANY deploy command (`gcloud builds submit`, `gcloud run deploy`, `firebase deploy`, `docker push`), you MUST complete all of these checks:

1. **Read `.env`** and extract `GCP_PROJECT_ID` and `GCP_ACCOUNT`
2. **Verify gcloud account matches**:
   ```bash
   gcloud auth list
   # Active account MUST be mrboups@gmail.com
   ```
3. **Verify gcloud project matches**:
   ```bash
   gcloud config get-value project
   # MUST return merlin-wallet-prod
   ```
4. **Verify Firebase account** (for Firebase deploys):
   ```bash
   firebase login:list
   # MUST show mrboups@gmail.com
   ```
5. **Always use explicit flags**:
   - `--project merlin-wallet-prod`
   - `--region europe-west1`
6. **If ANY mismatch: STOP.** Do not proceed. Ask the operator to fix the configuration.
7. **Never deploy to a project that does not match `.env` values.**

This protocol exists to prevent accidental deployment to the wrong GCP project.

---

## Deploy Backend (Cloud Run)

The backend is a FastAPI application packaged as a Docker container and deployed to Cloud Run.

### Option 1: Docker Build + Deploy

Build the image locally, push to Artifact Registry, then deploy:

```bash
# Build the Docker image
docker build -t europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:latest .

# Push to Artifact Registry
docker push europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:latest

# Deploy to Cloud Run
gcloud run deploy merlin-api \
  --project merlin-wallet-prod \
  --region europe-west1 \
  --image europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:latest \
  --allow-unauthenticated \
  --set-secrets="ETH_RPC_URL=ETH_RPC_URL:latest,SEPOLIA_RPC_URL=SEPOLIA_RPC_URL:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,GROK_API_KEY=GROK_API_KEY:latest"
```

### Option 2: Cloud Build

Let Cloud Build handle the image build and push:

```bash
gcloud builds submit \
  --project merlin-wallet-prod \
  --region europe-west1
```

This uses the `cloudbuild.yaml` (if present) or the `Dockerfile` in the project root.

### Cloud Run Configuration

Key settings for the `merlin-api` service:

| Setting | Value | Notes |
|---------|-------|-------|
| Region | `europe-west1` | Matches Firestore region |
| Memory | 512 Mi | Adjust based on load |
| CPU | 1 | Scales with instances |
| Min instances | 0 | Scales to zero when idle |
| Max instances | 10 | Prevent runaway costs |
| Timeout | 300s | For long SSE chat streams |
| Concurrency | 80 | Requests per instance |
| Ingress | All | Firebase Hosting proxies traffic |

### Secret Manager Integration

Cloud Run accesses secrets via `--set-secrets` flag, which mounts Secret Manager values as environment variables at runtime. Available secrets:

```bash
# List all secrets
gcloud secrets list --project=merlin-wallet-prod

# Add or update a secret value
echo -n "YOUR_VALUE" | gcloud secrets versions add SECRET_NAME \
  --data-file=- \
  --project=merlin-wallet-prod

# View secret metadata (not the value)
gcloud secrets describe SECRET_NAME --project=merlin-wallet-prod

# Access a secret value (for debugging only)
gcloud secrets versions access latest --secret=SECRET_NAME --project=merlin-wallet-prod
```

Current secrets: `ETH_RPC_URL`, `SEPOLIA_RPC_URL`, `OPENAI_API_KEY`, `GROK_API_KEY`.

---

## Deploy Frontend (Firebase Hosting)

The frontend is a Next.js 15 app with static export, deployed to Firebase Hosting.

### Build and Deploy

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
pnpm install

# Build the static export (outputs to frontend/out/)
pnpm build

# Deploy to Firebase Hosting
firebase deploy --only hosting:merlin-app --project merlin-wallet-prod
```

### Firebase Configuration Files

**`firebase.json`** -- Hosting configuration with API proxy rewrites:
```json
{
  "hosting": {
    "site": "merlin-app",
    "public": "frontend/out",
    "rewrites": [
      {
        "source": "/api/**",
        "run": {
          "serviceId": "merlin-api",
          "region": "europe-west1"
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

The `/api/**` rewrite routes all API calls from the frontend to the Cloud Run backend. This eliminates CORS issues and keeps the backend URL internal.

**`.firebaserc`** -- Project alias:
```json
{
  "projects": {
    "default": "merlin-wallet-prod"
  }
}
```

**`firestore.rules`** -- Security rules enforce user-scoped read/write access. Users can only read and write their own documents.

### Preview Before Deploy

To verify changes before deploying to production:

```bash
# Preview channel (temporary URL, auto-expires)
firebase hosting:channel:deploy preview --project merlin-wallet-prod

# This creates a URL like:
# https://merlin-app--preview-abc123.web.app
```

---

## Firestore

Firestore is in Native mode in `europe-west1`. Collections:

| Collection | Description | Access |
|------------|-------------|--------|
| `users` | User profiles, passkey credentials, addresses | User-scoped |
| `conversations` | Chat sessions | User-scoped |
| `messages` | Chat messages (subcollection of conversations) | User-scoped |
| `trades` | Trade records (quotes, confirmations) | User-scoped |
| `portfolio_snapshots` | Historical portfolio values | User-scoped |

Security rules ensure users can only access their own documents. The backend uses a service account with full access.

### Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules --project merlin-wallet-prod
```

---

## Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | https://merlin-app.web.app | PWA entry point |
| Frontend (alt) | https://merlin-app.firebaseapp.com | Firebase default domain |
| Backend API (direct) | https://merlin-api-795485039698.europe-west1.run.app | Cloud Run direct access |
| Backend API (proxied) | https://merlin-app.web.app/api/v1/* | Through Firebase Hosting |
| Swagger docs | https://merlin-app.web.app/api/v1/docs | FastAPI auto-generated docs |
| ReDoc | https://merlin-app.web.app/api/v1/redoc | Alternative API docs |
| Firebase Console | https://console.firebase.google.com/project/merlin-wallet-prod/overview | Project dashboard |
| GCP Console | https://console.cloud.google.com/home/dashboard?project=merlin-wallet-prod | Cloud dashboard |
| Cloud Run Console | https://console.cloud.google.com/run?project=merlin-wallet-prod | Service management |

---

## Local Development

### Backend

```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate    # Linux/macOS
.venv\Scripts\activate       # Windows

# Install dependencies
pip install -r requirements.txt

# Run with hot reload
uvicorn main:app --reload --port 8000

# API available at http://localhost:8000
# Swagger docs at http://localhost:8000/docs
```

The backend reads environment variables from `.env` in the project root.

### Frontend

```bash
cd frontend

# Install dependencies
pnpm install

# Run dev server
pnpm dev

# Available at http://localhost:3000
# API calls proxy to http://localhost:8000 via Next.js rewrites
```

### Running Both Together

Start the backend and frontend in separate terminals. The frontend Next.js dev server proxies `/api/**` requests to `http://localhost:8000`, matching the Firebase Hosting rewrite behavior in production.

---

## Monitoring and Logs

### Cloud Run Logs

```bash
# Stream live logs
gcloud run services logs read merlin-api \
  --project merlin-wallet-prod \
  --region europe-west1 \
  --limit 100

# Tail logs in real time
gcloud run services logs tail merlin-api \
  --project merlin-wallet-prod \
  --region europe-west1
```

### Cloud Run Metrics

View request count, latency, and error rates in the GCP Console:
```
https://console.cloud.google.com/run/detail/europe-west1/merlin-api/metrics?project=merlin-wallet-prod
```

### Firebase Hosting

View hosting release history and traffic in the Firebase Console:
```
https://console.firebase.google.com/project/merlin-wallet-prod/hosting/sites/merlin-app
```

---

## CI/CD (Planned)

GitHub Actions pipeline for automated deployment:

### Trigger
- Push to `main` branch
- Pull request (lint + test only, no deploy)

### Pipeline Steps

1. **Lint and typecheck**
   - `pnpm lint` (frontend)
   - `pnpm typecheck` (frontend)
   - Python linting (backend)

2. **Run tests**
   - `pnpm test` (frontend/SDK)
   - `pytest` (backend)

3. **Build and push Docker image**
   - Build from `Dockerfile`
   - Push to `europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:$SHA`
   - Tag as `:latest`

4. **Deploy backend to Cloud Run**
   - `gcloud run deploy merlin-api --image ...:$SHA`
   - Uses Workload Identity Federation (no service account keys)

5. **Build frontend**
   - `pnpm build` (Next.js static export)

6. **Deploy frontend to Firebase Hosting**
   - `firebase deploy --only hosting:merlin-app`

### Required GitHub Secrets
| Secret | Description |
|--------|-------------|
| `GCP_PROJECT_ID` | `merlin-wallet-prod` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity pool provider |
| `GCP_SERVICE_ACCOUNT` | Service account for CI/CD |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase deployment credentials |

---

## Rollback

### Backend Rollback

Cloud Run keeps revision history. Roll back to a previous revision:

```bash
# List revisions
gcloud run revisions list \
  --service merlin-api \
  --project merlin-wallet-prod \
  --region europe-west1

# Route all traffic to a previous revision
gcloud run services update-traffic merlin-api \
  --project merlin-wallet-prod \
  --region europe-west1 \
  --to-revisions REVISION_NAME=100
```

### Frontend Rollback

Firebase Hosting keeps release history. Roll back via the Firebase Console or CLI:

```bash
# List recent releases
firebase hosting:channel:list --project merlin-wallet-prod

# Roll back to a previous version (use the version ID from the console)
firebase hosting:clone merlin-app:VERSION_ID merlin-app:live --project merlin-wallet-prod
```

---

## Cost Management

Key cost drivers and controls:

| Service | Cost Driver | Control |
|---------|-------------|---------|
| Cloud Run | Request count + CPU/memory time | Max instances = 10, scale to zero |
| Firestore | Reads/writes/storage | Security rules prevent abuse |
| Secret Manager | Access operations | Minimal (< $1/month) |
| Artifact Registry | Storage | Prune old images periodically |
| Firebase Hosting | Bandwidth + storage | CDN caching reduces bandwidth |

### Prune Old Docker Images

```bash
# List images
gcloud artifacts docker images list \
  europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker \
  --project merlin-wallet-prod

# Delete a specific image digest
gcloud artifacts docker images delete \
  europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api@sha256:DIGEST \
  --project merlin-wallet-prod
```
