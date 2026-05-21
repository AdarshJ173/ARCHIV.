# WebRAG — Product Requirements & Architecture Document

## 1. Product Overview

**WebRAG** is a 100% serverless, browser-based RAG (Retrieval-Augmented Generation) application built with Next.js. It allows users to:

1. **Download YouTube transcripts** — given a video URL or full channel link, download clean `.txt` transcript files to their local machine
2. **Build a local RAG index** — select a folder of `.txt` transcripts, which are chunked, embedded, and indexed entirely in the browser using **Transformers.js** (WebGPU-accelerated) and in-memory vector search
3. **Chat with their transcripts** — ask natural language questions and get grounded answers with source citations, powered by OpenRouter API for LLM generation

### Key Constraints

| Constraint | Requirement |
|---|---|
| **Serverless** | Zero backend servers. Deployed on Vercel (static + serverless functions). |
| **Browser-native ML** | All ML inference (embeddings, reranking) runs in-browser via Transformers.js + WebGPU |
| **Privacy-first** | Transcript files never leave the user's machine. Only LLM calls go to OpenRouter. |
| **Offline-capable** | After initial model download, the RAG pipeline works without server connectivity |

---

## 2. Architecture Overview

### High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BROWSER (Next.js SPA)                        │
│                                                                     │
│  ┌─────────────────────────┐    ┌────────────────────────────────┐  │
│  │   LEFT PANEL            │    │   RIGHT PANEL                  │  │
│  │   YouTube Downloader    │    │   RAG Workspace                │  │
│  │                         │    │                                │  │
│  │  [Paste URL / Channel]  │    │  [Select Folder / Upload]      │  │
│  │         │               │    │         │                      │  │
│  │         ▼               │    │         ▼                      │  │
│  │  ┌──────────────┐       │    │  ┌──────────────────┐          │  │
│  │  │ API Route    │       │    │  │ Chunk Worker     │          │  │
│  │  │ (Vercel fn)  │       │    │  │ (sentence split) │          │  │
│  │  └──────┬───────┘       │    │  └────────┬─────────┘          │  │
│  │         │               │    │           ▼                     │  │
│  │         ▼               │    │  ┌──────────────────┐          │  │
│  │  ┌──────────────┐       │    │  │ Embed Worker     │          │  │
│  │  │ YouTube API  │       │    │  │ (Transformers.js │          │  │
│  │  │ (transcript) │       │    │  │  + WebGPU)       │          │  │
│  │  └──────────────┘       │    │  └────────┬─────────┘          │  │
│  │         │               │    │           ▼                     │  │
│  │         ▼               │    │  ┌──────────────────┐          │  │
│  │  [Save as .txt]         │    │  │ IndexedDB Store  │          │  │
│  │  (browser download)     │    │  │ (vectors + text) │          │  │
│  └─────────────────────────┘    │  └──────────────────┘          │  │
│                                  │                                │  │
│                                  │  ┌──────────────────┐          │  │
│                                  │  │ Chat Interface   │          │  │
│                                  │  │  ┌────────────┐  │          │  │
│                                  │  │  │ Search     │  │          │  │
│                                  │  │  │ Worker     │  │          │  │
│                                  │  │  │ (vec+BM25  │  │          │  │
│                                  │  │  │  +rerank)  │  │          │  │
│                                  │  │  └────────────┘  │          │  │
│                                  │  │         │        │          │  │
│                                  │  │         ▼        │          │  │
│                                  │  │  ┌────────────┐  │          │  │
│                                  │  │  │ OpenRouter │  │          │  │
│                                  │  │  │ API (LLM)  │  │          │  │
│                                  │  │  └────────────┘  │          │  │
│                                  │  └──────────────────┘          │  │
│  └─────────────────────────┘    └────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
               ┌─────────────────────┐
               │    Vercel Edge      │
               │  (API Routes only)  │
               │  - YouTube proxy    │
               └─────────────────────┘
