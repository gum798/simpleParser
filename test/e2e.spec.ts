import { test, expect, type Page } from '@playwright/test';

// 툴바의 항상 보이는 액션 버튼 클릭(스펙: 드롭다운에 숨기지 않음)
async function clickBtn(page: Page, label: string): Promise<void> {
  await page.locator('#toolbar .btn', { hasText: new RegExp(`^${label}$`) }).click();
}

async function clickFormat(page: Page): Promise<void> {
  await clickBtn(page, '정렬');
}

// 포맷 세그먼트 컨트롤에서 포맷 선택
async function pickFormat(page: Page, fmt: string): Promise<void> {
  await page.locator(`.seg-btn[data-fmt="${fmt}"]`).click();
}

test('정렬 → 트리 → 저장 → 새로고침 복원', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.type('{"a":1,"b":[2,3]}');

  await clickFormat(page);
  await expect(page.locator('.cm-content')).toContainText('"a": 1');

  await clickBtn(page, '트리');
  await expect(page.locator('#panel .tree-node').first()).toBeVisible();

  await clickBtn(page, '저장');
  await expect(page.locator('#save-dialog')).toBeVisible();
  await expect(page.locator('#save-dialog .save-url')).toHaveValue(/#/);
  await expect.poll(() => page.url()).toContain('#');

  const shared = page.url();
  await page.goto(shared);
  await expect(page.locator('.cm-content')).toContainText('"a"');
});

test('정렬을 누르면 에디터가 좌상단으로 스크롤된다', async ({ page }) => {
  await page.goto('/');
  await pickFormat(page, 'json');
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
  await clickFormat(page);
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
  await clickBtn(page, '클린');
  await expect(page.locator('.cm-content')).toHaveText('');
});

test('저장 팝업의 [사이트만 공유하기]는 문서 없는 도구 링크를 복사', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"a":1}');
  await clickBtn(page, '저장');
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
  await clickBtn(page, '트리');
  await expect(page.locator('#status')).toContainText('줄');
});

test('로그에 박힌 JSON을 정렬로 추출(JSON 선택)', async ({ page }) => {
  await page.goto('/');
  await pickFormat(page, 'json');
  await page.locator('.cm-content').click();
  await page.keyboard.type('log body={"x":1}');
  await clickFormat(page);
  await expect(page.locator('.cm-content')).toContainText('"x": 1');
});

test('Markdown 미리보기 렌더', async ({ page }) => {
  await page.goto('/');
  await pickFormat(page, 'markdown');
  await page.locator('.cm-content').click();
  await page.keyboard.type('# 안녕');
  await clickBtn(page, '미리보기');
  await expect(page.locator('#panel .markdown-body h1')).toHaveText('안녕');
});

test('저장 팝업의 [닫기] 버튼이 다이얼로그를 닫는다', async ({ page }) => {
  await page.goto('/');
  await clickBtn(page, '저장');
  await expect(page.locator('#save-dialog')).toBeVisible();
  await page.locator('#save-dialog').getByRole('button', { name: '닫기' }).click();
  await expect(page.locator('#save-dialog')).toBeHidden();
});

test('저장 팝업을 닫은 뒤 하이라이트 메뉴가 다시 동작한다(모달이 막지 않음)', async ({ page }) => {
  await page.goto('/');
  await clickBtn(page, '저장');
  await page.locator('#save-dialog').getByRole('button', { name: '닫기' }).click();
  await expect(page.locator('#save-dialog')).toBeHidden();
  await clickBtn(page, '하이라이트');
  await expect(page.locator('#rules .rule-add')).toBeVisible();
});

test('하이라이트 패널은 기본 숨김이고 토글로 열고 닫힌다', async ({ page }) => {
  await page.goto('/');
  // 오버레이가 로드 때부터 떠 있지 않아야 한다([hidden]이 실제로 숨겨야 함)
  await expect(page.locator('#rules')).toBeHidden();
  await clickBtn(page, '하이라이트');
  await expect(page.locator('#rules')).toBeVisible();
  await clickBtn(page, '하이라이트');
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
  await clickBtn(page, '하이라이트');
  await clickBtn(page, '트리');
  // 오버레이가 가리는 만큼 에디터·트리 모두 하단 여백이 생겨야 함(가려진 내용을 위로 스크롤 가능)
  const pad = await page.locator('.cm-content').evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
  expect(pad).toBeGreaterThan(100);
  const treePad = await page
    .locator('#panel .pane-body')
    .evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
  expect(treePad).toBeGreaterThan(100);
});

