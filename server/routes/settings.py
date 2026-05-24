import os
import logging
from fastapi import APIRouter, HTTPException
from typing import Any
from server.config import settings, BASE_DIR
from server.services.model_pool import model_pool
from server.services.vector_store import vector_store
from server.services.bm25_store import bm25_store
from server.models import SettingsUpdate, HealthResponse, StatusResponse

logger = logging.getLogger("webrag.routes.settings")
router = APIRouter(prefix="/api", tags=["settings"])

@router.get("/settings")
async def get_settings():
    """Returns the current backend configuration."""
    return {
        "llm_provider": settings.LLM_PROVIDER,
        "ollama_model": settings.OLLAMA_MODEL,
        "ollama_url": settings.OLLAMA_BASE_URL,
        "openai_model": settings.OPENAI_MODEL,
        "openrouter_model": settings.OPENROUTER_MODEL,
        "has_openai_key": bool(settings.OPENAI_API_KEY),
        "has_openrouter_key": bool(settings.OPENROUTER_API_KEY),
        "embedding_model": settings.EMBEDDING_MODEL,
        "reranker_model": settings.RERANKER_MODEL,
        "chunk_size": settings.CHUNK_SIZE,
        "chunk_overlap": settings.CHUNK_OVERLAP,
        "enable_hyde": settings.ENABLE_HYDE,
        "enable_multi_query": settings.ENABLE_MULTI_QUERY,
        "enable_mmr": settings.ENABLE_MMR,
        "enable_compression": settings.ENABLE_COMPRESSION,
        "device": settings.get_device()
    }

def update_env_local(updates: dict[str, Any]):
    """Saves updated settings to .env.local to persist them across server restarts."""
    env_local_path = os.path.join(BASE_DIR, ".env.local")
    
    # Read existing variables
    existing_lines = []
    if os.path.exists(env_local_path):
        with open(env_local_path, "r", encoding="utf-8") as f:
            existing_lines = f.readlines()
            
    # Parse existing env
    env_dict = {}
    for line in existing_lines:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env_dict[k.strip()] = v.strip()
            
    # Merge updates
    for k, v in updates.items():
        env_dict[k] = str(v)
        
    # Write back
    with open(env_local_path, "w", encoding="utf-8") as f:
        f.write("# WebRAG Persistent Settings - Auto Generated\n")
        for k, v in sorted(env_dict.items()):
            f.write(f"{k}={v}\n")

@router.put("/settings", response_model=StatusResponse)
async def update_settings(updates: SettingsUpdate):
    """Updates backend configuration dynamically and saves to .env.local."""
    env_updates = {}
    
    if updates.llm_provider is not None:
        settings.LLM_PROVIDER = updates.llm_provider
        env_updates["LLM_PROVIDER"] = updates.llm_provider
        
    if updates.ollama_model is not None:
        settings.OLLAMA_MODEL = updates.ollama_model
        env_updates["OLLAMA_MODEL"] = updates.ollama_model
        
    if updates.ollama_url is not None:
        settings.OLLAMA_BASE_URL = updates.ollama_url
        env_updates["OLLAMA_BASE_URL"] = updates.ollama_url
        
    if updates.openai_key is not None:
        settings.OPENAI_API_KEY = updates.openai_key
        env_updates["OPENAI_API_KEY"] = updates.openai_key
        
    if updates.openai_model is not None:
        settings.OPENAI_MODEL = updates.openai_model
        env_updates["OPENAI_MODEL"] = updates.openai_model
        
    if updates.openrouter_key is not None:
        settings.OPENROUTER_API_KEY = updates.openrouter_key
        env_updates["OPENROUTER_API_KEY"] = updates.openrouter_key
        
    if updates.enable_hyde is not None:
        settings.ENABLE_HYDE = updates.enable_hyde
        env_updates["ENABLE_HYDE"] = str(updates.enable_hyde).lower()
        
    if updates.enable_multi_query is not None:
        settings.ENABLE_MULTI_QUERY = updates.enable_multi_query
        env_updates["ENABLE_MULTI_QUERY"] = str(updates.enable_multi_query).lower()
        
    if updates.enable_mmr is not None:
        settings.ENABLE_MMR = updates.enable_mmr
        env_updates["ENABLE_MMR"] = str(updates.enable_mmr).lower()
        
    if updates.enable_compression is not None:
        settings.ENABLE_COMPRESSION = updates.enable_compression
        env_updates["ENABLE_COMPRESSION"] = str(updates.enable_compression).lower()
        
    # Write to file
    if env_updates:
        try:
            update_env_local(env_updates)
        except Exception as e:
            logger.error(f"Failed to persist settings to .env.local: {e}")
            
    return StatusResponse(status="success", message="Settings updated successfully.")

@router.get("/health", response_model=HealthResponse)
async def get_health():
    """Returns backend system status, hardware info, and indexing statistics."""
    pool_info = model_pool.get_info()
    vec_stats = vector_store.get_stats()
    bm25_stats = bm25_store.get_stats()
    
    # Calculate loaded models
    loaded = []
    if model_pool.embedding_model is not None:
        loaded.append("embedding")
    if model_pool.reranker_model is not None:
        loaded.append("reranker")
        
    # Calculate total files count from vector store metadata
    meta_dict = vector_store.metadata
    files_count = len(set(chunk.get("file_id") for chunk in meta_dict.values() if chunk.get("file_id")))

    return HealthResponse(
        status="healthy",
        device=pool_info["device"],
        gpu_name=pool_info["gpu_name"],
        memory_total=None, # In Windows, querying total memory programmatically takes wmic or similar, let's keep it simple
        models_loaded=loaded,
        total_files=files_count,
        total_chunks=vec_stats["total_vectors"]
    )
