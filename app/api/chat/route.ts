import Anthropic from "@anthropic-ai/sdk";
import { retrieve } from "@/lib/retrieval";
import { generateHypothetical } from "@/lib/hyde";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-4-8";
const TOP_K = 6;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function buildSystemPrompt(context: string): string {
  return `당신은 삼성바이오로직스 사업보고서(2026.05.15 정정본, 17~39페이지 발췌) 내용을 근거로 답하는 한국어 RAG 어시스턴트입니다.

다음 규칙을 반드시 지키세요:
- 아래 <context> 안의 발췌 내용에만 근거해 답변합니다. 추측하거나 외부 지식을 지어내지 마세요.
- 근거가 된 문장의 출처 페이지를 답변 안에 (p.19) 형태로 표기합니다.
- <context> 에서 답을 찾을 수 없으면 "제공된 문서 범위(17~39페이지)에서는 관련 내용을 찾을 수 없습니다." 라고 솔직히 답합니다.
- 숫자·수치는 문서에 나온 그대로 정확히 인용합니다.
- 표 형태 데이터는 필요하면 읽기 쉽게 정리해 설명합니다.
- 간결하고 명확한 한국어로 답합니다.

<context>
${context}
</context>`;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY 가 설정되지 않았습니다." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  let body: { messages?: ChatMessage[]; mode?: "naive" | "hyde" };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "잘못된 요청 형식입니다." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const messages = (body.messages || []).filter(
    (m) => m.role && typeof m.content === "string"
  );
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return new Response(JSON.stringify({ error: "질문이 없습니다." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const mode = body.mode === "hyde" ? "hyde" : "naive";
  const client = new Anthropic();
  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // 1) 검색 쿼리 결정
        //    - naive: 질문을 그대로 검색
        //    - hyde : 질문으로 '가상 정답 문단'을 생성하고, 그 문단으로 검색 (핵심)
        let query = lastUser!.content;
        let hypothetical: string | undefined;
        if (mode === "hyde") {
          try {
            hypothetical = await generateHypothetical(
              client,
              MODEL,
              lastUser!.content
            );
            query = hypothetical;
          } catch {
            // 가상 문단 생성 실패 시 naive 방식으로 폴백
            query = lastUser!.content;
          }
        }

        // 2) 실제 문서 검색 (가상 문단은 미끼로만 쓰고 버림 — 근거는 진짜 문서)
        const hits = retrieve(query, TOP_K);
        const context = hits
          .map((h) => `[p.${h.page}] ${h.text}`)
          .join("\n\n");

        // 출처(중복 페이지 제거) — 근거 문단 텍스트도 함께 전달
        const seenPages = new Set<number>();
        const sources: { page: number; text: string }[] = [];
        for (const h of hits) {
          if (seenPages.has(h.page)) continue;
          seenPages.add(h.page);
          sources.push({ page: h.page, text: h.text.slice(0, 700) });
        }
        sources.sort((a, b) => a.page - b.page);

        // 스트림 첫 줄 = 메타데이터(JSON): 출처 + 모드 + (참고용) 가상문단
        controller.enqueue(
          encoder.encode(JSON.stringify({ sources, mode, hypothetical }) + "\n")
        );

        // 3) 최종 답변 생성 (진짜 문서 근거로 스트리밍)
        const stream = client.messages.stream({
          model: MODEL,
          max_tokens: 2048,
          system: buildSystemPrompt(context || "(검색 결과 없음)"),
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "알 수 없는 오류";
        controller.enqueue(encoder.encode(`\n\n[오류] ${msg}`));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