test('하이라이트 패널을 열면 바로 입력 가능한 규칙 줄이 보인다', async ({ page }) => {
  await page.goto('/');
  await clickBtn(page, '하이라이트');
  // 빈 상태로 열어도 정규식 입력 칸이 바로 보여야 한다(패널이 '안 열린 것처럼' 보이지 않게)
  await expect(page.locator('#rules .rule-regex')).toBeVisible();
});

test('하이라이트 카드는 바닥 줄부터 채워진다(남는 카드는 윗줄)', async ({ page }) => {
  const rules = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7'].map((n, i) => ({
    id: String(i), name: n, regex: n, enabled: true, textColor: '#000000', bgColor: '#ffff00',
  }));
  await page.addInitScript((r) => localStorage.setItem('simpleparser.highlightRules', JSON.stringify(r)), rules);
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto('/');
  await clickBtn(page, '하이라이트');
  // 첫 카드는 바닥 줄, 마지막 카드는 그 위 줄(wrap-reverse)
  const first = (await page.locator('#rules .rule-row').first().boundingBox())!;
  const last = (await page.locator('#rules .rule-row').last().boundingBox())!;
  expect(last.y).toBeLessThan(first.y);
});

test('규칙창을 오른쪽으로 도킹할 수 있고 새로고침 후에도 유지된다', async ({ page }) => {
  await page.goto('/');
  await clickBtn(page, '하이라이트');
  await page.locator('#rules .rules-dock').click();
  // 오른쪽 도킹: 패널이 화면 오른쪽 절반에 붙음
  const vw = page.viewportSize()!.width;
  const box = await page.locator('#rules').boundingBox();
  expect(box!.x).toBeGreaterThan(vw / 2);
  // 콘텐츠 전체가 왼쪽으로 밀려 아무것도 안 가려짐(#content 오른쪽 여백)
  const padR = await page
    .locator('#content')
    .evaluate((el) => parseFloat(getComputedStyle(el).paddingRight));
  expect(padR).toBeGreaterThan(100);
  // 도킹 선택은 localStorage에 저장 → 새로고침 후 유지
  await page.reload();
  await clickBtn(page, '하이라이트');
  const box2 = await page.locator('#rules').boundingBox();
  expect(box2!.x).toBeGreaterThan(vw / 2);
  // 다시 아래로 되돌리기도 동작
  await page.locator('#rules .rules-dock').click();
  const box3 = await page.locator('#rules').boundingBox();
  expect(box3!.x).toBeLessThan(vw / 2);
});

test('오른쪽 도킹 + 트리 동시 열림: OUTPUT 패널이 규칙창에 가려지지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"a":1,"b":2}');
  await clickBtn(page, '트리');
  await clickBtn(page, '하이라이트');
  await page.locator('#rules .rules-dock').click();
  // OUTPUT 카드 오른쪽 끝이 규칙 오버레이 왼쪽 경계보다 왼쪽에 있어야 함(겹침 없음)
  const panel = (await page.locator('#panel').boundingBox())!;
  const rules = (await page.locator('#rules').boundingBox())!;
  expect(panel.x + panel.width).toBeLessThanOrEqual(rules.x + 1);
});

test('하이라이트 글자색이 구문 색을 이기고 실제 렌더에 적용된다', async ({ page }) => {
  // 구문 하이라이트가 색을 주는 JSON 문자열 토큰("name") 위에 빨강 글자 규칙
  await page.addInitScript(() => {
    localStorage.setItem(
      'simpleparser.highlightRules',
      JSON.stringify([
        { id: '1', name: 'x', regex: 'name', enabled: true, textColor: '#ff0000', bgColor: '#ffff00' },
      ]),
    );
  });
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"name":"a"}');
  // 'name' 텍스트를 실제로 감싼 가장 안쪽 요소의 계산된 색이 규칙의 글자색이어야 함
  await expect
    .poll(() =>
      page.evaluate(() => {
        const spans = Array.from(document.querySelectorAll('.cm-line .sp-hl'));
        const target = spans.find((s) => s.textContent === 'name');
        if (!target) return 'no-mark';
        const inner = target.querySelector('span') ?? target;
        return getComputedStyle(inner).color;
      }),
    )
    .toBe('rgb(255, 0, 0)');
});

