
```
                          █████╗ ██████╗  ██████╗██╗  ██╗██╗██╗   ██╗
                         ██╔══██╗██╔══██╗██╔════╝██║  ██║██║██║   ██║
                         ███████║██████╔╝██║     ███████║██║██║   ██║
                         ██╔══██║██╔══██╗██║     ██╔══██║██║╚██╗ ██╔╝
                         ██║  ██║██║  ██║╚██████╗██║  ██║██║ ╚████╔╝
                         ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═══╝
```

<p align="center">
  <img src="./public/logo.svg" alt="ARCHIV. logo" width="120">
</p>

<p align="center">
  <b>Talk to your transcripts. Privately. Offline. Free.</b>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#deploy">Deploy</a> •
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js_16-000000?logo=next.js" alt="Next.js 16">
  <img src="https://img.shields.io/badge/React_19-61DAFB?logo=react" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/WebGPU-005A9C?logo=webgpu" alt="WebGPU">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT">
</p>

---

**ARCHIV.** is a browser-based RAG (Retrieval-Augmented Generation) application. It lets you download YouTube transcripts, index them locally in your browser, and ask questions using hybrid search + LLM — **no server, no uploads, no API fees for search**.

> Data never leaves your machine. Only the final LLM call goes to OpenRouter (bring your own free key).

---

## ✦ Features

| | |
|---|---|
| **🎯 YouTube Downloads** | Paste any video or channel URL. Download transcripts as `.txt` — single or batch (ZIP). |
| **⚡ Browser-Native RAG** | Embeddings via Transformers.js + WebGPU. Search runs in Web Workers. IndexedDB persistence. |
| **🔎 Hybrid Search** | Dense vector cosine similarity + BM25 keyword scoring fused via Reciprocal Rank Fusion, then reranked. |
| **💬 Chat with Citations** | Ask questions. Get answers grounded in your transcripts with source file citations. |
| **🎛️ Per-Session Context** | Attach specific files to each chat session. Search respects your selection. |
| **🛑 Halt Mid-Request** | Stop button cancels the LLM call instantly — zero token waste. |
| **📋 Copy Responses** | One-click copy of formatted markdown responses. |
| **📊 Live Token Stats** | See tokens used, requests made, and averages per session. |
| **📄 Prompt Report** | Expand to see the exact system prompt and prompt engineering strategy. |
| **🗂️ Library Management** | Per-file delete, clear all data, view indexed files. |
| **🔄 Model Fallback** | Chains through 17 free OpenRouter models automatically. |

---

## ✦ Quick Start

```bash
# clone
git clone https://github.com/AdarshJ173/ARCHIV..git
cd ARCHIV.

# install
npm install

# run
npm run dev
```

Open `http://localhost:3000`, add your [OpenRouter API key](https://openrouter.ai/keys) in Settings → API Key, and you're ready.

> No OpenRouter key? Grab a free one at [openrouter.ai/keys](https://openrouter.ai/keys). The app uses free models only.

---

## ✦ How It Works

```
                ┌──────────────────────────────────────┐
                │         YOUR BROWSER                 │
                │                                      │
  YouTube ─────►│  YouTube Downloader                  │
  URL           │    ↓  .txt files                     │
                │                                      │
  .txt / .md ──►│  Chunk Worker (sentence split)       │
                │    ↓                                 │
                │  Embed Worker (Transformers.js BGE)  │
                │    ↓                                 │
                │  IndexedDB (vectors + BM25 + chunks) │
                │    ↓                                 │
  Question ────►│  Search Pipeline:                    │
                │    • Vector cosine similarity         │
                │    • BM25 keyword scoring             │
                │    • RRF fusion + reranker            │
                │    ↓                                 │
                │  OpenRouter API (LLM) ───► Answer     │
                └──────────────────────────────────────┘
```

**Step by step:**

1. **Download** — Paste a YouTube video or channel URL. Transcripts are fetched and saved as `.txt` files.
2. **Index** — Upload your `.txt` or `.md` files (or use downloaded transcripts). They're split into chunks, embedded into 768-dim vectors via BGE, and stored in IndexedDB with a BM25 keyword index.
3. **Chat** — Select which files to use, ask a question. The query is embedded, searched (vector + BM25), fused, reranked, and sent to an LLM with the context. You get a grounded answer with source citations.

---

## ✦ Architecture

```
web-rag/
├── src/
│   ├── app/                   Pages, layouts, API routes
│   │   └── api/youtube/       Serverless YouTube proxy
│   ├── components/
│   │   ├── layout/            Sidebar, Header, Dashboard
│   │   ├── rag/               Chat, Library, ContextDialog, Settings
│   │   ├── youtube/           YouTube downloader UI
│   │   └── ui/                shadcn/ui components
│   ├── hooks/                 useSearch, useIndex, useSessions, useYouTube
│   ├── lib/                   Chunker, DB, OpenRouter, BM25, vector-search
│   ├── workers/               Web Workers for chunking, embedding, search
│   └── types/                 All TypeScript interfaces
├── docs/
│   └── ARCHITECTURE.md        Full product requirements & architecture
└── package.json
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the complete deep-dive — every component, data flow, API route, and performance target.

---

## ✦ Tech Stack

| Layer | What |
|---|---|
| **Framework** | Next.js 16 (App Router) + React 19 |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS 4 + shadcn/ui |
| **Browser ML** | @huggingface/transformers (BGE embeddings via WebGPU) |
| **Search** | Cosine similarity + BM25 + RRF + Cross-Encoder reranker |
| **Storage** | IndexedDB (via `idb`) |
| **LLM** | OpenRouter API (free models) |
| **Workers** | Web Workers for chunking, embedding, search |
| **Icons** | lucide-react |

---

## ✦ Deploy

Deploy to Vercel with zero configuration:

```bash
npx vercel
```

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_BMC_USERNAME` | No | Your Buy Me a Coffee username. Set this to show the support button in the header + floating widget. Leave empty (or unset) for forks — zero support UI will render. |

Users provide their own OpenRouter API key in the Settings UI (no env var needed for that).

---

## ✦ Contributing

All contributions are welcome — bugs, features, docs, ideas.

1. Fork it
2. `git checkout -b feat/your-thing`
3. Make your changes
4. `npm run build` to type-check
5. Open a PR

See [CONTRIBUTING.md](CONTRIBUTING.md) for more.

---

## ✦ License

[MIT](LICENSE) — do whatever you want, no warranty.

---

<p align="center">
  <sub>Built with ❤️ for local, private, free AI.</sub>
</p>
