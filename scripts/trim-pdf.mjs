// 로컬 전용: 원본 사업보고서에서 지정 페이지 범위만 잘라 새 PDF 로 저장한다.
//
//   npm run trim              (기본 17~39페이지)
//   PAGE_START=17 PAGE_END=39 npm run trim
//
// 산출물: <원본이름>_<start>-<end>p.pdf

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const PAGE_START = parseInt(process.env.PAGE_START ?? "17", 10);
const PAGE_END = parseInt(process.env.PAGE_END ?? "39", 10);

function findSourcePdf() {
  if (process.env.SOURCE_PDF) {
    const p = path.isAbsolute(process.env.SOURCE_PDF)
      ? process.env.SOURCE_PDF
      : path.join(ROOT, process.env.SOURCE_PDF);
    if (fs.existsSync(p)) return p;
    throw new Error(`SOURCE_PDF 경로를 찾을 수 없습니다: ${p}`);
  }
  // 이미 잘린 결과물(_<n>-<m>p.pdf)은 제외하고 원본을 찾는다.
  const pdfs = fs
    .readdirSync(ROOT)
    .filter((f) => f.toLowerCase().endsWith(".pdf") && !/_\d+-\d+p\.pdf$/i.test(f))
    .sort();
  if (pdfs.length === 0) throw new Error("원본 PDF 를 찾을 수 없습니다.");
  return path.join(ROOT, pdfs[0]);
}

async function main() {
  const src = findSourcePdf();
  const bytes = fs.readFileSync(src);
  const srcDoc = await PDFDocument.load(bytes);
  const total = srcDoc.getPageCount();

  const start = Math.max(1, PAGE_START);
  const end = Math.min(total, PAGE_END);
  if (start > end) throw new Error(`잘못된 페이지 범위: ${start}-${end} (전체 ${total}쪽)`);

  const out = await PDFDocument.create();
  const indices = [];
  for (let i = start; i <= end; i++) indices.push(i - 1); // 0-indexed
  const copied = await out.copyPages(srcDoc, indices);
  copied.forEach((p) => out.addPage(p));

  const outBytes = await out.save();
  const base = path.basename(src, ".pdf");
  const outName = `${base}_${start}-${end}p.pdf`;
  fs.writeFileSync(path.join(ROOT, outName), outBytes);

  // 웹 뷰어용 정적 자산 (public/report.pdf)
  fs.mkdirSync(path.join(ROOT, "public"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "public", "report.pdf"), outBytes);

  console.log(`완료 ✅  ${start}~${end}페이지 (${indices.length}쪽) 추출`);
  console.log(`  ${outName}`);
  console.log(`  public/report.pdf (뷰어용)`);
}

main().catch((err) => {
  console.error("\n[오류]", err.message);
  process.exit(1);
});