test('하이라이트 규칙 추가 → 매칭 텍스트 강조 + 새로고침 유지', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('hello world hello');

  await clickBtn(page, '하이라이트');
  // 패널을 열면 입력 줄이 자동으로 보이므로 바로 정규식 입력
  await page.locator('#rules .rule-regex').first().fill('hello');

  // 매칭 텍스트에 배경 스타일이 입은 mark 출현
  await expect(page.locator('.cm-content span[style*="background-color"]').first()).toBeVisible();

  // 새로고침 후에도 규칙이 localStorage에서 복원
  await page.reload();
  await clickBtn(page, '하이라이트');
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
  await clickBtn(page, '하이라이트');
  await expect(page.locator('#rules .rule-regex')).toHaveCount(1);
  await expect(page.locator('#rules .rule-regex').first()).toHaveValue('needle');
});

test('자동 정렬은 주변 텍스트를 지우지 않는다(붙여넣기 데이터 손실 방지)', async ({ page }) => {
  await page.goto('/');
  await pickFormat(page, 'json'); // 수동 JSON → 감지 우회, 자동 정렬 경로 강제
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
  await clickBtn(page, '트리');

  // 좌우 분할: 트리 패널이 보임
  await expect(page.locator('#panel .tree-node').first()).toBeVisible();

  // 'beta' 노드 라벨 클릭 → 에디터에 선택 영역 생성
  await page.locator('#panel .tree-label', { hasText: 'beta' }).first().click();
  await expect(page.locator('.cm-editor .cm-selectionBackground').first()).toBeVisible();
});

test('트리를 연 채 편집해도 노드 클릭이 정확한 위치를 선택한다(낡은 오프셋 방지)', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"alpha":111,"beta":222}');
  await clickFormat(page);
  await clickBtn(page, '트리');
  // 트리를 연 채 문서 맨 앞에 공백 삽입 → 오프셋이 밀림 → 재렌더로 보정돼야 함
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.type('   ');
  await page.waitForTimeout(500); // onEdit 디바운스(300ms) + 재렌더
  await page.locator('#panel .tree-label', { hasText: 'beta' }).first().click();
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  expect(selected).toBe('222'); // 밀린 위치가 아니라 실제 beta 값
});

test('트리를 연 채 붙여넣으면 트리가 새 내용으로 갱신된다', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"x":1}');
  await clickBtn(page, '트리');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', '{"alpha":111,"beta":222}');
    document.querySelector('.cm-content')!.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  });
  await expect(page.locator('#panel .tree-label', { hasText: 'beta' }).first()).toBeVisible();
});

test('트리 라벨에도 하이라이트 규칙이 적용된다', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'simpleparser.highlightRules',
      JSON.stringify([{ id: '1', name: 'x', regex: 'stage', enabled: true, textColor: '#ff0000', bgColor: '#ffff00' }]),
    );
  });
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"stage":"MODE_A","ok":true}');
  await clickBtn(page, '트리');
  const mark = page.locator('#panel .tree-label span', { hasText: 'stage' }).first();
  await expect(mark).toBeVisible();
  await expect(mark).toHaveCSS('color', 'rgb(255, 0, 0)');
  await expect(mark).toHaveCSS('background-color', 'rgb(255, 255, 0)');
  // 규칙 편집(정규식 변경) → 트리 하이라이트 즉시 갱신
  await clickBtn(page, '하이라이트');
  await page.locator('#rules .rule-regex').first().fill('ok');
  await expect(page.locator('#panel .tree-label span', { hasText: 'ok' }).first()).toBeVisible();
});

test('트리 뎁스: 기본은 최대뎁스 절반, +/-로 조절', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  // 깊이 4 JSON → 기본 뎁스 = floor(4/2) = 2 → 깊이 2(b)의 자식(c)은 접혀서 안 보임
  await page.keyboard.type('{"a":{"b":{"c":{"d":1}}}}');
  await clickBtn(page, '트리');
  await expect(page.locator('#panel .depth-val')).toHaveText('2');
  await expect(page.locator('#panel .tree-label', { hasText: 'b' }).first()).toBeVisible();
  await expect(page.locator('#panel .tree-label', { hasText: 'c' }).first()).toBeHidden();
  // + 한 단계 → c 보임
  await page.locator('#panel .depth-btn', { hasText: '+' }).click();
  await expect(page.locator('#panel .depth-val')).toHaveText('3');
  await expect(page.locator('#panel .tree-label', { hasText: 'c' }).first()).toBeVisible();
  // − 두 단계 → 1 → a만 보이고 b는 접힘
  await page.locator('#panel .depth-btn', { hasText: '−' }).click();
  await page.locator('#panel .depth-btn', { hasText: '−' }).click();
  await expect(page.locator('#panel .depth-val')).toHaveText('1');
  await expect(page.locator('#panel .tree-label', { hasText: 'b' }).first()).toBeHidden();
});

