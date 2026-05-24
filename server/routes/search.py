import json
import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse
from server.config import settings
from server.services.search import search_pipeline
from server.services.llm import llm_router
from server.services.embedder import embedder
from server.models import QueryRequest, SearchResultModel, SearchResponse

logger = logging.getLogger("webrag.routes.search")
router = APIRouter(prefix="/api/search", tags=["search"])

def build_rag_prompt(question: str, contexts: List[Dict[str, Any]]) -> str:
    """Builds the prompt injecting contexts for the RAG LLM query."""
    ctx_parts = []
    for c in contexts:
        ctx_parts.append(f"From {c['source']}:\n{c['text']}")
        
    ctx = "\n\n---\n\n".join(ctx_parts)
    return (
        "You are an expert researcher. Answer using ONLY the provided transcript context.\n"
        "Be detailed, accurate, and comprehensive.\n"
        "Cite the specific source filename after each relevant statement in parentheses.\n"
        "If the context does not contain the answer, say so — do not make up information.\n\n"
        f"Context:\n{ctx}\n\n"
        f"Question: {question}\n\n"
        "Answer:"
    )

@router.post("")
async def search_and_stream(request: QueryRequest):
    """Hybrid search + SSE LLM streaming answer generation."""
    try:
        # 1. Retrieve relevant contexts using search pipeline
        contexts = search_pipeline.search(
            query=request.query,
            limit=request.limit,
            enable_hyde=request.hyde,
            enable_multi_query=request.multi_query,
            enable_mmr=request.mmr,
            enable_compression=request.compression
        )
        
        async def event_generator():
            # Send retrieved sources to UI first
            yield {
                "event": "sources",
                "data": json.dumps(contexts)
            }
            
            # Send status update
            yield {
                "event": "status",
                "data": "Generating response..."
            }
            
            # If no context found, notify UI and answer
            if not contexts:
                yield {
                    "event": "token",
                    "data": "I searched your documents but couldn't find any relevant context to answer your question."
                }
                yield {"event": "done", "data": ""}
                return
                
            # Build full prompt
            prompt = build_rag_prompt(request.query, contexts)
            system_prompt = (
                "You are an expert researcher. Answer using ONLY the provided transcript context. "
                "Cite filenames in parentheses after statements."
            )
            
            # Stream response from LLM Router
            for chunk in llm_router.stream_response(
                prompt=prompt,
                system_prompt=system_prompt,
                history=request.history,
                provider=request.provider,
                custom_model=request.model
            ):
                if chunk["event"] == "token":
                    yield {
                        "event": "token",
                        "data": chunk["data"]
                    }
                elif chunk["event"] == "error":
                    yield {
                        "event": "error",
                        "data": chunk["data"]
                    }
                    
            yield {"event": "done", "data": ""}

        return EventSourceResponse(event_generator())
        
    except Exception as e:
        logger.error(f"Error in search and stream route: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/retrieve", response_model=List[SearchResultModel])
async def retrieve_only(request: QueryRequest):
    """Retrieval endpoint for fetching chunks without LLM generation (for debugging)."""
    try:
        contexts = search_pipeline.search(
            query=request.query,
            limit=request.limit,
            enable_hyde=request.hyde,
            enable_multi_query=request.multi_query,
            enable_mmr=request.mmr,
            enable_compression=request.compression
        )
        
        # Convert to Pydantic models
        results = []
        for ctx in contexts:
            results.append(SearchResultModel(
                id=ctx["id"],
                text=ctx["text"],
                source=ctx["source"],
                score=ctx["score"]
            ))
        return results
    except Exception as e:
        logger.error(f"Error in retrieve endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/embed")
async def generate_query_embedding(query: str):
    """Utility endpoint to generate query embeddings."""
    try:
        embedding = embedder.embed_query(query)
        return {"embedding": embedding.tolist()}
    except Exception as e:
        logger.error(f"Error in embed endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))