```

### Tech Stack

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| **Framework** | Next.js 15 (App Router) | 15.x | Vercel-native, API routes, static export |
| **Language** | TypeScript | 5.x | Type safety for complex pipeline |
| **UI** | Tailwind CSS 4 + shadcn/ui | latest | Rapid, consistent design |
| **Browser ML** | @huggingface/transformers | 4.x | WebGPU-accelerated, BGE model support |
| **Model (Embedding)** | BAAI/bge-base-en-v1.5 (ONNX) | — | 768-dim, sentence-transformers compatible |
| **Model (Reranker)** | BAAI/bge-reranker-base (ONNX) | — | Cross-encoder for re-ranking |
| **Vector Search** | In-memory Float32Array cosine similarity | — | Fastest for <50k chunks, no deps |
| **BM25** | Custom JS implementation | — | Lightweight, no dependencies |
| **Storage** | IndexedDB (via idb library) | latest | Persistent browser storage |
| **YouTube Transcript** | youtube-transcript (npm) | latest | No API key needed per video |
| **YouTube Channel** | YouTube Data API v3 | — | Lists videos in channel (needs API key) |
| **LLM** | OpenRouter API (OpenAI-compatible) | — | Multiple free models, CORS-friendly |
| **Web Workers** | Comlink | latest | Clean worker RPC communication |

---

## 3. Detailed Component Design

### 3.1 YouTube Transcript Downloader (Left Panel)

#### User Flow

```
1. User pastes URL ──► Auto-detect: Video or Channel?
   │
   ├── Video URL (youtube.com/watch?v=XXX or youtu.be/XXX)
   │     └──► Extract videoId
   │           └──► Fetch transcript via Vercel API route
   │                 └──► Format as clean .txt
   │                       └──► Trigger browser download
   │
   └── Channel URL (youtube.com/@channel or /channel/UC...)
         └──► Extract channelId
               └──► Fetch video list via YouTube Data API
               │     (requires user-provided API key)
               ├──► Show video list with checkboxes
               └──► User selects videos
                     └──► Fetch transcripts in parallel (batch)
                           └──► Zip all .txt files → download
```

#### Implementation Details

- **Video transcript**: Use `youtube-transcript` npm package in Vercel API route
  - Route: `POST /api/youtube/transcript` with `{ videoId: string }`
  - Returns: `{ title: string, transcript: string, segments: Array }`
  - Formats as: "Video Title\n\n[00:00] Speaker: text\n[00:05] ..."

- **Channel list**: Use YouTube Data API v3
  - Route: `POST /api/youtube/channel` with `{ channelUrl: string, apiKey: string }`
  - Returns: `{ channelName: string, videos: Array<{id, title}> }`
  - User provides their own YouTube Data API key in settings

- **Download**: Browser native download via `URL.createObjectURL(new Blob([text], {type: 'text/plain'}))`
  - Single video → single .txt file
  - Multiple videos → JSZip → single .zip file

### 3.2 RAG Pipeline (Right Panel)

#### 3.2.1 File Ingestion

```
User selects folder (via <input directory> or drag-drop)
  │
  ▼
Read all .txt files via FileReader API
  │
  ▼
Store raw text in IndexedDB (table: `files`)
  │
  ▼
Send to Chunk Worker
```

#### 3.2.2 Chunking (Web Worker: `chunk.worker.ts`)

```
Input:  Array<{ id: string, text: string, fileName: string }>
Output: Array<{ id: string, text: string, source: string, chunkIndex: number }>

Algorithm (ported from ingest.py):
  1. Abbreviation-preserving regex split on [.!?]
  2. Token counting via JavaScript port of cl100k_base
  3. Greedy merge: max 512 tokens per chunk
  4. Overlap: 102 tokens (walkback window)
  5. Min chunk: 50 characters