test('트리 패널 열림 상태가 URL에 저장되어 새로고침 후에도 유지', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"a":1}');
  await clickBtn(page, '트리');
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
  await clickBtn(page, '하이라이트');
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
  await page.getByTitle('테마설정').click();
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

test('다크 모드가 기본이고 토글하면 라이트로 전환·새로고침 유지', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByTitle('라이트/다크 전환').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.waitForTimeout(500); // 테마 저장 디바운스(400ms)
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('복사 버튼: 내용 복사 + ✓ 마이크로 인터랙션', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"copy":1}');
  await clickBtn(page, '복사');
  await expect(page.locator('#toolbar .btn', { hasText: /복사됨/ })).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toBe('{"copy":1}');
});

test('모바일 폭에서는 입력(위)/출력(아래) 상하 스택', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 });
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"a":1}');
  await clickBtn(page, '트리');
  const input = (await page.locator('#input-pane').boundingBox())!;
  const output = (await page.locator('#panel').boundingBox())!;
  expect(output.y).toBeGreaterThan(input.y + input.height - 1); // 출력이 입력 아래
});

test('데스크톱에서는 출력 패널이 입력 오른쪽에 위치', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"a":1}');
  await clickBtn(page, '트리');
  const input = (await page.locator('#input-pane').boundingBox())!;
  const output = (await page.locator('#panel').boundingBox())!;
  expect(output.x).toBeGreaterThan(input.x + input.width - 1); // 출력이 입력 오른쪽
});

// ── 원본 유지 정렬(비파괴 정렬): 스펙 docs/superpowers/specs/2026-07-28-keep-original-format-design.md ──

test('원본 유지 정렬: 주변 텍스트는 남기고 JSON만 제자리에서 펼친다', async ({ page }) => {
  await page.goto('/');
  await pickFormat(page, 'json');
  await page.locator('.cm-content').click();
  await page.keyboard.type('log body={"x":1} end');
  await clickBtn(page, '원본 유지');
  await clickFormat(page);
  // 로그 접두어·후미는 입력창에 그대로 남고
  await expect(page.locator('.cm-content')).toContainText('log body=');
  await expect(page.locator('.cm-content')).toContainText('end');
  // JSON 블록만 그 자리에서 펼쳐진다
  await expect(page.locator('.cm-content')).toContainText('"x": 1');
});

test('원본 유지여도 전체가 JSON이면 통짜 정렬', async ({ page }) => {
  await page.goto('/');
  await pickFormat(page, 'json');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"a":1}');
  await clickBtn(page, '원본 유지');
  await clickFormat(page);
  await expect(page.locator('.cm-content')).toContainText('"a": 1');
});

test('원본 유지 토글은 새로고침 후에도 유지(localStorage)', async ({ page }) => {
  await page.goto('/');
  const toggle = page.locator('#toolbar .btn', { hasText: /^원본 유지$/ });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('OUTPUT 패널에서 트리 ↔ 텍스트 뷰 전환', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"a":1}');
  await clickBtn(page, '트리');
  await expect(page.locator('#panel .tree-node').first()).toBeVisible();
  await page.locator('#panel .view-btn[data-view="text"]').click();
  await expect(page.locator('#panel .output-text')).toContainText('"a": 1');
  await page.locator('#panel .view-btn[data-view="tree"]').click();
  await expect(page.locator('#panel .tree-node').first()).toBeVisible();
});

test('원본 유지 켠 상태: 붙여넣기 자동 정렬도 입력을 바꾸지 않는다', async ({ page }) => {
  await page.goto('/');
  await pickFormat(page, 'json');
  await clickBtn(page, '원본 유지');
  await page.locator('.cm-content').click();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', '{"m":5,"n":6}');
    document
      .querySelector('.cm-content')!
      .dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(500); // 자동 정렬 유휴 콜백이 돌 시간
  // 평소라면 자동 정렬로 공백이 생기지만('"m": 5'), 원본 유지 중엔 압축 원문 그대로
  await expect(page.locator('.cm-content')).toContainText('{"m":5,"n":6}');
  await expect(page.locator('.cm-content')).not.toContainText('"m": 5');
});

