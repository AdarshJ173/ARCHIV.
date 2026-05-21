import { openDB, type IDBPDatabase } from 'idb'
import type { TranscriptFile, Chunk, VectorRecord, Bm25Term, IndexMetadata } from '@/types'

const DB_NAME = 'webrag'
const DB_VERSION = 1

let dbInstance: IDBPDatabase | null = null

export async function getDB(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('chunks')) {
        db.createObjectStore('chunks', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('vectors')) {
        db.createObjectStore('vectors', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('bm25')) {
        db.createObjectStore('bm25', { keyPath: 'term' })
      }
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' })
      }
    },
  })

  return dbInstance
}

export async function saveFiles(files: TranscriptFile[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('files', 'readwrite')
  for (const file of files) {
    await tx.store.put(file)
  }
  await tx.done
}

export async function getAllFiles(): Promise<TranscriptFile[]> {
  const db = await getDB()
  return db.getAll('files')
}

export async function deleteFile(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('files', id)
}

export async function clearFiles(): Promise<void> {
  const db = await getDB()
  await db.clear('files')
}

export async function saveChunks(chunks: Chunk[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('chunks', 'readwrite')
  for (const chunk of chunks) {
    await tx.store.put(chunk)
  }
  await tx.done
}

export async function getAllChunks(): Promise<Chunk[]> {
  const db = await getDB()
  return db.getAll('chunks')
}

export async function clearChunks(): Promise<void> {
  const db = await getDB()
  await db.clear('chunks')
}

export async function saveVectors(vectors: VectorRecord[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('vectors', 'readwrite')
  for (const v of vectors) {
    await tx.store.put(v)
  }
  await tx.done
}

export async function getAllVectors(): Promise<VectorRecord[]> {
  const db = await getDB()
  return db.getAll('vectors')
}

export async function clearVectors(): Promise<void> {
  const db = await getDB()
  await db.clear('vectors')
}

export async function saveBm25Terms(terms: Bm25Term[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('bm25', 'readwrite')
  for (const term of terms) {
    await tx.store.put(term)
  }
  await tx.done
}

export async function getBm25Term(term: string): Promise<Bm25Term | undefined> {
  const db = await getDB()
  return db.get('bm25', term)
}

export async function getAllBm25Terms(): Promise<Bm25Term[]> {
  const db = await getDB()
  return db.getAll('bm25')
}

export async function clearBm25(): Promise<void> {
  const db = await getDB()
  await db.clear('bm25')
}

export async function saveMetadata(meta: IndexMetadata): Promise<void> {
  const db = await getDB()
  await db.put('metadata', { key: 'index_info', ...meta })
}

export async function getMetadata(): Promise<IndexMetadata | undefined> {
  const db = await getDB()
  const result = await db.get('metadata', 'index_info')
  return result as IndexMetadata | undefined
}

export async function deleteFileAndData(fileId: string): Promise<void> {
  const db = await getDB()
  const chunks = await db.getAll('chunks')
  const fileChunks = chunks.filter(c => c.fileId === fileId)
  const chunkIds = new Set(fileChunks.map(c => c.id))

  const tx1 = db.transaction('chunks', 'readwrite')
  for (const c of fileChunks) {
    await tx1.store.delete(c.id)
  }
  await tx1.done

  const tx2 = db.transaction('vectors', 'readwrite')
  const allVectors = await db.getAll('vectors')
  for (const v of allVectors) {
    if (chunkIds.has(v.id)) {
      await tx2.store.delete(v.id)
    }
  }
  await tx2.done

  await db.delete('files', fileId)
}

export async function clearMetadata(): Promise<void> {
  const db = await getDB()
  await db.clear('metadata')
}

export async function clearAll(): Promise<void> {
  await clearFiles()
  await clearChunks()
  await clearVectors()
  await clearBm25()
  await clearMetadata()
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate()
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 }
  }
  return null
}
