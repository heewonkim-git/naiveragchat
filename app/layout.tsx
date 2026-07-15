import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "삼성바이오로직스 사업보고서 챗봇",
  description: "사업보고서(17~39p) 기반 RAG 챗봇",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