test('텍스트 뷰의 [복사]는 정렬 결과를 복사한다', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await pickFormat(page, 'json');
  await page.locator('.cm-content').click();
  await page.keyboard.type('log body={"x":1}');
  await clickBtn(page, '트리');
  await page.locator('#panel .view-btn[data-view="text"]').click();
  await page.locator('#panel .output-copy').click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('"x": 1'); // 정렬 결과
  expect(clip).not.toContain('log body'); // 입력 원문이 아니라
});

test('마크다운에서는 트리/텍스트 전환이 보이지 않는다(미리보기 전용)', async ({ page }) => {
  await page.goto('/');
  await pickFormat(page, 'markdown');
  await page.locator('.cm-content').click();
  await page.keyboard.type('# 제목');
  await clickBtn(page, '미리보기');
  await expect(page.locator('#panel .markdown-body h1')).toBeVisible();
  await expect(page.locator('#panel .view-seg')).toBeHidden();
});

// ── 리뷰 확정 결함 회귀 테스트(2026-07-28 적대적 리뷰) ──

test('패널이 열린 채 포맷을 바꾸면 OUTPUT 컨트롤·본문이 함께 갱신된다', async ({ page }) => {
  await page.goto('/');
  await pickFormat(page, 'json');
  await page.locator('.cm-content').click();
  await page.keyboard.type('log body={"x":1}');
  await clickBtn(page, '트리');
  await page.locator('#panel .view-btn[data-view="text"]').click();
  await expect(page.locator('#panel .output-text')).toContainText('"x": 1');
  await page.waitForTimeout(600); // 디바운스 정착 후 전환(onEdit 레이스로 우연히 통과하지 않게)
  await pickFormat(page, 'markdown');
  // markdown은 미리보기 전용: 뷰 전환·복사 숨김 + 본문은 미리보기로 교체(낡은 JSON 결과 잔류 금지)
  await expect(page.locator('#panel .view-seg')).toBeHidden();
  await expect(page.locator('#panel .output-copy')).toBeHidden();
  await expect(page.locator('#panel .markdown-body')).toBeVisible();
  await expect(page.locator('#panel .output-text')).toHaveCount(0);
});

test('HTML 빈 입력의 텍스트 뷰: 결과 없음 안내, [복사]는 숨김(빈 문자열 복사 방지)', async ({ page }) => {
  await page.goto('/');
  await pickFormat(page, 'html');
  await clickBtn(page, '트리');
  await page.locator('#panel .view-btn[data-view="text"]').click();
  await expect(page.locator('#panel .output-empty')).toBeVisible();
  await expect(page.locator('#panel .output-copy')).toBeHidden();
});

test('텍스트 뷰로 전환하면 툴바 뷰 버튼 라벨도 [텍스트](라벨-동작 일치)', async ({ page }) => {
  await page.goto('/');
  await pickFormat(page, 'json');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"a":1}');
  await clickBtn(page, '트리');
  await page.locator('#panel .view-btn[data-view="text"]').click();
  // 툴바 버튼이 다시 여는 뷰(텍스트)와 라벨이 일치해야 한다
  await expect(page.locator('#toolbar .btn', { hasText: /^텍스트$/ })).toBeVisible();
  // 헤더 세그먼트로 트리로 돌아가면 라벨도 [트리]로 복귀
  await page.locator('#panel .view-btn[data-view="tree"]').click();
  await expect(page.locator('#toolbar .btn', { hasText: /^트리$/ })).toBeVisible();
});

test('텍스트 뷰에도 하이라이트 규칙 색이 적용된다', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'simpleparser.highlightRules',
      JSON.stringify([{ id: '1', name: 'x', regex: 'stage', enabled: true, textColor: '#ff0000', bgColor: '#ffff00' }]),
    );
  });
  await page.goto('/');
  await pickFormat(page, 'json');
  await page.locator('.cm-content').click();
  await page.keyboard.type('log body={"stage":"A"}');
  await clickBtn(page, '트리');
  await page.locator('#panel .view-btn[data-view="text"]').click();
  const mark = page.locator('#panel .output-text span', { hasText: 'stage' }).first();
  await expect(mark).toBeVisible();
  await expect(mark).toHaveCSS('color', 'rgb(255, 0, 0)');
  await expect(mark).toHaveCSS('background-color', 'rgb(255, 255, 0)');
});

