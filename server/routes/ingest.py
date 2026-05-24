import os
import time
import shutil
import uuid
import logging
from typing import List, Dict, Any, Tuple
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from server.config import settings
from server.services.parser import DocumentParser
from server.services.chunker import chunker
from server.services.embedder import embedder
from server.services.vector_store import vector_store
from server.services.bm25_store import bm25_store
from server.models import FileMetadata, StatusResponse

logger = logging.getLogger("webrag.routes.ingest")
router = APIRouter(prefix="/api/ingest", tags=["ingest"])

# Global upload/index status tracker
indexing_status = {
    "status": "idle",
    "total_files": 0,
    "processed_files": 0,
    "total_chunks": 0,
    "progress": 0,
    "message": ""
}

def process_upload_files(temp_filepaths: List[Tuple[str, str, int]]):
    """Background task to parse, chunk, embed, and index files with granular progress reporting."""
    global indexing_status
    indexing_status["status"] = "indexing"
    indexing_status["total_files"] = len(temp_filepaths)
    indexing_status["processed_files"] = 0
    indexing_status["progress"] = 0
    
    total_new_chunks = 0
    total_files = len(temp_filepaths)
    
    try:
        for idx, (temp_path, filename, file_size) in enumerate(temp_filepaths):
            file_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{filename}_{file_size}_{os.path.getmtime(temp_path)}"))
            
            # Check if already indexed. If so, delete it first to re-index
            vector_store.delete_by_file_id(file_id)
            bm25_store.delete_by_file_id(file_id)
            
            # File progress bounds: each file represents a segment of the 0-100% space
            file_start_pct = int((idx / total_files) * 100)
            file_progress_range = 100 / total_files
            
            # Step 1: Parsing (10% of this file's progress)
            indexing_status["message"] = f"Parsing file contents of {filename}..."
            indexing_status["progress"] = int(file_start_pct + file_progress_range * 0.1)
            
            try:
                # 1. Parse document
                parsed_doc = DocumentParser.parse_file(temp_path, filename=filename)
                
                # Step 2: Chunking (25% of this file's progress)
                indexing_status["message"] = f"Splitting {filename} into semantic sections..."
                indexing_status["progress"] = int(file_start_pct + file_progress_range * 0.25)
                
                # 2. Chunk document
                doc_metadata = {
                    "size": file_size,
                    "uploaded_at": time.time(),
                }
                chunks = chunker.chunk_document(parsed_doc.text, filename, file_id, doc_metadata)
                
                if not chunks:
                    logger.warning(f"No chunks extracted from file {filename}.")
                    os.remove(temp_path)
                    indexing_status["processed_files"] += 1
                    indexing_status["progress"] = int(file_start_pct + file_progress_range)
                    continue
                
                # Step 3: Generate embeddings (40% to 80% of this file's progress)
                indexing_status["message"] = f"Running ML embeddings on {len(chunks)} chunks for {filename}..."
                indexing_status["progress"] = int(file_start_pct + file_progress_range * 0.4)
                
                chunk_texts = [c.text for c in chunks]
                embeddings = embedder.embed_documents(chunk_texts)
                
                # Step 4: Save to vector and BM25 stores (85% of this file's progress)
                indexing_status["message"] = f"Indexing and caching search indexes for {filename}..."
                indexing_status["progress"] = int(file_start_pct + file_progress_range * 0.85)
                
                vector_store.add_chunks(chunks, embeddings)
                bm25_store.add_chunks(chunks)
                
                total_new_chunks += len(chunks)
                indexing_status["total_chunks"] += len(chunks)
                
            except Exception as file_error:
                logger.error(f"Failed to process file {filename}: {file_error}")
                
            finally:
                # Clean up temporary file
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                    
            indexing_status["processed_files"] += 1
            indexing_status["progress"] = int(((idx + 1) / total_files) * 100)

        indexing_status["status"] = "ready"
        indexing_status["progress"] = 100
        indexing_status["message"] = f"Indexed {total_files} files ({total_new_chunks} chunks)."
        
    except Exception as e:
        logger.error(f"Error in background ingestion task: {e}")
        indexing_status["status"] = "error"
        indexing_status["message"] = f"Ingestion failed: {str(e)}"
        
    finally:
        # Reset back to idle after a few seconds delay
        time.sleep(5)
        if indexing_status["status"] in ["ready", "error"]:
            indexing_status["status"] = "idle"
            indexing_status["progress"] = 0
            indexing_status["message"] = ""

@router.post("/files")
async def ingest_files(background_tasks: BackgroundTasks, files: List[UploadFile] = File(...)):
    """Receives uploaded files, saves them temporarily, and triggers background processing."""
    global indexing_status
    if indexing_status["status"] == "indexing":
        raise HTTPException(status_code=400, detail="An indexing task is already in progress.")
        
    temp_dir = os.path.join(settings.DATA_DIR, "temp")
    os.makedirs(temp_dir, exist_ok=True)
    
    temp_filepaths = []
    for file in files:
        temp_path = os.path.join(temp_dir, file.filename)
        with open(temp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
            
        file_size = os.path.getsize(temp_path)
        temp_filepaths.append((temp_path, file.filename, file_size))
        
    # Start ingestion in the background
    background_tasks.add_task(process_upload_files, temp_filepaths)
    
    return {"message": "Upload complete. Processing files in the background.", "files_count": len(files)}

@router.get("/status")
async def get_ingest_status():
    """Returns current indexing progress."""
    return indexing_status

@router.get("/files", response_model=List[FileMetadata])
async def get_indexed_files():
    """Lists all files that have been successfully indexed."""
    # Deduplicate files from vector store metadata
    files_map = {}
    meta_dict = vector_store.metadata
    
    for chunk in meta_dict.values():
        file_id = chunk.get("file_id")
        if not file_id:
            continue
            
        chunk_meta = chunk.get("metadata", {})
        
        if file_id not in files_map:
            files_map[file_id] = {
                "id": file_id,
                "name": chunk.get("source"),
                "size": chunk_meta.get("size", 0),
                "chunks_count": 0,
                "uploaded_at": chunk_meta.get("uploaded_at", time.time())
            }
        files_map[file_id]["chunks_count"] += 1
        
    return list(files_map.values())

@router.delete("/files/{file_id}", response_model=StatusResponse)
async def delete_file(file_id: str):
    """Deletes all chunks and vectors associated with a file ID."""
    try:
        vector_store.delete_by_file_id(file_id)
        bm25_store.delete_by_file_id(file_id)
        return StatusResponse(status="success", message=f"Successfully deleted file {file_id} from index.")
    except Exception as e:
        logger.error(f"Error deleting file {file_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/all", response_model=StatusResponse)
async def clear_all_indexes():
    """Deletes the entire index and resets state."""
    try:
        vector_store.clear()
        bm25_store.clear()
        return StatusResponse(status="success", message="All indexes cleared successfully.")
    except Exception as e:
        logger.error(f"Error clearing indexes: {e}")
        raise HTTPException(status_code=500, detail=str(e))
