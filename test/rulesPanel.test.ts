import { test, expect, vi } from 'vitest';
import { createRule, mountRulesPanel } from '../src/rulesPanel';

test('createRule 기본값', () => {
  const r = createRule();
  expect(r.enabled).toBe(true);
  expect(r.regex).toBe('');
  expect(r.textColor).toBe('#000000');
  expect(r.bgColor).toBe('#ffff00');
  expect(r.id).toBeTruthy();
});

test('규칙 추가 → onChange가 +1 규칙으로 호출', () => {
  const onChange = vi.fn();
  const host = document.createElement('div');
  const panel = mountRulesPanel(host, onChange);
  panel.render([]);
  (host.querySelector('.rule-add') as HTMLButtonElement).click();
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0][0]).toHaveLength(1);
});

test('정규식 입력은 패널을 재렌더하지 않고 같은 input을 유지', () => {
  const onChange = vi.fn();
  const host = document.createElement('div');
  const panel = mountRulesPanel(host, onChange);
  panel.render([createRule()]);
  const input = host.querySelector('input.rule-regex') as HTMLInputElement;
  input.value = 'hello';
  input.dispatchEvent(new Event('input'));
  expect(onChange).toHaveBeenCalled();
  expect(onChange.mock.calls.at(-1)![0][0].regex).toBe('hello');
  expect(host.querySelector('input.rule-regex')).toBe(input); // 동일 노드 = 포커스 보존
});

test('잘못된 정규식은 input에 invalid 클래스', () => {
  const onChange = vi.fn();
  const host = document.createElement('div');
  const panel = mountRulesPanel(host, onChange);
  panel.render([createRule()]);
  const input = host.querySelector('input.rule-regex') as HTMLInputElement;
  input.value = '(';
  input.dispatchEvent(new Event('input'));
  expect(input.classList.contains('invalid')).toBe(true);
});

test('삭제 → onChange가 빈 배열로 호출', () => {
  const onChange = vi.fn();
  const host = document.createElement('div');
  const panel = mountRulesPanel(host, onChange);
  panel.render([createRule()]);
  (host.querySelector('.rule-del') as HTMLButtonElement).click();
  expect(onChange.mock.calls.at(-1)![0]).toHaveLength(0);
});
