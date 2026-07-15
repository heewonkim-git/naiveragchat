// 순수 TypeScript BM25 구현 + 한국어 친화 토크나이저.
// 외부 서비스/의존성 없이 서버리스(Vercel)에서 동작한다.

const HANGUL = /[가-힣]/;

/**
 * 한국어/영문 혼합 텍스트 토크나이저.
 * - 한글 어절: 길이 3+ 이면 문자 bigram 으로 분해해 부분일치 재현율을 높인다.
 * - 영문/숫자: 소문자 단어 단위.
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const matches = text.toLowerCase().match(/[가-힣]+|[a-z0-9]+/g);
  if (!matches) return tokens;
  for (const m of matches) {
    if (HANGUL.test(m)) {
      if (m.length <= 2) {
        tokens.push(m);
      } else {
        for (let i = 0; i < m.length - 1; i++) tokens.push(m.slice(i, i + 2));
      }
    } else {
      tokens.push(m);
    }
  }
  return tokens;
}

interface Posting {
  docId: number;
  tf: number;
}

export class BM25 {
  private readonly k1 = 1.5;
  private readonly b = 0.75;
  private inverted = new Map<string, Posting[]>();
  private docLen: number[] = [];
  private avgdl = 0;
  private N = 0;

  constructor(docs: string[]) {
    this.N = docs.length;
    let totalLen = 0;
    docs.forEach((doc, docId) => {
      const terms = tokenize(doc);
      this.docLen[docId] = terms.length;
      totalLen += terms.length;
      const tf = new Map<string, number>();
      for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
      for (const [term, freq] of tf) {
        let postings = this.inverted.get(term);
        if (!postings) {
          postings = [];
          this.inverted.set(term, postings);
        }
        postings.push({ docId, tf: freq });
      }
    });
    this.avgdl = this.N > 0 ? totalLen / this.N : 0;
  }

  private idf(term: string): number {
    const df = this.inverted.get(term)?.length ?? 0;
    if (df === 0) return 0;
    // BM25 idf (음수 방지를 위해 +1 을 씌운 형태)
    return Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
  }

  /** query 에 대해 상위 topK 문서의 {docId, score} 를 반환한다. */
  search(query: string, topK: number): { docId: number; score: number }[] {
    const qterms = new Set(tokenize(query));
    const scores = new Map<number, number>();
    for (const term of qterms) {
      const postings = this.inverted.get(term);
      if (!postings) continue;
      const idf = this.idf(term);
      for (const { docId, tf } of postings) {
        const dl = this.docLen[docId];
        const denom = tf + this.k1 * (1 - this.b + (this.b * dl) / this.avgdl);
        const inc = idf * ((tf * (this.k1 + 1)) / denom);
        scores.set(docId, (scores.get(docId) || 0) + inc);
      }
    }
    return [...scores.entries()]
      .map(([docId, score]) => ({ docId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
