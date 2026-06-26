import { test, expect } from 'vitest';
import { detectFormat } from '../src/detect';

test('JSON 객체', () => expect(detectFormat('{"a":1}')).toBe('json'));
test('JSON 배열', () => expect(detectFormat('[1,2,3]')).toBe('json'));
test('XML 선언', () => expect(detectFormat('<?xml version="1.0"?><a/>')).toBe('xml'));
test('HTML 문서', () => expect(detectFormat('<!doctype html><html><body>hi</body></html>')).toBe('html'));
test('일반 마크업 div는 HTML', () => expect(detectFormat('<div class="x">hi</div>')).toBe('html'));
test('루트 커스텀 태그는 XML', () => expect(detectFormat('<note><to>a</to></note>')).toBe('xml'));
test('YAML 맵', () => expect(detectFormat('a: 1\nb: 2')).toBe('yaml'));
test('YAML 시퀀스', () => expect(detectFormat('- one\n- two')).toBe('yaml'));
test('마크다운 제목', () => expect(detectFormat('# 제목\n\n본문')).toBe('markdown'));
test('빈 문자열은 markdown', () => expect(detectFormat('   ')).toBe('markdown'));
test('평문은 markdown 폴백', () => expect(detectFormat('그냥 한 줄 텍스트')).toBe('markdown'));
test('로그에 박힌 JSON은 json으로 감지', () =>
  expect(detectFormat('2026 INFO body={"runId":"x","n":1}')).toBe('json'));
test('JSON 코드펜스가 있는 마크다운은 markdown 유지', () =>
  expect(detectFormat('# 제목\n\n```json\n{"a":1}\n```')).toBe('markdown'));
test('한 줄 단일 키 콜론 산문은 markdown', () =>
  expect(detectFormat('Note: this matters')).toBe('markdown'));
