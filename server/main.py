import logging
import warnings

# Setup logger configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("webrag.main")

# Silence noisy third-party libraries and warnings
logging.getLogger("faiss.loader").setLevel(logging.WARNING)
logging.getLogger("sentence_transformers").setLevel(logging.WARNING)
logging.getLogger("transformers").setLevel(logging.WARNING)
logging.getLogger("huggingface_hub").setLevel(logging.ERROR)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("watchfiles").setLevel(logging.WARNING)
logging.getLogger("watchfiles.main").setLevel(logging.WARNING)

# Suppress HuggingFace unauthenticated warning and other minor user warnings
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", message=".*unauthenticated requests to the HF Hub.*")
warnings.filterwarnings("ignore", message=".*module.register.*")

import nltk
# Download NLTK datasets quietly on startup if missing
try:
    logger.info("Verifying NLTK datasets...")
    nltk.download("punkt", quiet=True)
    nltk.download("stopwords", quiet=True)
except Exception as e:
    logger.warning(f"Failed to check/download NLTK data: {e}. Falling back to default word segmenters.")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from server.config import settings
from server.services.model_pool import model_pool
from server.routes.ingest import router as ingest_router
from server.routes.search import router as search_router
from server.routes.settings import router as settings_router

import threading

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager to handle startup/shutdown actions."""
    logger.info("Initializing Ultimate RAG Engine Backend...")
    
    # 1. Warm up embedding and reranking models in background thread so HTTP binds instantly
    def warm_models_bg():
        try:
            model_pool.load_models()
            logger.info("Models preloaded successfully in background warm pool.")
        except Exception as e:
            logger.error(f"Error preloading models in background thread: {e}")

    threading.Thread(target=warm_models_bg, daemon=True).start()
    yield
    
    logger.info("Shutting down Ultimate RAG Engine Backend...")

# Create FastAPI application
app = FastAPI(
    title="Ultimate Local RAG Engine",
    description="GPU-accelerated Python FastAPI backend for Next.js WebRAG.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all route managers
app.include_router(ingest_router)
app.include_router(search_router)
app.include_router(settings_router)

@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Ultimate Local RAG Engine Backend",
        "version": "1.0.0"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server.main:app", host="0.0.0.0", port=8000, reload=True)
