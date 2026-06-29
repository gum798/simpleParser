import { test, expect } from '@playwright/test';

test('정렬 → 트리 → 저장 → 새로고침 복원', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.type('{"a":1,"b":[2,3]}');

  await page.getByRole('button', { name: '정렬' }).click();
  await expect(page.locator('.cm-content')).toContainText('"a": 1');

  await page.getByRole('button', { name: '트리' }).click();
  await expect(page.locator('#panel .tree-node').first()).toBeVisible();

  await page.getByRole('button', { name: '저장하기' }).click();
  await expect(page.locator('#save-dialog')).toBeVisible();
  await expect(page.locator('#save-dialog .save-url')).toHaveValue(/#/);
  await expect.poll(() => page.url()).toContain('#');

  const shared = page.url();
  await page.goto(shared);
  await expect(page.locator('.cm-content')).toContainText('"a"');
});

test('Cmd/Ctrl+S 단축키로 저장 팝업 표시', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"k":1}');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('#save-dialog')).toBeVisible();
  await expect(page.locator('#save-dialog .save-url')).toHaveValue(/#/);
});

test('깨진 JSON은 상태줄에 줄:열 에러를 표시', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{\n"a":1\n"b":2\n}');
  // 정렬은 복구 후 유효해지므로, 깨진 입력의 진단은 트리(뷰) 경로로 확인
  await page.getByRole('button', { name: '트리' }).click();
  await expect(page.locator('#status')).toContainText('줄');
});

test('로그에 박힌 JSON을 정렬로 추출(JSON 선택)', async ({ page }) => {
  await page.goto('/');
  await page.locator('#format-select').selectOption('json');
  await page.locator('.cm-content').click();
  await page.keyboard.type('log body={"x":1}');
  await page.getByRole('button', { name: '정렬' }).click();
  await expect(page.locator('.cm-content')).toContainText('"x": 1');
});

test('Markdown 미리보기 렌더', async ({ page }) => {
  await page.goto('/');
  await page.locator('#format-select').selectOption('markdown');
  await page.locator('.cm-content').click();
  await page.keyboard.type('# 안녕');
  await page.getByRole('button', { name: '미리보기' }).click();
  await expect(page.locator('#panel .markdown-body h1')).toHaveText('안녕');
});

test('저장 팝업의 [닫기] 버튼이 다이얼로그를 닫는다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '저장하기' }).click();
  await expect(page.locator('#save-dialog')).toBeVisible();
  await page.locator('#save-dialog').getByRole('button', { name: '닫기' }).click();
  await expect(page.locator('#save-dialog')).toBeHidden();
});

test('저장 팝업을 닫은 뒤 하이라이트 메뉴가 다시 동작한다(모달이 막지 않음)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '저장하기' }).click();
  await page.locator('#save-dialog').getByRole('button', { name: '닫기' }).click();
  await expect(page.locator('#save-dialog')).toBeHidden();
  await page.getByRole('button', { name: '하이라이트' }).click();
  await expect(page.locator('#rules .rule-add')).toBeVisible();
});

test('하이라이트 패널을 열면 바로 입력 가능한 규칙 줄이 보인다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '하이라이트' }).click();
  // 빈 상태로 열어도 정규식 입력 칸이 바로 보여야 한다(패널이 '안 열린 것처럼' 보이지 않게)
  await expect(page.locator('#rules .rule-regex')).toBeVisible();
});

test('하이라이트 규칙 추가 → 매칭 텍스트 강조 + 새로고침 유지', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('hello world hello');

  await page.getByRole('button', { name: '하이라이트' }).click();
  // 패널을 열면 입력 줄이 자동으로 보이므로 바로 정규식 입력
  await page.locator('#rules .rule-regex').first().fill('hello');

  // 매칭 텍스트에 배경 스타일이 입은 mark 출현
  await expect(page.locator('.cm-content span[style*="background-color"]').first()).toBeVisible();

  // 새로고침 후에도 규칙이 localStorage에서 복원
  await page.reload();
  await page.getByRole('button', { name: '하이라이트' }).click();
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

test('트리 노드 클릭 → 에디터가 해당 위치를 선택', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"alpha":111,"beta":222}');
  await page.getByRole('button', { name: '정렬' }).click();
  await page.getByRole('button', { name: '트리' }).click();

  // 좌우 분할: 트리 패널이 보임
  await expect(page.locator('#panel .tree-node').first()).toBeVisible();

  // 'beta' 노드 라벨 클릭 → 에디터에 선택 영역 생성
  await page.locator('#panel .tree-label', { hasText: 'beta' }).first().click();
  await expect(page.locator('.cm-editor .cm-selectionBackground').first()).toBeVisible();
});
