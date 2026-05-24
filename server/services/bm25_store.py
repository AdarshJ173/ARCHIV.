import os
import re
import pickle
import logging
import math
from typing import List, Dict, Tuple, Any
from server.config import settings
from server.services.chunker import Chunk

logger = logging.getLogger("webrag.bm25_store")

# Fallback stop words in case NLTK download is unavailable
FALLBACK_STOPWORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't", "as", "at",
    "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can't", "cannot", "could",
    "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during", "each", "few", "for",
    "from", "further", "had", "hadn't", "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's",
    "her", "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm",
    "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't",
    "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours",
    "ourselves", "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't",
    "so", "some", "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there",
    "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to", "too",
    "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were", "weren't",
    "what", "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's",
    "with", "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself",
    "yourselves"
}

class BM25Store:
    def __init__(self):
        self.index_dir = settings.BM25_INDEX_PATH
        self.index_file = os.path.join(self.index_dir, "bm25.pkl")
        
        # Load stemmer and stopwords
        self.stemmer = None
        self.stopwords = FALLBACK_STOPWORDS
        
        try:
            from nltk.stem import PorterStemmer
            self.stemmer = PorterStemmer()
        except ImportError:
            logger.warning("NLTK PorterStemmer not available. Using simple lowercase stemming fallback.")
            
        try:
            from nltk.corpus import stopwords
            self.stopwords = set(stopwords.words("english"))
        except Exception:
            logger.info("Using fallback English stop words list.")

        # BM25 State
        self.documents = {}  # chunk_id -> Chunk dict
        self.doc_lens = {}   # chunk_id -> int
        self.vocab = {}      # term -> doc_frequency (how many docs have this term)
        self.term_freqs = {} # chunk_id -> {term -> count}
        self.avg_doc_len = 0.0
        
        # BM25 parameters
        self.k1 = 1.5
        self.b = 0.75
        
        self.load()

    def load(self):
        """Loads BM25 store from disk."""
        if os.path.exists(self.index_file):
            try:
                with open(self.index_file, "rb") as f:
                    state = pickle.load(f)
                    self.documents = state.get("documents", {})
                    self.doc_lens = state.get("doc_lens", {})
                    self.vocab = state.get("vocab", {})
                    self.term_freqs = state.get("term_freqs", {})
                    self.avg_doc_len = state.get("avg_doc_len", 0.0)
                logger.info(f"Loaded BM25 index with {len(self.documents)} documents from {self.index_file}")
            except Exception as e:
                logger.error(f"Error loading BM25 index: {e}. Reinitializing.")
                self._reset_state()
        else:
            logger.info("No existing BM25 index found. Initializing new index.")

    def _reset_state(self):
        self.documents = {}
        self.doc_lens = {}
        self.vocab = {}
        self.term_freqs = {}
        self.avg_doc_len = 0.0

    def save(self):
        """Saves BM25 store to disk."""
        try:
            os.makedirs(self.index_dir, exist_ok=True)
            with open(self.index_file, "wb") as f:
                pickle.dump({
                    "documents": self.documents,
                    "doc_lens": self.doc_lens,
                    "vocab": self.vocab,
                    "term_freqs": self.term_freqs,
                    "avg_doc_len": self.avg_doc_len
                }, f)
            logger.info(f"Saved BM25 index with {len(self.documents)} documents to {self.index_file}")
        except Exception as e:
            logger.error(f"Error saving BM25 index: {e}")

    def _tokenize(self, text: str) -> List[str]:
        """Splits, cleans, and stems text into terms."""
        # Convert to lower case and split by word characters
        words = re.findall(r"\b\w+\b", text.lower())
        terms = []
        for w in words:
            if w in self.stopwords or len(w) <= 1:
                continue
            
            # Stemming
            term = self.stemmer.stem(w) if self.stemmer else w
            terms.append(term)
        return terms

    def add_chunks(self, chunks: List[Chunk]):
        """Adds document chunks to the BM25 store."""
        if not chunks:
            return
            
        for chunk in chunks:
            terms = self._tokenize(chunk.text)
            if not terms:
                continue
                
            chunk_id = chunk.id
            self.documents[chunk_id] = {
                "id": chunk.id,
                "text": chunk.text,
                "source": chunk.source,
                "chunk_index": chunk.chunk_index,
                "file_id": chunk.file_id,
                "metadata": chunk.metadata
            }
            self.doc_lens[chunk_id] = len(terms)
            
            # Calculate term frequencies for this chunk
            freqs = {}
            for term in terms:
                freqs[term] = freqs.get(term, 0) + 1
            self.term_freqs[chunk_id] = freqs
            
            # Update vocabulary document frequency
            for term in freqs.keys():
                self.vocab[term] = self.vocab.get(term, 0) + 1
                
        # Recalculate average doc length
        if self.doc_lens:
            self.avg_doc_len = sum(self.doc_lens.values()) / len(self.doc_lens)
            
        self.save()

    def delete_by_file_id(self, file_id: str):
        """Deletes all chunks associated with a file ID and updates vocabulary."""
        if not self.documents:
            return
            
        chunks_to_remove = []
        for chunk_id, chunk in list(self.documents.items()):
            if chunk.get("file_id") == file_id:
                chunks_to_remove.append(chunk_id)
                
        if not chunks_to_remove:
            return
            
        for chunk_id in chunks_to_remove:
            # Decrement vocab counts
            if chunk_id in self.term_freqs:
                for term in self.term_freqs[chunk_id].keys():
                    if term in self.vocab:
                        self.vocab[term] -= 1
                        if self.vocab[term] <= 0:
                            del self.vocab[term]
                            
            # Delete entries
            del self.documents[chunk_id]
            del self.doc_lens[chunk_id]
            if chunk_id in self.term_freqs:
                del self.term_freqs[chunk_id]
                
        # Recalculate average doc length
        if self.doc_lens:
            self.avg_doc_len = sum(self.doc_lens.values()) / len(self.doc_lens)
        else:
            self.avg_doc_len = 0.0
            
        self.save()
        logger.info(f"Deleted {len(chunks_to_remove)} BM25 document records for file_id: {file_id}")

    def clear(self):
        """Clears index state."""
        self._reset_state()
        if os.path.exists(self.index_file):
            os.remove(self.index_file)
        logger.info("Cleared BM25 store.")

    def search(self, query: str, top_k: int = None) -> List[Tuple[Dict[str, Any], float]]:
        """Searches BM25 index for query. Returns list of (chunk_dict, score)."""
        if not self.documents or not query:
            return []
            
        if top_k is None:
            top_k = settings.TOP_K
            
        query_terms = self._tokenize(query)
        if not query_terms:
            return []
            
        scores = {}
        N = len(self.documents)
        
        for term in query_terms:
            if term not in self.vocab:
                continue
                
            n_q = self.vocab[term]
            
            # Okapi BM25 IDF formulation
            idf = math.log((N - n_q + 0.5) / (n_q + 0.5) + 1.0)
            
            for chunk_id, freqs in self.term_freqs.items():
                if term not in freqs:
                    continue
                    
                f = freqs[term]
                d_len = self.doc_lens[chunk_id]
                
                # Okapi BM25 score term
                numerator = f * (self.k1 + 1)
                denominator = f + self.k1 * (1 - self.b + self.b * (d_len / (self.avg_doc_len or 1.0)))
                
                score = idf * (numerator / denominator)
                scores[chunk_id] = scores.get(chunk_id, 0.0) + score
                
        # Sort and return top K
        sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_k]
        
        results = []
        for chunk_id, score in sorted_scores:
            results.append((self.documents[chunk_id], score))
            
        return results

    def get_stats(self) -> dict:
        return {
            "total_documents": len(self.documents),
            "vocab_size": len(self.vocab),
            "avg_doc_len": self.avg_doc_len
        }

# Singleton instance
bm25_store = BM25Store()
