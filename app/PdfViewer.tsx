"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

// pdf.js 워커 (react-pdf 번들 pdfjs-dist 버전과 일치)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default function PdfViewer({
  page,
  highlight,
}: {
  page: number;
  highlight: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 해당 청크에 속한 텍스트 조각을 하이라이트
  const textRenderer = (props: { str: string }) => {
    const s = props.str.trim();
    if (s.length > 1 && highlight.includes(s)) {
      return `<mark class="pdf-hl">${escapeHtml(props.str)}</mark>`;
    }
    return escapeHtml(props.str);
  };

  return (
    <div className="pdfviewer" ref={ref}>
      <Document
        file="/report.pdf"
        loading={<div className="pdf-msg">PDF 불러오는 중…</div>}
        error={<div className="pdf-msg">PDF를 불러올 수 없습니다.</div>}
      >
        {width > 0 && (
          <Page
            pageNumber={page}
            width={width}
            customTextRenderer={textRenderer}
            renderAnnotationLayer={false}
            loading={<div className="pdf-msg">페이지 렌더링 중…</div>}
          />
        )}
      </Document>
    </div>
  );
}
