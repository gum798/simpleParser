import { test, expect, type Page } from '@playwright/test';

// 메뉴바(편집/보기) 항목 실행: 메뉴 열고 → 항목 클릭
async function menuAction(page: Page, menu: string, item: string): Promise<void> {
  await page.locator('.menu-btn', { hasText: new RegExp(`^${menu} ▾$`) }).click();
  await page.locator('.menu-item', { hasText: new RegExp(`^${item}$`) }).click();
}

// 정렬은 메뉴 밖 독립 버튼(.menu-btn, 텍스트 '정렬', ▾ 없음)
async function clickFormat(page: Page): Promise<void> {
  await page.locator('.menu-btn', { hasText: /^정렬$/ }).click();
}

test('정렬 → 트리 → 저장 → 새로고침 복원', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.type('{"a":1,"b":[2,3]}');

  await clickFormat(page);
  await expect(page.locator('.cm-content')).toContainText('"a": 1');

  await menuAction(page, '보기', '트리');
  await expect(page.locator('#panel .tree-node').first()).toBeVisible();

  await menuAction(page, '편집', '저장');
  await expect(page.locator('#save-dialog')).toBeVisible();
  await expect(page.locator('#save-dialog .save-url')).toHaveValue(/#/);
  await expect.poll(() => page.url()).toContain('#');

  const shared = page.url();
  await page.goto(shared);
  await expect(page.locator('.cm-content')).toContainText('"a"');
});

test('정렬을 누르면 에디터가 좌상단으로 스크롤된다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#format-select').selectOption('json');
  await page.locator('.cm-content').click();
  // 중복 키 → 자동 정렬 보류 → 긴 한 줄 그대로 유지(가로 스크롤 가능)
  await page.evaluate(() => {
    const long = '{"a":1,"z":"' + 'x'.repeat(300) + '","a":2}';
    const dt = new DataTransfer();
    dt.setData('text/plain', long);
    document
      .querySelector('.cm-content')!
      .dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(500);
  await page.locator('.cm-scroller').evaluate((el) => el.scrollTo(el.scrollWidth, 0));
  await expect.poll(() => page.locator('.cm-scroller').evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await page.locator('.menu-btn', { hasText: /^정렬$/ }).click();
  // 좌상단으로 복귀(거터 여백 탓 1px 정도는 허용 — 시각적으로 왼쪽 끝)
  await expect.poll(() => page.locator('.cm-scroller').evaluate((el) => el.scrollLeft)).toBeLessThan(5);
});

test('Cmd/Ctrl+S 단축키로 저장 팝업 표시', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"k":1}');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('#save-dialog')).toBeVisible();
  await expect(page.locator('#save-dialog .save-url')).toHaveValue(/#/);
});

test('클린 버튼이 에디터 내용을 지운다', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"a":1}');
  await expect(page.locator('.cm-content')).toContainText('"a"');
  await menuAction(page, '편집', '클린');
  await expect(page.locator('.cm-content')).toHaveText('');
});

test('저장 팝업의 [사이트만 공유하기]는 문서 없는 도구 링크를 복사', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"a":1}');
  await menuAction(page, '편집', '저장');
  await page.getByRole('button', { name: '사이트만 공유하기' }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).not.toContain('#'); // 프래그먼트(문서) 없음
  expect(clip).toMatch(/^https?:\/\//); // 도구 URL
});

test('깨진 JSON은 상태줄에 줄:열 에러를 표시', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{\n"a":1\n"b":2\n}');
  // 정렬은 복구 후 유효해지므로, 깨진 입력의 진단은 트리(뷰) 경로로 확인
  await menuAction(page, '보기', '트리');
  await expect(page.locator('#status')).toContainText('줄');
});

test('로그에 박힌 JSON을 정렬로 추출(JSON 선택)', async ({ page }) => {
  await page.goto('/');
  await page.locator('#format-select').selectOption('json');
  await page.locator('.cm-content').click();
  await page.keyboard.type('log body={"x":1}');
  await clickFormat(page);
  await expect(page.locator('.cm-content')).toContainText('"x": 1');
});

