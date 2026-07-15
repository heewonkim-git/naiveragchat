import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Samsung Biologics IR Chat",
  description: "삼성바이오로직스 사업보고서 기반 IR 챗봇",
};

// 첫 페인트 전에 저장된 테마를 적용해 깜빡임(FOUC) 방지
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(t){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
