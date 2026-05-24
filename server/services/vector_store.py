import os
import faiss
import pickle
import logging
import numpy as np
from typing import List, Dict, Tuple, Any
from server.config import settings
from server.services.chunker import Chunk

logger = logging.getLogger("webrag.vector_store")

class FAISSVectorStore:
    def __init__(self):
        self.index_dir = settings.FAISS_INDEX_PATH
        self.index_file = os.path.join(self.index_dir, "index.faiss")
        self.meta_file = os.path.join(self.index_dir, "metadata.pkl")
        
        self.index = None
        self.metadata = {}  # int_id (str) -> Chunk dict
        self.id_counter = 0
        
        self.load()

    def load(self):
        """Loads FAISS index and metadata from disk."""
        if os.path.exists(self.index_file) and os.path.exists(self.meta_file):
            try:
                self.index = faiss.read_index(self.index_file)
                with open(self.meta_file, "rb") as f:
                    data = pickle.load(f)
                    self.metadata = data.get("metadata", {})
                    self.id_counter = data.get("id_counter", 0)
                logger.info(f"Loaded FAISS index with {self.index.ntotal} vectors from {self.index_file}")
            except Exception as e:
                logger.error(f"Error loading FAISS index: {e}. Reinitializing index.")
                self.index = None
                self.metadata = {}
                self.id_counter = 0
        else:
            logger.info("No existing FAISS index found. Initialize new index on first insertion.")

    def save(self):
        """Saves FAISS index and metadata to disk."""
        if self.index is None:
            return
            
        try:
            os.makedirs(self.index_dir, exist_ok=True)
            faiss.write_index(self.index, self.index_file)
            with open(self.meta_file, "wb") as f:
                pickle.dump({
                    "metadata": self.metadata,
                    "id_counter": self.id_counter
                }, f)
            logger.info(f"Saved FAISS index with {self.index.ntotal} vectors to {self.index_file}")
        except Exception as e:
            logger.error(f"Error saving FAISS index: {e}")

    def add_chunks(self, chunks: List[Chunk], embeddings: np.ndarray):
        """Adds document chunks and their embeddings to the vector store."""
        if len(chunks) == 0 or len(embeddings) == 0:
            return
            
        dimension = embeddings.shape[1]
        
        # Initialize index if it doesn't exist
        if self.index is None:
            # We use IndexFlatIP (Inner Product) on normalized vectors, which is cosine similarity
            base_index = faiss.IndexFlatIP(dimension)
            # Wrap in IndexIDMap to allow arbitrary ID indexing
            self.index = faiss.IndexIDMap(base_index)
            
        # Prepare IDs
        faiss_ids = []
        for chunk in chunks:
            self.id_counter += 1
            faiss_ids.append(self.id_counter)
            # Store chunk details
            self.metadata[str(self.id_counter)] = {
                "id": chunk.id,
                "text": chunk.text,
                "source": chunk.source,
                "chunk_index": chunk.chunk_index,
                "file_id": chunk.file_id,
                "metadata": chunk.metadata
            }
            
        faiss_ids_arr = np.array(faiss_ids, dtype=np.int64)
        
        # Ensure embeddings are float32
        embeddings_f32 = embeddings.astype(np.float32)
        
        # Add to index
        self.index.add_with_ids(embeddings_f32, faiss_ids_arr)
        self.save()

    def delete_by_file_id(self, file_id: str):
        """Deletes all chunks and vectors associated with a file ID."""
        if self.index is None or len(self.metadata) == 0:
            return
            
        ids_to_remove = []
        for faiss_id_str, chunk in list(self.metadata.items()):
            if chunk.get("file_id") == file_id:
                ids_to_remove.append(int(faiss_id_str))
                del self.metadata[faiss_id_str]
                
        if ids_to_remove:
            ids_arr = np.array(ids_to_remove, dtype=np.int64)
            # FAISS IndexIDMap remove_ids takes an ID selector
            self.index.remove_ids(ids_arr)
            self.save()
            logger.info(f"Deleted {len(ids_to_remove)} vectors associated with file_id: {file_id}")

    def clear(self):
        """Clears all vectors and metadata."""
        self.index = None
        self.metadata = {}
        self.id_counter = 0
        if os.path.exists(self.index_file):
            os.remove(self.index_file)
        if os.path.exists(self.meta_file):
            os.remove(self.meta_file)
        logger.info("Cleared FAISS index and metadata.")

    def search(self, query_vector: np.ndarray, top_k: int = None) -> List[Tuple[Dict[str, Any], float]]:
        """Searches vector store for top_k most similar vectors. Returns (chunk_dict, score)."""
        if self.index is None or self.index.ntotal == 0:
            return []
            
        if top_k is None:
            top_k = settings.TOP_K
            
        # Limit top_k to total vector count
        top_k = min(top_k, self.index.ntotal)
        
        # Reshape query to 2D
        query_2d = query_vector.reshape(1, -1).astype(np.float32)
        
        # FAISS search
        scores, indices = self.index.search(query_2d, top_k)
        
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1:
                continue
            idx_str = str(idx)
            if idx_str in self.metadata:
                results.append((self.metadata[idx_str], float(score)))
                
        return results

    def get_stats(self) -> dict:
        return {
            "total_vectors": self.index.ntotal if self.index is not None else 0,
            "id_counter": self.id_counter,
            "dimension": self.index.d if self.index is not None else 0
        }

# Singleton instance
vector_store = FAISSVectorStore()
