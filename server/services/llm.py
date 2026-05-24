import httpx
import json
import logging
import re
from typing import List, Dict, Any, Generator, Optional, Tuple
from server.config import settings

logger = logging.getLogger("webrag.llm")

FREE_MODELS = [
    "openrouter/free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    "deepseek/deepseek-r1:free",
]

class LLMRouter:
    def __init__(self):
        self.client = httpx.Client(timeout=60.0)

    def _get_api_details(self, provider: Optional[str] = None) -> Tuple[str, str, str]:
        """Returns (api_url, api_key, model_name) for the given provider."""
        prov = provider or settings.LLM_PROVIDER
        prov = prov.lower()

        if prov == "openrouter":
            url = "https://openrouter.ai/api/v1/chat/completions"
            key = settings.OPENROUTER_API_KEY
            # Use setting model, fallback to a free model if empty
            model = settings.OPENROUTER_MODEL or FREE_MODELS[0]
            return url, key, model

        elif prov == "ollama":
            # Ollama's local OpenAI-compatible endpoint
            base_url = settings.OLLAMA_BASE_URL.rstrip("/")
            url = f"{base_url}/v1/chat/completions"
            model = settings.OLLAMA_MODEL or "llama3.1"
            return url, "ollama", model

        elif prov == "openai":
            base_url = settings.OPENAI_BASE_URL.rstrip("/")
            url = f"{base_url}/chat/completions"
            key = settings.OPENAI_API_KEY
            model = settings.OPENAI_MODEL or "gpt-4o-mini"
            return url, key, model

        else:
            raise ValueError(f"Unknown LLM provider: {prov}")

    def generate_non_streaming(self, prompt: str, system_prompt: str, provider: Optional[str] = None) -> str:
        """Helper to generate a complete response (useful for HyDE or Multi-query)."""
        url, key, model = self._get_api_details(provider)
        
        headers = {
            "Content-Type": "application/json"
        }
        if key and key != "ollama":
            headers["Authorization"] = f"Bearer {key}"
            headers["HTTP-Referer"] = "http://localhost:3000"
            headers["X-Title"] = "WebRAG"

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2, # Lower temperature for reasoning / sub-queries
            "max_tokens": 1024,
            "stream": False
        }

        try:
            logger.info(f"LLM Non-Stream request to {url} using model {model}...")
            response = self.client.post(url, headers=headers, json=payload)
            if response.status_code != 200:
                logger.error(f"LLM API error ({response.status_code}): {response.text}")
                return ""
            
            data = response.json()
            return data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            logger.error(f"Error in LLM non-streaming generation: {e}")
            return ""

    def stream_response(
        self, 
        prompt: str, 
        system_prompt: str, 
        history: Optional[List[Dict[str, str]]] = None,
        provider: Optional[str] = None,
        custom_model: Optional[str] = None
    ) -> Generator[Dict[str, Any], None, None]:
        """Streams ChatCompletion tokens back as structured dictionary events."""
        url, key, default_model = self._get_api_details(provider)
        model = custom_model or default_model

        headers = {
            "Content-Type": "application/json"
        }
        if key and key != "ollama":
            headers["Authorization"] = f"Bearer {key}"
            headers["HTTP-Referer"] = "http://localhost:3000"
            headers["X-Title"] = "WebRAG"

        # Construct messages
        messages = [{"role": "system", "content": system_prompt}]
        if history:
            for msg in history:
                messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 4096,
            "stream": True
        }

        logger.info(f"Streaming request to {url} (model: {model})...")
        
        # We'll use a local client block for streaming
        with httpx.Client(timeout=60.0) as client:
            try:
                with client.stream("POST", url, headers=headers, json=payload) as r:
                    if r.status_code != 200:
                        err_text = r.read().decode("utf-8", errors="ignore")
                        logger.error(f"LLM Streaming connection failed ({r.status_code}): {err_text}")
                        yield {"event": "error", "data": f"LLM provider returned status code {r.status_code}: {err_text}"}
                        return

                    for line in r.iter_lines():
                        if not line:
                            continue
                        if line.startswith("data: "):
                            data_str = line[6:].strip()
                            if data_str == "[DONE]":
                                break
                            
                            try:
                                chunk_data = json.loads(data_str)
                                content = chunk_data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                                if content:
                                    yield {"event": "token", "data": content, "model": model}
                            except json.JSONDecodeError:
                                continue
            except Exception as e:
                logger.error(f"Error in LLM stream: {e}")
                yield {"event": "error", "data": str(e)}

    def generate_hyde_doc(self, query: str) -> str:
        """Generates a hypothetical document answer using a lightweight prompt."""
        system_prompt = (
            "You are an expert search assistant. Write a short, single-paragraph hypothetical passage "
            "that answers the user's question directly. Do not introduce the passage; begin writing "
            "the answer immediately. Use factual, descriptive language."
        )
        prompt = f"Question: {query}\n\nHypothetical Passage:"
        
        logger.info(f"Generating HyDE document for: {query}")
        hyde_doc = self.generate_non_streaming(prompt, system_prompt)
        if not hyde_doc:
            logger.warning("HyDE document generation failed, returning original query.")
            return query
        logger.debug(f"Generated HyDE Doc: {hyde_doc}")
        return hyde_doc

    def generate_sub_queries(self, query: str) -> List[str]:
        """Decomposes a complex query into 2 to 3 simpler queries."""
        system_prompt = (
            "You are a helpful search assistant. Your job is to break down a complex user query "
            "into 2 to 3 simpler, distinct sub-queries that can be used for search engines.\n"
            "Output each sub-query on a new line, starting with a bullet point like '- '.\n"
            "Do not write any introductory or concluding text, write only the sub-queries."
        )
        prompt = f"Decompose this query into sub-queries: {query}"
        
        logger.info(f"Decomposing query: {query}")
        res = self.generate_non_streaming(prompt, system_prompt)
        sub_queries = []
        if res:
            for line in res.splitlines():
                line = line.strip()
                if line.startswith("-") or line.startswith("*") or (line and line[0].isdigit() and line[1] in [".", ")"]):
                    clean_q = re.sub(r"^[-*\d.\)]\s*", "", line).strip()
                    if clean_q:
                        sub_queries.append(clean_q)
        
        # Fallback to the original query if parsing or generation failed
        if not sub_queries:
            return [query]
            
        logger.info(f"Generated sub-queries: {sub_queries}")
        return sub_queries

# Singleton instance
llm_router = LLMRouter()