```

**Tokenization**: We'll use a lightweight JS implementation of cl100k_base token counting (or `gpt-tokenizer` npm package). For the browser, a pure-JS tokenizer is available.

#### 3.2.3 Embedding (Web Worker: `embed.worker.ts`)

```
Input:  Array<{ id: string, text: string }>
Output: Float32Array[] (768-dim vectors, L2-normalized)

Implementation:
  1. Load BAAI/bge-base-en-v1.5 via Transformers.js pipeline('feature-extraction')
  2. Device: 'webgpu' (fallback to 'wasm')
  3. Batch: 32 chunks per batch
  4. BGE query prefix for queries: "Represent this sentence for searching relevant passages: "
  5. Store vectors + texts in IndexedDB tables:
     - `vectors`: id → Float32Array(768)
     - `chunks`: id → { text, source, chunkIndex }
```

#### 3.2.4 BM25 Index (In the Embed Worker)

```
After embedding, also build BM25 index:
  1. Tokenize each chunk (lowercase, strip punctuation)
  2. Build term frequency map: Map<term, Map<docId, count>>
  3. Compute IDF for each term
  4. Store in IndexedDB table: `bm25`
```

#### 3.2.5 Search Pipeline (Web Worker: `search.worker.ts`)

```
User Query
  │
  ├──► Vector Search:
  │     1. Embed query with BGE prefix
  │     2. Cosine similarity vs all stored vectors
  │     3. Return top 30 (O(n) dot product via typed arrays)
  │
  ├──► BM25 Search:
  │     1. Tokenize query
  │     2. Score all docs using BM25 formula
  │     3. Return top 30 (heap selection)
  │
  ├──► RRF Fusion (k=60):
  │     score(d) = Σ 1/(60 + rank)
  │     Return top 30 fused results
  │
  ├──► Reranking:
  │     1. Load BAAI/bge-reranker-base via Transformers.js
  │     2. Score (query, chunk) pairs
  │     3. Return top 10
  │
  └──► Return to main thread: { chunks: Array<{text, source, score}>, sources: string[] }
```

**Performance expectations** (per the research):
- Embedding: ~50ms on WebGPU for query (once model cached)
- Vector search: ~5-15ms for 10k vectors (typed array dot products)
- BM25: ~5-10ms for 10k docs
- Reranking: ~100-200ms for 30 pairs
- **Total**: ~200-300ms (pipeline), vs 100-300ms just for network round trip to hosted solution

#### 3.2.6 LLM Generation (Main Thread)

```
Input:  { question: string, contextChunks: Array<{text, source}> }
Output: { answer: string, sources: string[], model: string }

Implementation:
  1. Build prompt (same format as current main.py)
  2. POST to OpenRouter API: https://openrouter.ai/api/v1/chat/completions
  3. Fallback through free models on failure
  4. Return answer + source list
```

**OpenRouter Model Chain** (same as current):
```
1. openai/gpt-oss-120b:free
2. openrouter/free
3. meta-llama/llama-3.3-70b-instruct:free
4. nousresearch/hermes-3-llama-3.1-405b:free
5. qwen/qwen3-next-80b-a3b-instruct:free
6. deepseek/deepseek-v4-flash:free
```

**API Key**: User provides their OpenRouter API key in the settings panel (stored in localStorage).

### 3.3 Data Persistence (IndexedDB Schema)

```typescript
interface WebRAGDatabase {
  // Files table - raw file storage
  files: {
    key: string,          // unique file ID
    value: {
      id: string,
      name: string,        // original filename
      text: string,        // full text content
      size: number,
      uploadedAt: number   // timestamp
    }
  };

  // Chunks table - individual text chunks
  chunks: {
    key: string,          // chunk ID (e.g., "file_0", "file_1")
    value: {
      id: string,
      text: string,
      source: string,      // original filename
      chunkIndex: number,
      fileId: string
    }
  };

  // Vectors table - embeddings for each chunk
  vectors: {
    key: string,          // matches chunk ID
    value: {
      id: string,
      embedding: Float32Array  // 768-dim
    }
  };