test('원본 유지: 중복 키 블록도 값을 잃지 않는다(둘 다 유지)', async ({ page }) => {
  await page.goto('/');
  await pickFormat(page, 'json');
  await page.locator('.cm-content').click();
  await page.keyboard.type('log {"a":1,"a":2} x');
  await clickBtn(page, '원본 유지');
  await clickFormat(page);
  await expect(page.locator('.cm-content')).toContainText('"a": 1');
  await expect(page.locator('.cm-content')).toContainText('"a": 2');
  await expect(page.locator('.cm-content')).toContainText('log');
});

test('원본 유지: 후행 콤마(JSONC) 입력은 본문 그대로 + 보류 사유 표시(침묵 금지)', async ({ page }) => {
  await page.goto('/');
  await pickFormat(page, 'json');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"a":1,}');
  await clickBtn(page, '원본 유지');
  await clickFormat(page);
  await expect(page.locator('.cm-content')).toContainText('{"a":1,}'); // 본문 무변경
  await expect(page.locator('#status')).toContainText('보류'); // 이유가 상태줄에 남는다
});

// ── INPUT/OUTPUT 좌우 너비 조절 디바이더 ──

test('디바이더 드래그로 OUTPUT 너비 조절 + 새로고침 후 유지', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"a":1}');
  await expect(page.locator('.pane-divider')).toBeHidden(); // 패널 닫힘 → 디바이더 숨김
  await clickBtn(page, '트리');
  const divider = page.locator('.pane-divider');
  await expect(divider).toBeVisible();
  const before = (await page.locator('#panel').boundingBox())!;
  const box = (await divider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 150, box.y + 200, { steps: 5 });
  await page.mouse.up();
  const after = (await page.locator('#panel').boundingBox())!;
  expect(after.width).toBeGreaterThan(before.width + 100); // 왼쪽으로 끌면 OUTPUT이 넓어진다
  await page.reload();
  await clickBtn(page, '트리');
  const restored = (await page.locator('#panel').boundingBox())!;
  expect(Math.abs(restored.width - after.width)).toBeLessThan(5); // localStorage 복원
});

test('디바이더 더블클릭으로 기본 너비 복귀', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"a":1}');
  await clickBtn(page, '트리');
  const divider = page.locator('.pane-divider');
  const def = (await page.locator('#panel').boundingBox())!;
  const box = (await divider.boundingBox())!;
  await page.mouse.move(box.x + 3, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x - 200, box.y + 200, { steps: 5 });
  await page.mouse.up();
  const widened = (await page.locator('#panel').boundingBox())!;
  expect(widened.width).toBeGreaterThan(def.width + 100);
  await divider.dblclick();
  const reset = (await page.locator('#panel').boundingBox())!;
  expect(Math.abs(reset.width - def.width)).toBeLessThan(10); // 기본(38%)으로 복귀
});

test('모바일 폭(상하 스택)에서는 디바이더가 보이지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 });
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{"a":1}');
  await clickBtn(page, '트리');
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('.pane-divider')).toBeHidden();
});

test('원본 유지: 잘린 JSON뿐인 입력은 정렬 시 OUTPUT 텍스트 뷰로 결과 표시(입력 무변경)', async ({ page }) => {
  await page.goto('/');
  await pickFormat(page, 'json');
  await clickBtn(page, '원본 유지');
  await page.locator('.cm-content').click();
  // 타이핑은 자동 괄호 닫힘으로 잘린 JSON을 만들 수 없다 → 실제 시나리오처럼 붙여넣기
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'x body={"success":true,"data":{"label":"수작업 산정 검증  ]');
    document
      .querySelector('.cm-content')!
      .dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(500); // 붙여넣기 자동 정렬(원본 유지 → 통과) 정착
  await clickFormat(page);
  // 입력은 그대로(잘린 한 줄 유지)
  await expect(page.locator('.cm-content')).toContainText('body={"success":true');
  // OUTPUT 텍스트 뷰가 자동으로 열리고 보충 복구된 정렬 결과 표시
  await expect(page.locator('#panel .output-text')).toContainText('"success": true');
});
