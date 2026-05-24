import JSZip from 'jszip';

// Cache the promise itself to completely resolve any race conditions in concurrent dynamic imports
let pdfjsPromise: Promise<any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any

async function getPdfJS() {
  if (pdfjsPromise) return pdfjsPromise;
  
  pdfjsPromise = (async () => {
    const pdfjs = await import('pdfjs-dist');
    
    // Polyfill Promise.withResolvers if needed
    if (typeof Promise.withResolvers === 'undefined') {
      (Promise as unknown as { withResolvers: unknown }).withResolvers = function() {
        let resolve!: (value: unknown) => void;
        let reject!: (reason?: unknown) => void;
        const promise = new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        });
        return { promise, resolve, reject };
      };
    }

    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    return pdfjs;
  })();

  return pdfjsPromise;
}

// Regex to ignore binary media assets that are not text-based
export const IGNORED_EXTENSIONS = /\.(png|jpe?g|gif|webp|ico|mp4|webm|ogg|mp3|wav|zip|tar|gz|7z|rar|exe|dll|so|dylib|bin|woff2?|eot|ttf|pdf_content)$/i;

export function isValidFile(file: File): boolean {
  return !IGNORED_EXTENSIONS.test(file.name);
}

/**
 * Executes async tasks with a limit on concurrent execution.
 * Throttles execution to keep memory footprints completely flat and prevent browser snapping.
 */
export async function runWithConcurrencyLimit<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  limit: number = 1
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      try {
        results[currentIndex] = await fn(items[currentIndex], currentIndex);
      } catch (err) {
        console.error(`[WebRAG:WorkerPool] Error processing item at index ${currentIndex}:`, err);
      }
    }
  }

  // Cap concurrency at a maximum of 2, default to 1 (fully sequential) for ultra-stability under high loads
  const actualLimit = Math.max(1, Math.min(limit, 2));
  const workers = Array.from({ length: Math.min(actualLimit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

/**
 * Extracts all readable text content from a given File object.
 * Supports PDF parsing, DOCX parsing, and falls back to plain text read (TXT, MD, CSV, code scripts, logs).
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  
  if (name.endsWith('.pdf')) {
    let pdf: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      const pdfjs = await getPdfJS();
      const arrayBuffer = await file.arrayBuffer();
      
      // Load standard fonts from unpkg CDN to prevent console font warnings/errors
      pdf = await pdfjs.getDocument({
        data: arrayBuffer,
        standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`
      }).promise;
      
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: { str: string }) => item.str).join(' ');
        fullText += pageText + '\n';
      }
      return fullText;
    } catch (err) {
      console.error('[WebRAG] PDF extraction failed:', err);
      throw new Error(`Failed to parse PDF: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      // CRITICAL: Always destroy the document to fully release memory in Chrome
      if (pdf) {
        try {
          await pdf.destroy();
        } catch (e) {
          console.warn('[WebRAG] Failed to destroy PDF document:', e);
        }
      }
    }
  }
  
  if (name.endsWith('.docx')) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const docXml = await zip.file('word/document.xml')?.async('text');
      if (!docXml) return '';
      
      // Extract text inside XML tags <w:t>
      const matches = docXml.match(/<w:t[^>]*>(.*?)<\/w:t>/g) || [];
      const text = matches
        .map(match => match.replace(/<[^>]+>/g, ''))
        .join(' ');
      return text;
    } catch (err) {
      console.error('[WebRAG] DOCX extraction failed:', err);
      throw new Error(`Failed to parse Word Document: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Text-based fallback (Txt, Md, Json, CSV, Log, Py, Js, etc.)
  return await file.text();
}

/**
 * Recursively parses dropped files and directories from a React DragEvent.
 * Fully supports folder hierarchies and paginates directory reading to ensure
 * that directories with hundreds of files are fully read.
 */
export async function getFilesFromDragEvent(e: React.DragEvent): Promise<File[]> {
  const items = e.dataTransfer.items;
  if (!items) {
    // Fallback if dataTransfer.items is not supported
    return Array.from(e.dataTransfer.files || []).filter(isValidFile);
  }

  const files: File[] = [];

  async function traverse(entry: any, path: string = ''): Promise<void> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const currentPath = path ? `${path}/${entry.name}` : entry.name;
    if (entry.isFile) {
      if (!isValidFile(entry)) {
        return; // Skip binary assets early
      }
      try {
        const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
        
        if (!isValidFile(file)) {
          return; // Skip if file is binary
        }

        // Inject webkitRelativePath to preserve the folder structure in the app
        try {
          Object.defineProperty(file, 'webkitRelativePath', {
            value: currentPath,
            writable: true,
            configurable: true,
            enumerable: true
          });
        } catch (err) {
          console.warn('[WebRAG] Failed to set webkitRelativePath on dropped file:', err);
        }
        
        files.push(file);
      } catch (err) {
        console.warn(`[WebRAG] Failed to read dropped file entry ${entry.name}:`, err);
      }
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      
      // Read all entries in the directory (handling webkitGetAsEntry/readEntries pagination)
      const readEntries = async (): Promise<any[]> => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const entries: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
        let batch: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
        do {
          batch = await new Promise<any[]>((resolve, reject) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            dirReader.readEntries(resolve, reject);
          });
          entries.push(...batch);
        } while (batch.length > 0);
        return entries;
      };

      try {
        const childEntries = await readEntries();
        const tasks = childEntries.map(childEntry => traverse(childEntry, currentPath));
        await Promise.all(tasks);
      } catch (err) {
        console.warn(`[WebRAG] Failed to read directory entries for ${entry.name}:`, err);
      }
    }
  }

  const tasks: Promise<void>[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry();
      if (entry) {
        tasks.push(traverse(entry));
      } else {
        const file = item.getAsFile();
        if (file && isValidFile(file)) files.push(file);
      }
    }
  }

  await Promise.all(tasks);
  return files;
}
