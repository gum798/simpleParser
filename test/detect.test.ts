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
test('JSON이 과반인 로그는 json으로 감지', () =>
  expect(detectFormat('INFO body={"runId":"abc123","stage":"A","ok":true}')).toBe('json'));
test('작은 JSON이 든 산문/마크다운은 json으로 오인하지 않음', () => {
  expect(detectFormat('The API returns {"status":"ok"} on success.')).toBe('markdown');
  expect(detectFormat('# 제목\n\n```json\n{"a":1}\n```')).toBe('markdown');
});

test('문자열 안 줄바꿈이 낀 로그 JSON(터미널 랩 복사)도 json으로 감지', () => {
  const log =
    'request_body path=/internal body=\n{"runId":"fb97","taskContent":["과제내용\n1","지표를\n실시간으로 수집해 정제한다"]}';
  expect(detectFormat(log)).toBe('json');
});

test('잘린 거대 JSON 라인이 주 내용인 로그도 json으로 감지', () => {
  const log =
    'request_end path=/openapi.json elapsed_ms=33\n' +
    'x response_body body={"openapi":"3.1.0","info":{"title":"T","version":"1"},"paths":{"/health":{"get":{"operationId":"cut…(+40583자)\n' +
    'y Using selector: KqueueSelector';
  expect(detectFormat(log)).toBe('json');
});
