import logging
import numpy as np
from typing import List
from server.services.model_pool import model_pool
from server.config import settings

logger = logging.getLogger("webrag.embedder")

class Embedder:
    def __init__(self):
        pass

    def embed_documents(self, texts: List[str], batch_size: int = 32) -> np.ndarray:
        """Embeds a list of document chunks, normalizing them to unit length."""
        if not texts:
            return np.empty((0, 0))

        logger.info(f"Embedding {len(texts)} chunks (batch_size={batch_size})...")
        model = model_pool.get_embedding_model()
        
        # sentence-transformers encode method can take batch_size and returns numpy array
        embeddings = model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=False,
            normalize_embeddings=True
        )
        return np.array(embeddings, dtype=np.float32)

    def embed_query(self, query: str) -> np.ndarray:
        """Embeds a single search query, with BGE query instruction if applicable."""
        model = model_pool.get_embedding_model()
        
        # Check if BGE is used and prepend query instruction as recommended by BAAI
        processed_query = query
        if "bge-" in settings.EMBEDDING_MODEL.lower():
            # Standard query instruction for BGE retrieval models
            processed_query = f"Represent this sentence for searching relevant passages: {query}"
            logger.debug("BGE query instruction applied.")

        embedding = model.encode(
            processed_query,
            show_progress_bar=False,
            normalize_embeddings=True
        )
        return np.array(embedding, dtype=np.float32)

# Singleton instance
embedder = Embedder()
