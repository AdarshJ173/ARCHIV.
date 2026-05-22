# Contributing to ARCHIV.

Thank you for your interest in contributing to **ARCHIV.**! We welcome all contributions, whether they are bug reports, feature requests, documentation improvements, or code updates.

As a 100% browser-based, offline-safe RAG tool, ARCHIV. holds a strong standard for security, privacy, and code hygiene. Please take a moment to review this guide before submitting issues or pull requests.

---

## ✦ Table of Contents
- [Code of Conduct](#-code-of-conduct)
- [How Can I Contribute?](#-how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Submitting Pull Requests](#submitting-pull-requests)
- [Development Setup](#-development-setup)
- [Coding Guidelines](#-coding-guidelines)
- [Architecture & Design Principles](#-architecture--design-principles)

---

## ✦ Code of Conduct

We are committed to providing a welcoming, safe, and inclusive environment for everyone. Please be respectful, constructive, and collaborative in all communications.

---

## ✦ How Can I Contribute?

### Reporting Bugs
If you find a bug, please open an issue and include:
1. A clear, descriptive title.
2. Steps to reproduce the issue.
3. Your browser, OS, and any error logs from the browser Console.
4. Expected behavior vs. actual behavior.

### Suggesting Features
Have an idea for how to make ARCHIV. better? We'd love to hear it! Open an issue describing:
1. The problem your feature solves.
2. Your proposed solution.
3. Any alternative solutions you considered.

### Submitting Pull Requests
1. **Fork** the repository and create your branch from `main`.
2. **Setup** the environment and dependencies locally.
3. **Commit** your changes with clear, descriptive commit messages.
4. **Build & Test** to make sure TypeScript checks out without errors.
5. **Submit** the Pull Request and describe the changes you made, why they are needed, and how you tested them.

---

## ✦ Development Setup

ARCHIV. is built on **Next.js 16 (App Router)**, **React 19**, and **Tailwind CSS 4**.

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn

### Installation & Run

1. Clone your fork:
   ```bash
   git clone https://github.com/your-username/ARCHIV..git
   cd ARCHIV.
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ✦ Coding Guidelines

To keep the repository clean and maintainable, please follow these guidelines:

### 1. Zero-Error TypeScript
Ensure all types are correct and no `any` types are used unless absolutely necessary and documented. Run the TypeScript build locally to verify:
```bash
npm run build
```

### 2. Privacy & Offline Safety
ARCHIV. is dedicated to being **fully offline-safe and local-first**.
- Do **not** add dependencies that require telemetry, remote cloud data syncing, or third-party web trackers.
- All embedding computations must run in-browser using Web Workers (via `@huggingface/transformers`).
- Under no circumstances should raw files or extracted text transcripts be sent to any external server (except for the user's chosen OpenRouter LLM endpoint, which is clearly documented).

### 3. Web Worker Safety
- CPU-heavy tasks like embedding generation, text chunking, and document search must always run in Web Workers (located in `src/workers/`) to keep the React UI smooth and responsive.
- Always use `Comlink` for clean Web Worker communication.

---

## ✦ Architecture & Design Principles

For a detailed breakdown of components, data flow, IndexedDB storage schemas, and the hybrid search pipeline, please see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

Thank you again for contributing to a private, secure, and accessible future for AI toolkits!
