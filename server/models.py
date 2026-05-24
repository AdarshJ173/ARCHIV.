from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class ChunkResponse(BaseModel):
    id: str
    text: str
    source: str
    chunk_index: int
    file_id: str

class SearchResultModel(BaseModel):
    id: str
    text: str
    source: str
    score: float

class QueryRequest(BaseModel):
    query: str
    limit: int = 10
    filters: Optional[Dict[str, Any]] = None
    hyde: Optional[bool] = None
    multi_query: Optional[bool] = None
    mmr: Optional[bool] = None
    compression: Optional[bool] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    history: Optional[List[Dict[str, str]]] = None

class SearchResponse(BaseModel):
    answer: str
    sources: List[SearchResultModel]

class FileMetadata(BaseModel):
    id: str
    name: str
    size: int
    chunks_count: int
    uploaded_at: float

class StatusResponse(BaseModel):
    status: str
    message: str

class SettingsUpdate(BaseModel):
    llm_provider: Optional[str] = None
    ollama_model: Optional[str] = None
    ollama_url: Optional[str] = None
    openai_key: Optional[str] = None
    openai_model: Optional[str] = None
    openrouter_key: Optional[str] = None
    enable_hyde: Optional[bool] = None
    enable_multi_query: Optional[bool] = None
    enable_mmr: Optional[bool] = None
    enable_compression: Optional[bool] = None

class HealthResponse(BaseModel):
    status: str
    device: str
    gpu_name: Optional[str] = None
    memory_total: Optional[float] = None
    models_loaded: List[str]
    total_files: int
    total_chunks: int
