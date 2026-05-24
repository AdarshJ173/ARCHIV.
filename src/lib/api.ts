import { SearchResult, FileMetadata, IndexState } from '../types';

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export interface SearchOptions {
  limit?: number;
  hyde?: boolean;
  multi_query?: boolean;
  mmr?: boolean;
  compression?: boolean;
  provider?: string;
  model?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export async function getHealth() {
  const res = await fetch(`${BACKEND_URL}/api/health`);
  if (!res.ok) throw new Error('Backend health check failed');
  return res.json();
}

export async function getBackendSettings() {
  const res = await fetch(`${BACKEND_URL}/api/settings`);
  if (!res.ok) throw new Error('Failed to fetch settings from backend');
  return res.json();
}

export async function updateBackendSettings(updates: {
  llm_provider?: string;
  ollama_model?: string;
  ollama_url?: string;
  openai_key?: string;
  openai_model?: string;
  openrouter_key?: string;
  enable_hyde?: boolean;
  enable_multi_query?: boolean;
  enable_mmr?: boolean;
  enable_compression?: boolean;
}) {
  const res = await fetch(`${BACKEND_URL}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!res.ok) throw new Error('Failed to update settings in backend');
  return res.json();
}

export async function getIndexedFiles(): Promise<FileMetadata[]> {
  const res = await fetch(`${BACKEND_URL}/api/ingest/files`);
  if (!res.ok) throw new Error('Failed to fetch indexed files');
  const data = await res.json();
  // Map python snake_case fields to camelCase typescript frontend fields
  return data.map((f: { id: string; name: string; size: number; uploaded_at: number; chunks_count?: number }) => ({
    id: f.id,
    name: f.name,
    size: f.size,
    uploadedAt: f.uploaded_at * 1000, // convert python float timestamp to ms
    chunksCount: f.chunks_count
  }));
}

export async function deleteIndexedFile(fileId: string) {
  const res = await fetch(`${BACKEND_URL}/api/ingest/files/${fileId}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete file');
  return res.json();
}

export async function clearAllIndexes() {
  const res = await fetch(`${BACKEND_URL}/api/ingest/all`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to clear index');
  return res.json();
}

export async function ingestFiles(
  files: File[],
  onProgress: (state: IndexState) => void
): Promise<void> {
  // 1. Create FormData and append all files
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  // Phase 1: Upload files via XMLHttpRequest to track exact upload progress
  onProgress({
    status: 'loading',
    totalFiles: files.length,
    totalChunks: 0,
    progress: 1,
    message: 'Uploading files: 0%'
  });

  const uploadPromise = new Promise<{ message: string; files_count: number }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BACKEND_URL}/api/ingest/files`);

    // Track upload progress
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const uploadPercent = Math.round((event.loaded / event.total) * 100);
        // Map 0-100% upload to 1-30% overall progress
        const overallProgress = Math.max(1, Math.round(uploadPercent * 0.3));
        onProgress({
          status: 'loading',
          totalFiles: files.length,
          totalChunks: 0,
          progress: overallProgress,
          message: `Uploading files: ${uploadPercent}%`
        });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve(res);
        } catch {
          resolve({ message: 'Upload complete', files_count: files.length });
        }
      } else {
        const errText = xhr.responseText || 'Unknown upload error';
        reject(new Error(`Upload failed (${xhr.status}): ${errText}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during file upload'));
    };

    xhr.send(formData);
  });

  // Wait for the files to be uploaded to FastAPI server
  await uploadPromise;

  // Phase 2: Poll backend indexing status
  onProgress({
    status: 'indexing',
    totalFiles: files.length,
    totalChunks: 0,
    progress: 30,
    message: 'Analyzing and chunking documents...'
  });

  return new Promise((resolve, reject) => {
    // Poll progress every 800ms for more responsive UI feedback
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/ingest/status`);
        if (!res.ok) {
          clearInterval(interval);
          reject(new Error('Failed to fetch ingestion progress'));
          return;
        }

        const status = await res.json();
        
        if (status.status === 'indexing') {
          // Map 0-100% backend indexing to 30-100% overall progress
          const overallProgress = Math.round(30 + (status.progress * 0.7));
          onProgress({
            status: 'indexing',
            totalFiles: status.total_files,
            totalChunks: status.total_chunks,
            progress: Math.min(99, overallProgress),
            message: status.message || 'Indexing documents...'
          });
        } else if (status.status === 'ready') {
          clearInterval(interval);
          onProgress({
            status: 'ready',
            totalFiles: status.total_files,
            totalChunks: status.total_chunks,
            progress: 100,
            message: status.message || 'Indexing complete!'
          });
          resolve();
        } else if (status.status === 'error') {
          clearInterval(interval);
          onProgress({
            status: 'error',
            totalFiles: status.total_files,
            totalChunks: status.total_chunks,
            progress: 0,
            message: status.message || 'Error occurred during indexing.'
          });
          reject(new Error(status.message || 'Ingestion failed'));
        } else if (status.status === 'idle') {
          // Fallback if status turned back to idle instantly
          clearInterval(interval);
          onProgress({
            status: 'ready',
            totalFiles: files.length,
            totalChunks: status.total_chunks || 0,
            progress: 100,
            message: 'Indexing complete!'
          });
          resolve();
        }
      } catch (err) {
        clearInterval(interval);
        reject(err);
      }
    }, 800);
  });
}

export async function searchAndStream(
  query: string,
  options: SearchOptions,
  onToken: (token: string) => void,
  onSources: (sources: SearchResult[]) => void,
  onStatus: (status: string) => void,
  onComplete: () => void,
  onError: (error: Error) => void,
  signal?: AbortSignal
): Promise<void> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit: options.limit || 5,
        hyde: options.hyde,
        multi_query: options.multi_query,
        mmr: options.mmr,
        compression: options.compression,
        provider: options.provider,
        model: options.model,
        history: options.history?.map(h => ({
          role: h.role,
          content: h.content
        }))
      }),
      signal
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Search failed: ${response.status} ${errText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Readable stream not supported by browser.');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.slice(6).trim();
        } else if (trimmed.startsWith('data:')) {
          const data = trimmed.slice(5).trim();
          
          if (currentEvent === 'sources') {
            try {
              const rawSources = JSON.parse(data);
              onSources(rawSources);
            } catch (e) {
              console.error('Error parsing sources from stream', e);
            }
          } else if (currentEvent === 'status') {
            onStatus(data);
          } else if (currentEvent === 'token') {
            onToken(data);
          } else if (currentEvent === 'error') {
            onError(new Error(data));
            return;
          } else if (currentEvent === 'done') {
            onComplete();
            return;
          }
          
          // Clear currentEvent unless it's part of a multi-line SSE chunk
          currentEvent = '';
        }
      }
    }

    onComplete();
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('Search request aborted.');
      return;
    }
    onError(error instanceof Error ? error : new Error(String(error)));
  }
}
