import re
import uuid
import tiktoken
import logging
from typing import List, Dict, Any
from pydantic import BaseModel
from server.config import settings

logger = logging.getLogger("webrag.chunker")

class Chunk(BaseModel):
    id: str
    text: str
    source: str
    chunk_index: int
    file_id: str
    token_count: int
    metadata: Dict[str, Any]

class RecursiveChunker:
    def __init__(self):
        try:
            self.tokenizer = tiktoken.get_encoding("cl100k_base")
        except Exception as e:
            logger.error(f"Error loading tiktoken tokenizer: {e}. Falling back to fallback tokenizer.")
            self.tokenizer = None

    def get_token_count(self, text: str) -> int:
        if self.tokenizer:
            return len(self.tokenizer.encode(text, disallowed_special=()))
        else:
            # Fallback estimation
            return len(text.split())

    def split_text(self, text: str, chunk_size: int = None, chunk_overlap: int = None) -> List[str]:
        """Recursively splits text into chunks under chunk_size tokens."""
        if chunk_size is None:
            chunk_size = settings.CHUNK_SIZE
        if chunk_overlap is None:
            chunk_overlap = settings.CHUNK_OVERLAP

        separators = ["\n\n\n", "\n\n", "\n", ". ", "? ", "! ", ", ", " ", ""]
        return self._recursive_split(text, separators, chunk_size, chunk_overlap)

    def _recursive_split(self, text: str, separators: List[str], max_tokens: int, overlap_tokens: int) -> List[str]:
        """Helper method that splits text recursively."""
        token_count = self.get_token_count(text)
        if token_count <= max_tokens:
            return [text] if text.strip() else []

        # Find the best separator to use
        separator = ""
        next_separators = []
        for i, sep in enumerate(separators):
            if sep == "" or sep in text:
                separator = sep
                next_separators = separators[i+1:]
                break

        # Split text by separator
        if separator == "":
            # Force split by characters if no separator found
            parts = [text[i:i + max_tokens * 4] for i in range(0, len(text), max_tokens * 4)]
        else:
            if separator in [". ", "? ", "! "]:
                # Preserve the punctuation
                parts = re.split(f"(?<=[.!?])\\s+", text)
            else:
                parts = text.split(separator)

        # Merge parts into chunks of size max_tokens
        chunks = []
        current_chunk_parts = []
        current_tokens = 0

        for part in parts:
            part_tokens = self.get_token_count(part)
            
            # If a single part is larger than max_tokens, split it recursively
            if part_tokens > max_tokens:
                if current_chunk_parts:
                    chunks.append(separator.join(current_chunk_parts))
                    current_chunk_parts = []
                    current_tokens = 0
                
                sub_chunks = self._recursive_split(part, next_separators, max_tokens, overlap_tokens)
                chunks.extend(sub_chunks)
                continue

            if current_tokens + part_tokens + (self.get_token_count(separator) if current_chunk_parts else 0) <= max_tokens:
                current_chunk_parts.append(part)
                current_tokens += part_tokens + (self.get_token_count(separator) if len(current_chunk_parts) > 1 else 0)
            else:
                if current_chunk_parts:
                    chunks.append(separator.join(current_chunk_parts))
                
                # Setup next chunk with overlap
                overlap_parts = []
                overlap_toks = 0
                # Take elements from current_chunk_parts from the end to form overlap
                for rev_part in reversed(current_chunk_parts):
                    rev_tok = self.get_token_count(rev_part)
                    if overlap_toks + rev_tok <= overlap_tokens:
                        overlap_parts.insert(0, rev_part)
                        overlap_toks += rev_tok
                    else:
                        break
                
                current_chunk_parts = overlap_parts + [part]
                current_tokens = self.get_token_count(separator.join(current_chunk_parts))

        if current_chunk_parts:
            chunks.append(separator.join(current_chunk_parts))

        return [c.strip() for c in chunks if c.strip()]

    def chunk_document(self, text: str, source: str, file_id: str, metadata: Dict[str, Any] = None) -> List[Chunk]:
        """Chunks a document and returns a list of Chunk objects."""
        if metadata is None:
            metadata = {}

        raw_chunks = self.split_text(text)
        chunks = []

        for idx, chunk_text in enumerate(raw_chunks):
            chunk_id = f"{file_id}_{idx}"
            token_count = self.get_token_count(chunk_text)
            
            # Add sentence-window parenting metadata
            chunk_meta = metadata.copy()
            chunk_meta["chunk_index"] = idx
            chunk_meta["file_id"] = file_id
            chunk_meta["source"] = source
            
            chunks.append(Chunk(
                id=chunk_id,
                text=chunk_text,
                source=source,
                chunk_index=idx,
                file_id=file_id,
                token_count=token_count,
                metadata=chunk_meta
            ))

        return chunks

# Singleton instance
chunker = RecursiveChunker()