test('Markdown 미리보기 렌더', async ({ page }) => {
  await page.goto('/');
  await page.locator('#format-select').selectOption('markdown');
  await page.locator('.cm-content').click();
  await page.keyboard.type('# 안녕');
  await menuAction(page, '보기', '미리보기');
  await expect(page.locator('#panel .markdown-body h1')).toHaveText('안녕');
});

test('저장 팝업의 [닫기] 버튼이 다이얼로그를 닫는다', async ({ page }) => {
  await page.goto('/');
  await menuAction(page, '편집', '저장');
  await expect(page.locator('#save-dialog')).toBeVisible();
  await page.locator('#save-dialog').getByRole('button', { name: '닫기' }).click();
  await expect(page.locator('#save-dialog')).toBeHidden();
});

test('저장 팝업을 닫은 뒤 하이라이트 메뉴가 다시 동작한다(모달이 막지 않음)', async ({ page }) => {
  await page.goto('/');
  await menuAction(page, '편집', '저장');
  await page.locator('#save-dialog').getByRole('button', { name: '닫기' }).click();
  await expect(page.locator('#save-dialog')).toBeHidden();
  await menuAction(page, '보기', '하이라이트');
  await expect(page.locator('#rules .rule-add')).toBeVisible();
});

test('하이라이트 패널은 기본 숨김이고 토글로 열고 닫힌다', async ({ page }) => {
  await page.goto('/');
  // 오버레이가 로드 때부터 떠 있지 않아야 한다([hidden]이 실제로 숨겨야 함)
  await expect(page.locator('#rules')).toBeHidden();
  await menuAction(page, '보기', '하이라이트');
  await expect(page.locator('#rules')).toBeVisible();
  await menuAction(page, '보기', '하이라이트');
  await expect(page.locator('#rules')).toBeHidden();
});

test('하이라이트 패널이 열리면 에디터·트리에 하단 여백이 생겨 가려진 내용을 스크롤로 볼 수 있다', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.evaluate(() => {
    const big = JSON.stringify({ a: Array.from({ length: 30 }, (_, i) => i) });
    const dt = new DataTransfer();
    dt.setData('text/plain', big);
    document
      .querySelector('.cm-content')!
      .dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(500);
  await menuAction(page, '보기', '하이라이트');
  await menuAction(page, '보기', '트리');
  // 오버레이가 가리는 만큼 에디터·트리 모두 하단 여백이 생겨야 함(가려진 내용을 위로 스크롤 가능)
  const pad = await page.locator('.cm-content').evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
  expect(pad).toBeGreaterThan(100);
  const treePad = await page.locator('#panel').evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
  expect(treePad).toBeGreaterThan(100);
});

test('하이라이트 패널을 열면 바로 입력 가능한 규칙 줄이 보인다', async ({ page }) => {
  await page.goto('/');
  await menuAction(page, '보기', '하이라이트');
  // 빈 상태로 열어도 정규식 입력 칸이 바로 보여야 한다(패널이 '안 열린 것처럼' 보이지 않게)
  await expect(page.locator('#rules .rule-regex')).toBeVisible();
});

test('규칙창을 오른쪽으로 도킹할 수 있고 새로고침 후에도 유지된다', async ({ page }) => {
  await page.goto('/');
  await menuAction(page, '보기', '하이라이트');
  await page.locator('#rules .rules-dock').click();
  // 오른쪽 도킹: 패널이 화면 오른쪽 절반에 붙음
  const vw = page.viewportSize()!.width;
  const box = await page.locator('#rules').boundingBox();
  expect(box!.x).toBeGreaterThan(vw / 2);
  // 에디터에 오른쪽 여백이 생겨 긴 줄도 패널 밖으로 스크롤 가능
  const padR = await page
    .locator('.cm-content')
    .evaluate((el) => parseFloat(getComputedStyle(el).paddingRight));
  expect(padR).toBeGreaterThan(100);
  // 도킹 선택은 localStorage에 저장 → 새로고침 후 유지
  await page.reload();
  await menuAction(page, '보기', '하이라이트');
  const box2 = await page.locator('#rules').boundingBox();
  expect(box2!.x).toBeGreaterThan(vw / 2);
  // 다시 아래로 되돌리기도 동작
  await page.locator('#rules .rules-dock').click();
  const box3 = await page.locator('#rules').boundingBox();
  expect(box3!.x).toBeLessThan(vw / 2);
});

test('하이라이트 규칙 추가 → 매칭 텍스트 강조 + 새로고침 유지', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('hello world hello');

  await menuAction(page, '보기', '하이라이트');
  // 패널을 열면 입력 줄이 자동으로 보이므로 바로 정규식 입력
  await page.locator('#rules .rule-regex').first().fill('hello');

  // 매칭 텍스트에 배경 스타일이 입은 mark 출현
  await expect(page.locator('.cm-content span[style*="background-color"]').first()).toBeVisible();

  // 새로고침 후에도 규칙이 localStorage에서 복원
  await page.reload();
  await menuAction(page, '보기', '하이라이트');
  await expect(page.locator('#rules .rule-regex').first()).toHaveValue('hello');
});

