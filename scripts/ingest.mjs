// 로컬 전용 빌드 스크립트: 사업보고서 PDF -> data/chunks.json
//
//   npm run ingest
//
// 결과 파일(data/chunks.json, data/meta.json)은 커밋되어 Vercel 배포 시 함께 올라간다.
// (Vercel 서버리스에서는 PDF 파싱을 하지 않는다. 이 스크립트는 로컬에서만 실행.)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");

const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 150;
const MIN_CHUNK = 40;

// 인덱싱 대상 페이지 범위(원본 페이지 번호 기준). 전체를 원하면 PAGE_START=1 PAGE_END=99999.
const PAGE_START = parseInt(process.env.PAGE_START ?? "17", 10);
const PAGE_END = parseInt(process.env.PAGE_END ?? "39", 10);

function findPdf() {
  const envPdf = process.env.SOURCE_PDF;
  if (envPdf) {
    const p = path.isAbsolute(envPdf) ? envPdf : path.join(ROOT, envPdf);
    if (fs.existsSync(p)) return p;
    throw new Error(`SOURCE_PDF 경로를 찾을 수 없습니다: ${p}`);
  }
  // 잘린 결과물(_<n>-<m>p.pdf)은 제외하고 원본을 인덱싱한다(원본 페이지 번호 유지).
  const pdfs = fs
    .readdirSync(ROOT)
    .filter((f) => f.toLowerCase().endsWith(".pdf") && !/_\d+-\d+p\.pdf$/i.test(f))
    .sort();
  if (pdfs.length === 0) {
    throw new Error("프로젝트 폴더에 PDF가 없습니다. SOURCE_PDF 환경변수로 지정하세요.");
  }
  return path.join(ROOT, pdfs[0]);
}

function clean(text) {
  return text
    .replace(/\x00/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPages(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    if (i < PAGE_START || i > PAGE_END) continue; // 지정 범위만 인덱싱
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      text += item.str;
      if (item.hasEOL) text += "\n";
      else text += " ";
    }
    text = clean(text);
    if (text) pages.push({ page: i, text });
    page.cleanup();
  }
  return pages;
}

function chunkPages(pages) {
  const chunks = [];
  let id = 0;
  for (const { page, text } of pages) {
    if (text.length <= CHUNK_SIZE) {
      chunks.push({ id: id++, page, text });
      continue;
    }
    let start = 0;
    while (start < text.length) {
      const piece = text.slice(start, start + CHUNK_SIZE).trim();
      if (piece.length >= MIN_CHUNK) chunks.push({ id: id++, page, text: piece });
      if (start + CHUNK_SIZE >= text.length) break;
      start += CHUNK_SIZE - CHUNK_OVERLAP;
    }
  }
  return chunks.filter((c) => c.text.length >= MIN_CHUNK);
}

async function main() {
  const pdfPath = findPdf();
  console.log(`[1/3] PDF 로딩: ${path.basename(pdfPath)}  (대상 페이지 ${PAGE_START}~${PAGE_END})`);
  const pages = await extractPages(pdfPath);
  console.log(`      추출 페이지: ${pages.length}`);
  if (pages.length === 0) {
    throw new Error("텍스트를 추출하지 못했습니다. 스캔본 PDF일 수 있습니다(OCR 필요).");
  }

  console.log("[2/3] 청킹");
  const chunks = chunkPages(pages);
  console.log(`      청크: ${chunks.length}`);

  console.log("[3/3] 저장");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DATA_DIR, "chunks.json"),
    JSON.stringify(chunks),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(DATA_DIR, "meta.json"),
    JSON.stringify(
      {
        source: path.basename(pdfPath),
        pageRange: [PAGE_START, PAGE_END],
        numPages: pages.length,
        numChunks: chunks.length,
        builtAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf-8"
  );

  console.log(`\n완료 ✅  청크 ${chunks.length}개`);
  console.log(`  ${path.join("data", "chunks.json")}`);
}

main().catch((err) => {
  console.error("\n[오류]", err.message);
  process.exit(1);
});
