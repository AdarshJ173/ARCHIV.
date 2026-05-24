import logging
import numpy as np
from typing import List, Dict, Tuple, Any, Optional
from server.config import settings
from server.services.embedder import embedder
from server.services.vector_store import vector_store
from server.services.bm25_store import bm25_store
from server.services.model_pool import model_pool
from server.services.llm import llm_router

logger = logging.getLogger("webrag.search")

class HybridSearchPipeline:
    def __init__(self):
        pass

    def _normalize_scores(self, results: List[Tuple[Dict[str, Any], float]]) -> List[Tuple[Dict[str, Any], float]]:
        """Min-max normalizes scores in a result list to [0, 1] range."""
        if not results:
            return []
        
        scores = [score for _, score in results]
        min_score = min(scores)
        max_score = max(scores)
        
        if max_score == min_score:
            return [(doc, 1.0) for doc, _ in results]
            
        normalized = []
        for doc, score in results:
            norm_score = (score - min_score) / (max_score - min_score)
            normalized.append((doc, norm_score))
        return normalized

    def _reciprocal_rank_fusion(
        self, 
        vector_results: List[Tuple[Dict[str, Any], float]], 
        bm25_results: List[Tuple[Dict[str, Any], float]],
        rrf_k: int = 60,
        vector_weight: float = 0.5,
        bm25_weight: float = 0.5
    ) -> List[Tuple[Dict[str, Any], float]]:
        """Fuses two lists of ranked results using Reciprocal Rank Fusion (RRF)."""
        fused_scores = {}
        doc_map = {}
        
        # Helper to process a ranked list
        def process_list(results, weight):
            for rank, (doc, _) in enumerate(results):
                doc_id = doc["id"]
                doc_map[doc_id] = doc
                
                # RRF formula
                score = weight * (1.0 / (rrf_k + rank + 1))
                fused_scores[doc_id] = fused_scores.get(doc_id, 0.0) + score
                
        process_list(vector_results, vector_weight)
        process_list(bm25_results, bm25_weight)
        
        # Sort by fused score
        sorted_fused = sorted(fused_scores.items(), key=lambda x: x[1], reverse=True)
        
        return [(doc_map[doc_id], score) for doc_id, score in sorted_fused]

    def _maximal_marginal_relevance(
        self,
        candidates: List[Dict[str, Any]],
        query_vector: np.ndarray,
        lambda_val: float = 0.7,
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """Applies MMR to diversify retrieved documents."""
        if not candidates or len(candidates) <= 1:
            return candidates
            
        # Get embeddings for all candidates
        texts = [doc["text"] for doc in candidates]
        try:
            doc_embeddings = embedder.embed_documents(texts)
        except Exception as e:
            logger.error(f"Error embedding docs in MMR: {e}. Skipping MMR.")
            return candidates[:top_k]
            
        selected_indices = []
        candidate_indices = list(range(len(candidates)))
        
        # Step 1: Find document most similar to query
        query_similarities = np.dot(doc_embeddings, query_vector)
        first_selected = np.argmax(query_similarities)
        selected_indices.append(first_selected)
        candidate_indices.remove(first_selected)
        
        # Step 2: Iteratively select items that maximize MMR formula
        while len(selected_indices) < top_k and candidate_indices:
            best_mmr_score = -float("inf")
            best_idx = -1
            
            for idx in candidate_indices:
                # Sim to query
                sim_to_query = query_similarities[idx]
                
                # Sim to already selected items
                selected_embs = doc_embeddings[selected_indices]
                this_emb = doc_embeddings[idx]
                sims_to_selected = np.dot(selected_embs, this_emb)
                max_sim_to_selected = np.max(sims_to_selected)
                
                # MMR formula
                mmr_score = lambda_val * sim_to_query - (1 - lambda_val) * max_sim_to_selected
                
                if mmr_score > best_mmr_score:
                    best_mmr_score = mmr_score
                    best_idx = idx
                    
            if best_idx != -1:
                selected_indices.append(best_idx)
                candidate_indices.remove(best_idx)
            else:
                break
                
        return [candidates[idx] for idx in selected_indices]

    def _expand_sentence_window(self, chunk: Dict[str, Any], window_size: int = 2) -> str:
        """Expands a chunk's text to include ±window_size surrounding context chunks."""
        file_id = chunk.get("file_id")
        chunk_index = chunk.get("chunk_index")
        
        if file_id is None or chunk_index is None:
            return chunk["text"]
            
        # Gather all chunk keys in range
        surrounding_texts = []
        
        # We can look up adjacent chunks in vector_store.metadata or bm25_store.documents
        # Both stores share the same mapping. Let's look up in vector_store metadata
        meta_dict = vector_store.metadata
        
        # Sort range to ensure left-to-right order
        for idx in range(max(0, chunk_index - window_size), chunk_index + window_size + 1):
            # Check if this chunk is indexed
            found = False
            for chunk_data in meta_dict.values():
                if chunk_data.get("file_id") == file_id and chunk_data.get("chunk_index") == idx:
                    surrounding_texts.append(chunk_data["text"])
                    found = True
                    break
            
            # Fallback to BM25 documents if FAISS didn't have it (should be identical, but safe)
            if not found:
                for chunk_data in bm25_store.documents.values():
                    if chunk_data.get("file_id") == file_id and chunk_data.get("chunk_index") == idx:
                        surrounding_texts.append(chunk_data["text"])
                        break
                        
        if not surrounding_texts:
            return chunk["text"]
            
        # Join surrounding texts cleanly with double newlines
        return "\n\n".join(surrounding_texts)

    def search(
        self, 
        query: str, 
        limit: int = 5,
        enable_hyde: Optional[bool] = None,
        enable_multi_query: Optional[bool] = None,
        enable_mmr: Optional[bool] = None,
        enable_compression: Optional[bool] = None
    ) -> List[Dict[str, Any]]:
        """Runs the hybrid RAG retrieval pipeline."""
        
        # Default flags to settings if not provided
        run_hyde = settings.ENABLE_HYDE if enable_hyde is None else enable_hyde
        run_mq = settings.ENABLE_MULTI_QUERY if enable_multi_query is None else enable_multi_query
        run_mmr = settings.ENABLE_MMR if enable_mmr is None else enable_mmr
        run_compress = settings.ENABLE_COMPRESSION if enable_compression is None else enable_compression
        
        logger.info(f"Running search for query: '{query}' (limit={limit})")
        
        # Step 1: Query Analysis & Expansion (Multi-Query)
        queries = [query]
        if run_mq:
            try:
                sub_queries = llm_router.generate_sub_queries(query)
                queries.extend(sub_queries)
                # Keep unique queries
                queries = list(dict.fromkeys(queries))
            except Exception as e:
                logger.error(f"Error in multi-query decomposition: {e}")

        # Step 2: Hypothetical Document Embedding (HyDE)
        embedding_query = query
        if run_hyde:
            try:
                embedding_query = llm_router.generate_hyde_doc(query)
            except Exception as e:
                logger.error(f"Error in HyDE document generation: {e}")

        # Step 3: Embed Query (or HyDE document)
        try:
            query_vector = embedder.embed_query(embedding_query)
        except Exception as e:
            logger.error(f"Error generating query embedding: {e}")
            query_vector = None

        # Step 4: Hybrid Search across all queries
        vector_candidates = []
        bm25_candidates = []
        
        for q in queries:
            # Vector Search
            if query_vector is not None:
                # Retrieve slightly more than final limit to allow fusion + reranking room
                vec_res = vector_store.search(query_vector, top_k=limit * 3)
                vector_candidates.extend(vec_res)
            
            # BM25 Search
            bm_res = bm25_store.search(q, top_k=limit * 3)
            bm25_candidates.extend(bm_res)
            
        # Deduplicate candidates within each list, taking highest score
        def deduplicate(candidates):
            dedup = {}
            for doc, score in candidates:
                doc_id = doc["id"]
                if doc_id not in dedup or score > dedup[doc_id][1]:
                    dedup[doc_id] = (doc, score)
            return list(dedup.values())
            
        vector_candidates = deduplicate(vector_candidates)
        bm25_candidates = deduplicate(bm25_candidates)

        # Step 5: Normalize Scores
        vector_normalized = self._normalize_scores(vector_candidates)
        bm25_normalized = self._normalize_scores(bm25_candidates)

        # Step 6: Reciprocal Rank Fusion (RRF)
        fused_results = self._reciprocal_rank_fusion(
            vector_normalized, 
            bm25_normalized,
            rrf_k=settings.RRF_K,
            vector_weight=settings.VECTOR_WEIGHT,
            bm25_weight=settings.BM25_WEIGHT
        )
        
        # Extract documents from fused results
        retrieved_docs = [doc for doc, _ in fused_results]

        # Step 7: MMR Diversification
        if run_mmr and query_vector is not None:
            retrieved_docs = self._maximal_marginal_relevance(
                retrieved_docs,
                query_vector,
                lambda_val=settings.MMR_LAMBDA,
                top_k=limit * 2
            )
        else:
            retrieved_docs = retrieved_docs[:limit * 2]

        # Step 8: Sentence-Window Expansion
        # Expand small chunk contexts to neighboring windows for superior LLM understanding
        expanded_docs = []
        for doc in retrieved_docs:
            expanded_text = self._expand_sentence_window(doc)
            expanded_doc = doc.copy()
            expanded_doc["text"] = expanded_text
            expanded_docs.append(expanded_doc)

        # Step 9: Cross-Encoder Reranking
        # Place the absolute most semantically relevant context at the top
        reranked_docs = []
        try:
            reranker = model_pool.get_reranker_model()
            if reranker and expanded_docs:
                pairs = [(query, doc["text"]) for doc in expanded_docs]
                scores = reranker.predict(pairs)
                
                # Pair and sort
                scored_docs = list(zip(expanded_docs, scores))
                scored_docs.sort(key=lambda x: x[1], reverse=True)
                
                # Format output with reranker score
                for doc, score in scored_docs:
                    doc_copy = doc.copy()
                    # Reranker score is usually logits or probability, map to relevance score
                    # For BGE-reranker, higher is better. Convert to standard 0-1 score or just pass float
                    doc_copy["score"] = float(score)
                    reranked_docs.append(doc_copy)
            else:
                reranked_docs = expanded_docs
        except Exception as e:
            logger.error(f"Error in reranking: {e}. Falling back to default ordering.")
            reranked_docs = expanded_docs

        # Step 10: Limit to requested final K
        final_results = reranked_docs[:limit]
        
        # Format for SearchResult frontend model
        formatted_results = []
        for doc in final_results:
            formatted_results.append({
                "id": doc["id"],
                "text": doc["text"],
                "source": doc["source"],
                # Ensure there is a standard score field
                "score": doc.get("score", 1.0)
            })
            
        logger.info(f"Retrieved {len(formatted_results)} results.")
        return formatted_results

# Singleton instance
search_pipeline = HybridSearchPipeline()