  // BM25 index data
  bm25: {
    key: string,          // term
    value: {
      term: string,
      docFreqs: Record<string, number>  // docId → frequency
    }
  };

  // Metadata
  metadata: {
    key: string,          // 'index_info'
    value: {
      totalChunks: number,
      totalFiles: number,
      embeddingDim: number,
      modelName: string,
      indexedAt: number
    }
  };
}
```

---

## 4. Project Structure

```
web-rag/
├── .env.local                    # API keys (for dev)
├── next.config.ts                # Next.js configuration
├── package.json
├── tailwind.config.ts
├── tsconfig.json
│
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout (providers, theme)
│   │   ├── page.tsx              # Main dashboard page
│   │   ├── globals.css           # Global styles
│   │   └── api/
│   │       └── youtube/
│   │           ├── transcript/route.ts   # POST: fetch transcript
│   │           └── channel/route.ts      # POST: list channel videos
│   │
│   ├── components/
│   │   ├── ui/                   # shadcn/ui components
│   │   ├── layout/
│   │   │   ├── DashboardLayout.tsx       # Two-panel layout
│   │   │   └── Panel.tsx                 # Resizable panel wrapper
│   │   ├── youtube/
│   │   │   ├── YouTubeDownloader.tsx      # Main left panel component
│   │   │   ├── UrlInput.tsx              # URL paste input
│   │   │   ├── VideoList.tsx             # Channel video selector
│   │   │   └── DownloadProgress.tsx      # Progress indicator
│   │   └── rag/
│   │       ├── RagWorkspace.tsx          # Main right panel component
│   │       ├── FolderSelector.tsx        # Folder/file picker
│   │       ├── IndexStatus.tsx           # Shows index state
│   │       ├── ChatInterface.tsx         # Chat messages
│   │       ├── ChatInput.tsx             # Question input
│   │       ├── SourceCitation.tsx        # Source display
│   │       └── Settings.tsx              # API key config
│   │
│   ├── workers/
│   │   ├── chunk.worker.ts      # Sentence chunking
│   │   ├── embed.worker.ts      # Embedding + BM25 building
│   │   └── search.worker.ts     # Vector search + BM25 + RRF + rerank
│   │
│   ├── lib/
│   │   ├── db.ts                # IndexedDB setup & operations
│   │   ├── chunker.ts           # Sentence chunking logic
│   │   ├── tokenizer.ts         # Token counting (cl100k_base JS port)
│   │   ├── bm25.ts              # BM25 implementation
│   │   ├── vector-search.ts     # Cosine similarity operations
│   │   ├── youtube.ts           # YouTube API helpers
│   │   ├── openrouter.ts        # OpenRouter API client
│   │   ├── prompts.ts           # LLM prompt templates
│   │   └── utils.ts             # Shared utilities
│   │
│   ├── hooks/
│   │   ├── useIndex.ts          # Hook for index lifecycle
│   │   ├── useSearch.ts         # Hook for search queries
│   │   ├── useYouTube.ts        # Hook for YouTube operations
│   │   └── useSettings.ts       # Hook for API key settings
│   │
│   └── types/
│       └── index.ts             # All TypeScript types/interfaces
│
└── public/
    └── models/                  # Model cache (optional preloading)
```

---

## 5. API Routes (Vercel Serverless Functions)

### `POST /api/youtube/transcript`

```
Request:  { videoId: string }
Response: {
  success: true,
  data: {
    title: string,
    transcript: string,       // full text
    segments: Array<{ text: string, start: number, duration: number }>,
    videoId: string
  }
}
```

Uses `youtube-transcript` npm package to fetch from YouTube's unofficial API.

### `POST /api/youtube/channel`

```
Request:  { channelUrl: string, apiKey: string }
Response: {
  success: true,
  data: {
    channelName: string,
    channelId: string,
    videos: Array<{
      id: string,
      title: string,
      publishedAt: string
    }>
  }
}
```

Uses YouTube Data API v3 with user-provided API key.

---

## 6. Deployment (Vercel)

### Configuration

```json
// vercel.json
{
  "functions": {
    "api/youtube/transcript": { "maxDuration": 30 },
    "api/youtube/channel": { "maxDuration": 30 }
  }
}
```

### Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_DEFAULT_OPENROUTER_KEY` | No | Optional default API key |

