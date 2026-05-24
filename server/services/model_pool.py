import os
import torch
import logging
import threading
from sentence_transformers import SentenceTransformer, CrossEncoder
from server.config import settings

logger = logging.getLogger("webrag.model_pool")
logging.basicConfig(level=logging.INFO)

class ModelPool:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if not cls._instance:
                cls._instance = super(ModelPool, cls).__new__(cls, *args, **kwargs)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if self._initialized:
            return
        
        self.device = settings.get_device()
        self.embedding_model = None
        self.reranker_model = None
        self.embedding_lock = threading.Lock()
        self.reranker_lock = threading.Lock()
        self._initialized = True
        logger.info(f"ModelPool initialized. Target device: {self.device}")

    def load_models(self):
        """Loads both embedding and reranking models into memory."""
        self.load_embedding_model()
        self.load_reranker_model()

    def load_embedding_model(self):
        with self.embedding_lock:
            if self.embedding_model is not None:
                return self.embedding_model

            model_name = settings.EMBEDDING_MODEL
            folder_name = model_name.split("/")[-1]
            local_dir = os.path.join(settings.DATA_DIR, "models", folder_name)
            
            # Check if model has already been cached in local storage
            if os.path.exists(os.path.join(local_dir, "config.json")):
                logger.info(f"Loading cached embedding model from local storage: {local_dir}...")
                load_path = local_dir
            else:
                logger.info(f"Loading embedding model '{model_name}' from HuggingFace Hub on {self.device}...")
                load_path = model_name

            try:
                # Load SentenceTransformer model
                self.embedding_model = SentenceTransformer(load_path, device=self.device)
                logger.info("Embedding model loaded successfully.")
                
                # If loaded from remote hub, save to local directory for instant subsequent loads
                if load_path == model_name:
                    logger.info(f"Caching embedding model locally to {local_dir}...")
                    os.makedirs(local_dir, exist_ok=True)
                    self.embedding_model.save(local_dir)
                    logger.info("Embedding model cached successfully.")
            except Exception as e:
                logger.error(f"Error loading embedding model: {e}")
                logger.info("Retrying embedding model loading on CPU...")
                try:
                    self.embedding_model = SentenceTransformer(load_path, device="cpu")
                    logger.info("Embedding model loaded successfully on CPU.")
                except Exception as cpu_err:
                    logger.critical(f"Failed to load embedding model on CPU: {cpu_err}")
            return self.embedding_model

    def load_reranker_model(self):
        with self.reranker_lock:
            if self.reranker_model is not None:
                return self.reranker_model

            model_name = settings.RERANKER_MODEL
            folder_name = model_name.split("/")[-1]
            local_dir = os.path.join(settings.DATA_DIR, "models", folder_name)
            
            # Check if model has already been cached in local storage
            if os.path.exists(os.path.join(local_dir, "config.json")):
                logger.info(f"Loading cached reranker model from local storage: {local_dir}...")
                load_path = local_dir
            else:
                logger.info(f"Loading reranker model '{model_name}' from HuggingFace Hub on {self.device}...")
                load_path = model_name

            try:
                # Load CrossEncoder model
                self.reranker_model = CrossEncoder(load_path, device=self.device)
                logger.info("Reranker model loaded successfully.")
                
                # If loaded from remote hub, save to local directory for instant subsequent loads
                if load_path == model_name:
                    logger.info(f"Caching reranker model locally to {local_dir}...")
                    os.makedirs(local_dir, exist_ok=True)
                    if hasattr(self.reranker_model, 'save'):
                        self.reranker_model.save(local_dir)
                    else:
                        self.reranker_model.model.save_pretrained(local_dir)
                        self.reranker_model.tokenizer.save_pretrained(local_dir)
                    logger.info("Reranker model cached successfully.")
            except Exception as e:
                logger.error(f"Error loading reranker model: {e}")
                logger.info("Retrying reranker model loading on CPU...")
                try:
                    self.reranker_model = CrossEncoder(load_path, device="cpu")
                    logger.info("Reranker model loaded successfully on CPU.")
                except Exception as cpu_err:
                    logger.critical(f"Failed to load reranker model on CPU: {cpu_err}")
            return self.reranker_model

    def get_embedding_model(self) -> SentenceTransformer:
        if self.embedding_model is None:
            self.load_embedding_model()
        return self.embedding_model

    def get_reranker_model(self) -> CrossEncoder:
        if self.reranker_model is None:
            self.load_reranker_model()
        return self.reranker_model

    def get_info(self) -> dict:
        info = {
            "device": self.device,
            "gpu_available": torch.cuda.is_available(),
            "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            "embedding_model": settings.EMBEDDING_MODEL if self.embedding_model else None,
            "reranker_model": settings.RERANKER_MODEL if self.reranker_model else None,
        }
        return info

# Singleton instance
model_pool = ModelPool()
