// chunks.json 을 로드하고 BM25 인덱스를 (인스턴스당 1회) 구성한다.

import { BM25 } from "./bm25";
import chunksData from "@/data/chunks.json";

export interface Chunk {
  id: number;
  page: number;
  text: string;
}

export const chunks = chunksData as Chunk[];

// 콜드 스타트 시 1회 인덱싱 (706 청크 기준 수십 ms)
let indexSingleton: BM25 | null = null;
function getIndex(): BM25 {
  if (!indexSingleton) {
    indexSingleton = new BM25(chunks.map((c) => c.text));
  }
  return indexSingleton;
}

export interface RetrievedChunk extends Chunk {
  score: number;
}

export function retrieve(query: string, topK = 6): RetrievedChunk[] {
  if (!query.trim() || chunks.length === 0) return [];
  const hits = getIndex().search(query, topK);
  return hits
    .filter((h) => h.score > 0)
    .map((h) => ({ ...chunks[h.docId], score: h.score }));
}