test('압축 JSON을 붙여넣으면 자동으로 정렬된다(버튼 없이)', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  // CodeMirror에 실제 paste 이벤트를 전달(타이핑이 아니라 붙여넣기 경로를 타게 함)
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', '{"a":1,"b":[2,3]}');
    const el = document.querySelector('.cm-content')!;
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  });
  // [정렬] 버튼을 누르지 않아도 자동 정렬되어 들여쓰기가 생긴다
  await expect(page.locator('.cm-content')).toContainText('"a": 1');
});

test('정규화가 필요한 JSON(소수)도 붙여넣으면 자동 정렬된다', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', '{"n":1.0,"m":2}');
    document
      .querySelector('.cm-content')!
      .dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  // 1.0→1 정규화가 있어도 '충실한 정렬'이라 자동 적용 → 공백 있는 정렬 표기 등장
  await expect(page.locator('.cm-content')).toContainText('"n": 1');
});

test('중복 키 JSON은 붙여넣어도 자동 정렬로 병합되지 않는다(데이터 손실 방지)', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', '{"a":1,"a":2}');
    document
      .querySelector('.cm-content')!
      .dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  // 자동 정렬 보류 → 원문 유지(중복 키 그대로), 마지막 값으로 병합되지 않음
  await expect(page.locator('.cm-content')).toContainText('{"a":1,"a":2}');
});

test('우클릭 → 색상 선택 → 선택 텍스트가 하이라이트 규칙으로 추가', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('needle haystack needle');
  // 첫 단어 'needle'(6자) 선택
  await page.keyboard.press('Home');
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
  // 우클릭(합성 contextmenu) → 색상 팔레트
  await page.evaluate(() => {
    document
      .querySelector('.cm-content')!
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 120 }));
  });
  await expect(page.locator('.ctx-highlight')).toBeVisible();
  await page.locator('.ctx-swatch').first().click();
  // 두 'needle'에 배경 강조 span 출현
  await expect(page.locator('.cm-content span[style*="background-color"]').first()).toBeVisible();
  // 규칙 패널에 규칙 1개 추가됨
  await menuAction(page, '보기', '하이라이트');
  await expect(page.locator('#rules .rule-regex')).toHaveCount(1);
  await expect(page.locator('#rules .rule-regex').first()).toHaveValue('needle');
});

test('자동 정렬은 주변 텍스트를 지우지 않는다(붙여넣기 데이터 손실 방지)', async ({ page }) => {
  await page.goto('/');
  await page.locator('#format-select').selectOption('json'); // 수동 JSON → 감지 우회, 자동 정렬 경로 강제
  await page.locator('.cm-content').click();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', '앞 텍스트 {"a":1} 뒤 텍스트');
    document
      .querySelector('.cm-content')!
      .dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  // 비파괴 정렬이 아니므로(JSON 추출은 내용 변경) 자동 적용 보류 → 주변 텍스트가 그대로 남는다
  await expect(page.locator('.cm-content')).toContainText('앞 텍스트');
  await expect(page.locator('.cm-content')).toContainText('뒤 텍스트');
});