All other keys (OpenRouter, YouTube Data API) are user-provided via the UI and stored in localStorage.

### Build & Deploy

```bash
npx next build     # Static + serverless function build
npx vercel deploy  # Deploy to Vercel
```

---

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **WebGPU unavailable** (Firefox, Safari, older devices) | Embeddings 10-50x slower | Autodetect WebGPU; fallback to WASM with progress feedback |
| **Model download ~900MB total** | Slow first load | Cache in IndexedDB/Cache API; show download progress; stream models |
| **YouTube transcript API breaks** | Download fails | The `youtube-transcript` package uses unofficial API; implement retry + alternative sources |
| **Large channel (1000+ videos)** | Rate limits, long processing | Paginate YouTube API; batch transcripts with concurrency limit; progress tracking |
| **IndexedDB quota exhaustion** | Cannot store more vectors | Show storage usage; estimate max capacity (~50k chunks before hitting limits) |
| **Browser tab memory** | Crash with large corpora | Web Workers + streaming; chunk processing in batches; memory monitoring |
| **OpenRouter rate limits** | LLM generation fails | Implement fallback model chain; show clear error messages |
| **CORS on YouTube API calls** | Transcript fetch fails | Route all YouTube calls through Vercel serverless function |

---

## 8. Performance Targets

| Metric | Target | Measurement |
|---|---|---|
| **First load (cold)** | <30s | Model download + WebGPU compile |
| **Subsequent loads** | <3s | Cached models, no download |
| **Single video transcript** | <2s | API round trip |
| **Channel (50 videos) transcript** | <60s | 50 parallel fetches |
| **File ingestion (10 files, 500 chunks)** | <5s | Chunk worker |
| **Full indexing (500 chunks)** | <30s | Embed worker (WebGPU) |
| **Single query** | <3s | Search pipeline + LLM call |
| **App bundle size** | <200KB | Tree-shaken, code-split |

---

## 9. Future Enhancements

| Feature | Priority | Notes |
|---|---|---|
| Local LLM (WebLLM) for fully offline | Medium | Replace OpenRouter with browser-native LLM |
| PDF/DOCX file support | Medium | PDF.js + mammoth.js for parsing |
| Multi-session chat history | Low | IndexedDB chat persistence |
| Export RAG index | Low | Download vector index as file |
| Collaborative sharing | Low | Beyond scope (serverless constraint) |
| TurboQuant WASM vector search | Low | When turbovec achieves stable WASM target |

---

## 10. Development Phases

### Phase 1: Foundation (This session)
- [ ] Scaffold Next.js 15 project with TypeScript + Tailwind + shadcn/ui
- [ ] Implement two-panel dashboard layout
- [ ] Build YouTube video transcript downloader (left panel)
- [ ] Build API route for YouTube transcript proxy
- [ ] Build folder/file selector (right panel)
- [ ] Implement IndexedDB schema

### Phase 2: RAG Pipeline
- [ ] Implement sentence chunker (Web Worker)
- [ ] Integrate Transformers.js with BGE embedding model
- [ ] Build embedding worker with WebGPU
- [ ] Implement BM25 index builder
- [ ] Build search pipeline (vector + BM25 + RRF + reranker)

### Phase 3: Chat & Polish
- [ ] Build chat interface
- [ ] Integrate OpenRouter API
- [ ] Add progress indicators for long operations
- [ ] Error handling & edge cases
- [ ] Deploy to Vercel
