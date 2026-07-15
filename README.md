# 삼성바이오로직스 사업보고서 RAG 챗봇

삼성바이오로직스 사업보고서(2026.05.15 정정본) **17~39페이지** 발췌를 지식베이스로 하는
RAG 챗봇입니다. Next.js(App Router) + Claude(`claude-opus-4-8`)로 만들었고 Vercel 배포에 맞춰져 있습니다.

- **검색**: 순수 TypeScript **BM25** (한국어 토크나이저 포함) — 외부 벡터DB/임베딩 API 불필요
- **생성**: Anthropic **Claude** 스트리밍 답변, 출처 페이지 표시
- **디자인**: design.md 스타일(테라코타 · 에디토리얼), 다크모드 지원

---

## 1. 구조

```
app/
  layout.tsx            # 레이아웃
  page.tsx              # 채팅 UI (스트리밍 렌더링)
  globals.css           # design.md 테마
  api/chat/route.ts     # RAG + Claude 스트리밍 API
lib/
  bm25.ts               # BM25 + 한국어 토크나이저
  retrieval.ts          # chunks.json 로드 + 검색
scripts/
  trim-pdf.mjs          # (로컬) 원본 PDF -> 17~39p 잘라내기
  ingest.mjs            # (로컬) PDF -> data/chunks.json
data/
  chunks.json           # 인덱스 (커밋됨, 런타임에서 사용)
  meta.json             # 인덱스 메타정보
```

> 런타임에 필요한 데이터는 **`data/chunks.json` 하나뿐**입니다(커밋되어 배포에 포함됨).
> Vercel에서는 PDF 파싱을 하지 않습니다 — 인덱싱은 로컬에서 미리 수행합니다.

---

## 2. 로컬 실행

```bash
npm install

# .env.local 에 API 키 설정
cp .env.example .env.local
#   ANTHROPIC_API_KEY=sk-ant-...   (https://console.anthropic.com)

npm run dev
# http://localhost:3000
```

### 인덱스를 다시 만들고 싶을 때 (페이지 범위 변경 등)

```bash
# 대상 페이지 범위 잘라내기 (기본 17~39)
npm run trim
#   PAGE_START=17 PAGE_END=39 npm run trim

# 인덱스 재생성 (원본 페이지 번호 유지)
npm run ingest
#   PAGE_START=1 PAGE_END=99999 npm run ingest   # 전체 문서를 원하면
```

`ingest`는 원본 PDF에서 지정한 페이지만 추출하되 **출처 페이지 번호는 원본 그대로(17~39) 유지**합니다.

---

## 3. Vercel 배포

이미 생성해 둔 GitHub 레포(`heewonkim-git/naiveragchat`)를 사용합니다.

### (1) 코드 푸시

```bash
git init                       # 아직 git 레포가 아니면
git add .
git commit -m "SBL RAG chatbot"
git branch -M main
git remote add origin https://github.com/heewonkim-git/naiveragchat.git
git push -u origin main
```

> `data/chunks.json`이 커밋에 포함되는지 꼭 확인하세요(이게 있어야 배포본이 검색을 합니다).

### (2) Vercel 연결

1. [vercel.com](https://vercel.com) → **Add New → Project** → 위 GitHub 레포 Import
2. Framework는 자동으로 **Next.js** 인식 (별도 설정 불필요)
3. **Environment Variables** 에 추가:
   - `ANTHROPIC_API_KEY` = `sk-ant-...`  (필수)
   - `CLAUDE_MODEL` = `claude-opus-4-8`  (선택)
4. **Deploy**

배포 후에는 GitHub에 push할 때마다 자동 재배포됩니다.

---

## 4. 동작 원리

1. 사용자의 질문을 BM25로 검색해 관련 청크 상위 6개를 뽑습니다(`lib/retrieval.ts`).
2. 청크를 `[p.19] ...` 형태로 컨텍스트에 넣고, "이 문서 근거로만 답하고 출처 페이지를 표기하라"는
   시스템 프롬프트와 함께 Claude에 스트리밍 요청합니다(`app/api/chat/route.ts`).
3. 답변 토큰을 그대로 스트리밍하고, 참고한 페이지를 응답 헤더(`x-sources`)로 전달해 UI에 칩으로 표시합니다.

---

## 5. 한계 / 개선 여지

- **BM25**는 키워드 기반이라 질문에 문서 용어가 그대로 나오면 강하지만, 돌려 물으면 약할 수 있습니다.
  의미검색이 필요하면 Voyage/OpenAI 임베딩으로 `lib/retrieval.ts`의 `retrieve()`만 교체하면 됩니다.
- 표가 많은 페이지는 PDF 텍스트 추출 특성상 셀 구분이 흐려질 수 있습니다.
- 현재 지식베이스는 **17~39페이지**로 한정되어 있습니다.