test('타이핑은 자동 정렬을 유발하지 않는다(붙여넣기에만, 너무 자주 방지)', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"x":9,"y":8}'); // 한 글자씩 입력 = 타이핑 경로
  await page.waitForTimeout(500); // 디바운스/유휴 콜백이 돌 시간을 충분히 준다
  // 타이핑에는 paste 리스너가 안 걸리므로 압축 상태 유지(정렬됐다면 '"x": 9'처럼 공백이 생김)
  await expect(page.locator('.cm-content')).not.toContainText('"x": 9');
});

test('트리 노드 클릭 → 에디터가 해당 위치를 선택', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"alpha":111,"beta":222}');
  await clickFormat(page);
  await menuAction(page, '보기', '트리');

  // 좌우 분할: 트리 패널이 보임
  await expect(page.locator('#panel .tree-node').first()).toBeVisible();

  // 'beta' 노드 라벨 클릭 → 에디터에 선택 영역 생성
  await page.locator('#panel .tree-label', { hasText: 'beta' }).first().click();
  await expect(page.locator('.cm-editor .cm-selectionBackground').first()).toBeVisible();
});

test('트리 패널 열림 상태가 URL에 저장되어 새로고침 후에도 유지', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"a":1}');
  await menuAction(page, '보기', '트리');
  await expect(page.locator('#panel .tree-node').first()).toBeVisible();
  await page.waitForTimeout(500); // persist(디바운스 400ms)가 해시에 반영될 시간
  await page.reload();
  // localStorage가 아니라 URL 해시가 운반 → 새로고침해도 트리가 열려 있다
  await expect(page.locator('#panel .tree-node').first()).toBeVisible();
});

test('하이라이트 규칙이 URL로 공유된다(빈 localStorage 새 세션에서도 복원)', async ({ page, browser }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('hello');
  await menuAction(page, '보기', '하이라이트');
  await page.locator('#rules .rule-regex').first().fill('hello');
  await page.waitForTimeout(500); // 규칙 편집 → persist 반영
  const shared = page.url();
  expect(shared).toContain('#');

  // 독립 localStorage를 가진 새 컨텍스트에서 공유 링크 열기 → 규칙은 URL에서만 올 수 있다
  const ctx = await browser.newContext();
  const fresh = await ctx.newPage();
  await fresh.goto(shared);
  // h=true도 URL에 저장돼 규칙 패널이 자동으로 열려 있음 → 입력칸에 정규식이 복원
  await expect(fresh.locator('#rules')).toBeVisible();
  await expect(fresh.locator('#rules .rule-regex').first()).toHaveValue('hello');
  // 링크만 연 경우 받는 사람 localStorage는 건드리지 않는다 → 규칙은 URL에서만 왔음을 증명
  const stored = await fresh.evaluate(() => localStorage.getItem('simpleparser.highlightRules'));
  expect(stored).toBeNull();
  await ctx.close();
});

test('테마설정에서 투명도를 바꾸면 --glass-alpha가 실시간 반영·저장된다', async ({ page }) => {
  await page.goto('/');
  await menuAction(page, '보기', '테마설정');
  await expect(page.locator('#theme-panel')).toBeVisible();
  // 첫 슬라이더 = 투명도. 범위 입력이라 value 설정 + input 이벤트 디스패치
  await page.locator('#theme-panel .theme-slider').first().evaluate((el: HTMLInputElement) => {
    el.value = '30';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const alpha = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--glass-alpha').trim(),
  );
  expect(alpha).toBe('0.3'); // 적용은 실시간
  await page.waitForTimeout(500); // 저장은 디바운스(400ms)
  const stored = await page.evaluate(() => localStorage.getItem('simpleparser.theme'));
  expect(stored).toContain('0.3');
});
