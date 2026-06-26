# simpleParser

브라우저에서 동작하는 다포맷 포맷터/뷰어. JSON · HTML · XML · YAML 정렬·트리뷰,
Markdown 미리보기를 제공하고, 문서 상태를 URL에 담아 공유합니다. 백엔드 없음.

## 개발

```bash
npm install
npm run dev      # 개발 서버
npm test         # 유닛 테스트 (Vitest)
npm run e2e      # E2E 스모크 (Playwright)
npm run build    # dist/index.html (단일 파일) 생성
npm run preview  # 빌드 결과 미리보기
```

## 동작

- 입력을 붙여넣으면 포맷을 자동 감지(드롭다운으로 수동 변경 가능).
- `정렬`: 제자리 prettify. 문법이 틀려도 가능한 한 정렬하고, 문제 위치를 줄:열로 표시.
- `트리`(JSON/HTML/XML/YAML) / `미리보기`(Markdown): 구조/렌더 보기.
- `공유`: 현재 상태가 담긴 URL을 복사. 데이터는 URL 프래그먼트(`#`)에만 있어 서버로 전송되지 않음.

## 배포 (Cloudflare Pages)

1. Cloudflare Pages에서 GitHub 저장소 `gum798/simpleParser` 연결.
2. 빌드 설정:
   - Build command: `npm run build`
   - Build output directory: `dist`
3. `main` 브랜치 푸시 시 자동 배포.

또는 수동 배포:

```bash
npm run build
npx wrangler pages deploy dist
```
