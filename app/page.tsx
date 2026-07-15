"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import meta from "@/data/meta.json";

// PDF 뷰어는 브라우저 전용 (SSR 비활성)
const PdfViewer = dynamic(() => import("./PdfViewer"), {
  ssr: false,
  loading: () => <div className="pdf-msg">뷰어 로딩…</div>,
});

// 잘린 PDF의 페이지 = 원본 페이지 - offset (예: 원본 17p → 뷰어 1p)
const PDF_OFFSET = (meta as { pageRange?: number[] }).pageRange
  ? (meta as { pageRange: number[] }).pageRange[0] - 1
  : 0;

interface Source {
  page: number;
  text: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

const SUGGESTIONS = [
  "회사의 자본금과 발행주식 현황을 알려줘",
  "정관 변경 이력이 있어?",
  "신용등급 평가 내역을 정리해줘",
  "자기주식 취득 관련 내용이 있나?",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [openRef, setOpenRef] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // 초기 테마 상태 판별 (저장값 우선, 없으면 OS 설정)
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const osDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setIsDark(stored ? stored === "dark" : osDark);
  }, []);

  function toggleTheme() {
    const next = isDark ? "light" : "dark";
    setIsDark(!isDark);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  }

  function autosize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;

    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content: q },
    ];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);
    if (taRef.current) taRef.current.style.height = "auto";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `요청 실패 (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let answer = "";
      let headerDone = false;
      let sources: Source[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        if (!headerDone) {
          // 첫 줄(JSON) = 출처 메타데이터, 이후 = 답변 텍스트
          buf += text;
          const nl = buf.indexOf("\n");
          if (nl < 0) continue;
          try {
            sources = JSON.parse(buf.slice(0, nl)).sources || [];
          } catch {
            sources = [];
          }
          answer = buf.slice(nl + 1);
          headerDone = true;
        } else {
          answer += text;
        }
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: answer,
            sources,
          };
          return copy;
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "오류가 발생했습니다.";
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content: `[오류] ${msg}`,
        };
        return copy;
      });
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const showEmpty = messages.length === 0;

  return (
    <div className="app">
      <button
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label="테마 전환"
        title="라이트/다크 전환"
      >
        {isDark ? "☀" : "☾"}
      </button>

      <header className="masthead">
        <p className="brand">
          Samsung Biologics <span className="brand-accent">IR Chat</span>
        </p>
        <p className="brand-sub">2025년 사업보고서 기준</p>
      </header>

      <div
        className={`thread${showEmpty ? " centered" : ""}`}
        ref={threadRef}
      >
        {showEmpty && (
          <div className="empty">
            <p>문서 내용에 근거해 답변하고 출처 페이지를 함께 표시합니다.</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <span className="role">
              {m.role === "user" ? "질문" : "IR Agent"}
            </span>
            <div
              className={`bubble${
                m.content.startsWith("[오류]") ? " error" : ""
              }`}
            >
              {m.content ? (
                m.content
              ) : (
                <span className="dots">
                  <span />
                  <span />
                  <span />
                </span>
              )}
            </div>
            {m.role === "assistant" && m.sources && m.sources.length > 0 && (
              <>
                <div className="sources">
                  {m.sources.map((s) => {
                    const key = `${i}:${s.page}`;
                    const open = openRef === key;
                    return (
                      <button
                        key={s.page}
                        className={`source-tag${open ? " open" : ""}`}
                        onClick={() => setOpenRef(open ? null : key)}
                      >
                        p.{s.page}
                      </button>
                    );
                  })}
                </div>
                {(() => {
                  if (!openRef || !openRef.startsWith(`${i}:`)) return null;
                  const page = Number(openRef.split(":")[1]);
                  const src = m.sources?.find((s) => s.page === page);
                  if (!src) return null;
                  return (
                    <div className="ref-panel">
                      <div className="ref-head">
                        <span className="ref-page">p.{src.page}</span> 원문 · 해당
                        부분 하이라이트
                        <a
                          className="ref-open"
                          href={`/report.pdf#page=${src.page - PDF_OFFSET}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          새 탭 ↗
                        </a>
                      </div>
                      <PdfViewer
                        page={src.page - PDF_OFFSET}
                        highlight={src.text}
                      />
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="composer">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            ref={taRef}
            value={input}
            placeholder="사업보고서에 대해 질문하세요…"
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              autosize();
            }}
            onKeyDown={onKeyDown}
          />
          <button
            className="send"
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="전송"
          >
            ↑
          </button>
        </form>
        <p className="disclaimer">
          AI가 문서 발췌를 근거로 생성한 답변이며 오류가 있을 수 있습니다. 원문을
          함께 확인하세요.
        </p>
      </div>
    </div>
  );
}
