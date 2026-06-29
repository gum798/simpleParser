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
