# Deployment & Infrastructure
## Status: Live
## Overview
Merlin runs on Google Cloud Platform with Firebase Hosting for the PWA frontend and Cloud Run for the FastAPI backend. Firestore provides real-time database capabilities. All secrets are managed via Google Secret Manager in production.
## Architecture
```
User → Firebase Hosting (PWA) → /api/** rewrite → Cloud Run (FastAPI)
                                                    ↓
                                              Firestore (database)
                                              Secret Manager (secrets)
                                              Artifact Registry (Docker images)
```
## Implementation Details
- GCP Project: merlin-wallet-prod (europe-west1)
- Firebase Hosting: site "merlin-app" → https://merlin-app.web.app
- Cloud Run: merlin-api service, auto-scaling, serverless
- API proxy: firebase.json rewrites /api/** to Cloud Run service
- Firestore: Native mode, real-time sync, security rules in firestore.rules
- Artifact Registry: merlin-docker repository for Docker images
- Docker: multi-stage build for backend
- CORS: configurable via CORS_ORIGINS env var
- CI/CD: GitHub Actions (planned)
- Terraform: IaC (planned)
## Code Map
| File | Purpose |
|------|---------|
| firebase.json | Hosting config, API rewrites to Cloud Run |
| firestore.rules | Firestore security rules (user-scoped read/write) |
| .firebaserc | Firebase project alias (merlin-wallet-prod) |
| backend/main.py | FastAPI app, CORS middleware, router registration |
| backend/Dockerfile | Docker build for Cloud Run |
| .env.example | Environment variable template |
| .github/ | GitHub Actions CI/CD (planned) |
## Service URLs
| Service | URL |
|---------|-----|
| Frontend | https://merlin-app.web.app |
| Backend API | https://merlin-api-795485039698.europe-west1.run.app |
| API (via proxy) | https://merlin-app.web.app/api/v1/* |
## Secret Manager Secrets
| Secret | Purpose |
|--------|---------|
| ETH_RPC_URL | Ethereum mainnet RPC |
| SEPOLIA_RPC_URL | Sepolia testnet RPC |
| OPENAI_API_KEY | OpenAI for AI chat |
| GROK_API_KEY | Grok for social sentiment |
## Configuration
| Variable | Description | Required |
|----------|-------------|----------|
| GCP_PROJECT_ID | merlin-wallet-prod | Yes (deploy) |
| GCP_ACCOUNT | mrboups@gmail.com | Yes (deploy) |
| GCP_REGION | europe-west1 | Yes (deploy) |
| CORS_ORIGINS | Comma-separated allowed origins | Production |
| DEBUG | Enable verbose logging | No |
## Deployment Commands
```bash
# Backend (Cloud Run)
gcloud builds submit --project merlin-wallet-prod --region europe-west1
gcloud run deploy merlin-api --project merlin-wallet-prod --region europe-west1

# Frontend (Firebase Hosting)
firebase deploy --only hosting:merlin-app --project merlin-wallet-prod

# Docker
docker build -t europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:latest .
docker push europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:latest
```
## Current Limitations
- No CI/CD pipeline yet (manual deploys)
- No Terraform IaC (manual GCP setup)
- No staging environment (prod only)
- No health check monitoring/alerting
- No CDN configuration
- No rate limiting at infrastructure level
## Related
- [auth-passkey.md](auth-passkey.md) — auth endpoints on Cloud Run
- [ai-chat-pipeline.md](ai-chat-pipeline.md) — chat streaming on Cloud Run
