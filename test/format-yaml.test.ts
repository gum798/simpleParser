import { test, expect } from 'vitest';
import { formatYaml, parseYamlTolerant } from '../src/format/yaml';
import { format } from '../src/format/index';

test('유효 YAML은 정규화되어 출력', () => {
  const r = formatYaml('a:    1\nb:\n  - x\n  - y');
  expect(r.diagnostics).toHaveLength(0);
  expect(r.output).toContain('a: 1');
  expect(r.output).toContain('- x');
});

test('잘못된 YAML은 줄 정보가 담긴 진단을 낸다', () => {
  const r = formatYaml('a: 1\n  b: 2\n c: 3');
  expect(r.diagnostics.length).toBeGreaterThan(0);
  expect(typeof r.diagnostics[0].line).toBe('number');
});

test('parseYamlTolerant는 부분 값을 돌려준다', () => {
  const { value } = parseYamlTolerant('a: 1\nb: 2');
  expect((value as { a: number }).a).toBe(1);
});

test('디스패처가 yaml을 라우팅', () => {
  expect(format('a: 1', 'yaml').output).toContain('a: 1');
});
