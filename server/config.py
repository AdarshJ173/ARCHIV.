import os
import torch
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

# Base directory of the project
BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    # API Keys & URLs
    OPENROUTER_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"

    # Default LLM configurations
    LLM_PROVIDER: str = "openrouter"  # openrouter, ollama, openai
    OLLAMA_MODEL: str = "llama3.1"
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENROUTER_MODEL: str = "openrouter/free"

    # RAG Configuration
    EMBEDDING_MODEL: str = "BAAI/bge-base-en-v1.5"
    RERANKER_MODEL: str = "BAAI/bge-reranker-v2-m3"
    
    # Device configuration: auto, cuda, cpu, mps
    DEVICE: str = "auto"
    
    # Chunking parameters
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 50
    
    # Retrieval parameters
    TOP_K: int = 10
    MMR_LAMBDA: float = 0.7
    RRF_K: int = 60
    VECTOR_WEIGHT: float = 0.5
    BM25_WEIGHT: float = 0.5
    
    # Feature flags
    ENABLE_HYDE: bool = True
    ENABLE_MULTI_QUERY: bool = False
    ENABLE_MMR: bool = True
    ENABLE_COMPRESSION: bool = True
    
    # Storage paths
    DATA_DIR: str = str(BASE_DIR / "data")
    FAISS_INDEX_PATH: str = str(BASE_DIR / "data" / "faiss_index")
    BM25_INDEX_PATH: str = str(BASE_DIR / "data" / "bm25_index")
    
    # CORS
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    model_config = SettingsConfigDict(
        env_file=(str(BASE_DIR / ".env"), str(BASE_DIR / ".env.local")),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def get_device(self) -> str:
        if self.DEVICE == "auto":
            if torch.cuda.is_available():
                return "cuda"
            elif torch.backends.mps.is_available():
                return "mps"
            else:
                return "cpu"
        return self.DEVICE

# Singleton instance
settings = Settings()

# Ensure directories exist
os.makedirs(settings.DATA_DIR, exist_ok=True)
os.makedirs(settings.FAISS_INDEX_PATH, exist_ok=True)
os.makedirs(settings.BM25_INDEX_PATH, exist_ok=True)
