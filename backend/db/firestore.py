"""
Firestore async client singleton.

The client is created once and reused for the lifetime of the process.
GCP_PROJECT_ID is read from the environment; in Cloud Run the service
account credentials are picked up automatically via Application Default
Credentials (ADC).  For local development set GOOGLE_APPLICATION_CREDENTIALS
to the path of a service account JSON key.
"""

import os

from google.cloud.firestore_v1.async_client import AsyncClient

_client: AsyncClient | None = None


def get_firestore() -> AsyncClient:
    """
    Return the Firestore async client singleton, creating it on first call.

    This function is synchronous so it can be called from module-level
    startup code as well as inside async route handlers.  The underlying
    gRPC channel is created lazily by the Firestore SDK on the first
    actual network call.
    """
    global _client
    if _client is None:
        project_id: str = os.environ.get("GCP_PROJECT_ID", "merlin-wallet-prod")
        _client = AsyncClient(project=project_id)
    return _client
