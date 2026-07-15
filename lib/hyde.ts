// HyDE — Hypothetical Document Embeddings (여기서는 검색기가 BM25이므로 "가상 문단으로 검색").
// 질문에 대한 '가상의 정답 문단'을 LLM으로 생성하고, 그 문단을 검색 쿼리로 사용한다.
// 같은 질문은 캐싱해 반복 LLM 호출을 막는다(무료 API 한도 절약).

import type Anthropic from "@anthropic-ai/sdk";

const CACHE = new Map<string, string>();
const CACHE_MAX = 300;

const HYDE_PROMPT = (question: string) =>
  `당신은 삼성바이오로직스 사업보고서의 한 문단을 작성하는 역할입니다.
아래 질문에 대한 '가상의 정답 문단'을 한국어로 한 문단(3~5문장) 서술형으로 작성하세요.

- 실제 사업보고서의 공식적 문체로, 관련 용어와 수치가 들어간 것처럼 그럴듯하게 작성합니다.
- 사실 여부는 중요하지 않습니다. 이 문단은 검색용 '미끼'로만 사용됩니다.
- 머리말이나 설명 없이 문단 본문만 출력합니다.

질문: ${question}

문단:`;

/** 질문 → 가상 문단(검색용). 동일 질문은 캐시 반환. */
export async function generateHypothetical(
  client: Anthropic,
  model: string,
  question: string
): Promise<string> {
  const key = question.trim();
  const cached = CACHE.get(key);
  if (cached !== undefined) return cached;

  const res = await client.messages.create({
    model,
    max_tokens: 320,
    messages: [{ role: "user", content: HYDE_PROMPT(question) }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // 생성 실패 시 원 질문으로 폴백(검색은 계속되도록)
  const hypothetical = text || question;

  if (CACHE.size >= CACHE_MAX) {
    const first = CACHE.keys().next().value;
    if (first !== undefined) CACHE.delete(first);
  }
  CACHE.set(key, hypothetical);
  return hypothetical;
}
