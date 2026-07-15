export const metadata = {
  title: "Naive RAG vs HyDE · Samsung Biologics IR Chat",
};

export default function ComparePage() {
  return (
    <div className="compare">
      <header className="compare-head">
        <h1 className="compare-title">
          Naive RAG <span className="vs">vs</span>{" "}
          <span className="brand-accent">HyDE</span>
        </h1>
        <p className="compare-sub">
          같은 코퍼스·임베딩·UI, <b>검색 단계만</b> 다릅니다. 동일한 질문을 양쪽에
          넣어 검색 결과와 답변을 비교해 보세요.
        </p>
      </header>

      <div className="compare-grid">
        <section className="pane">
          <div className="pane-head">
            <span className="pane-name">Naive</span>
            <span className="pane-desc">질문을 그대로 검색</span>
            <a className="pane-link" href="/naive" target="_blank" rel="noreferrer">
              전체화면 ↗
            </a>
          </div>
          <iframe className="pane-frame" src="/naive" title="Naive RAG" />
        </section>

        <section className="pane">
          <div className="pane-head">
            <span className="pane-name accent">HyDE</span>
            <span className="pane-desc">가상 정답 문단을 생성해 그것으로 검색</span>
            <a className="pane-link" href="/hyde" target="_blank" rel="noreferrer">
              전체화면 ↗
            </a>
          </div>
          <iframe className="pane-frame" src="/hyde" title="HyDE RAG" />
        </section>
      </div>
    </div>
  );
}
