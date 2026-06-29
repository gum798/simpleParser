import { test, expect } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';
import { encode, decode } from '../src/urlState';
import type { State } from '../src/types';

test('인코드→디코드 라운드트립(유니코드 포함)', () => {
  const s: State = { v: 1, f: 'json', d: '{"한글":"😀"}' };
  const round = decode(encode(s));
  expect(round).toEqual(s);
});

test('# 접두가 붙은 해시도 디코드', () => {
  const s: State = { v: 1, f: 'yaml', d: 'a: 1' };
  expect(decode('#' + encode(s))).toEqual(s);
});

test('손상된 토큰은 null', () => {
  expect(decode('#%%%not-valid%%%')).toBeNull();
});

test('빈 해시는 null', () => {
  expect(decode('')).toBeNull();
  expect(decode('#')).toBeNull();
});

test('알 수 없는 포맷은 null', () => {
  // 허용 목록 밖의 f를 담은 정상 압축 토큰 → decode가 거부해야 함
  const badToken = compressToEncodedURIComponent(JSON.stringify({ v: 1, f: 'toml', d: 'x' }));
  expect(decode('#' + badToken)).toBeNull();
});

test('규칙/패널 상태 라운드트립', () => {
  const s: State = {
    v: 1,
    f: 'json',
    d: '{"a":1}',
    r: [{ id: 'r1', name: '강조', regex: 'a', enabled: true, textColor: '#000000', bgColor: '#ffff00' }],
    p: true,
    h: true,
  };
  expect(decode(encode(s))).toEqual(s);
});

test('상태 필드 없는 기존 v:1 링크는 그대로 디코드(하위호환)', () => {
  const token = compressToEncodedURIComponent(JSON.stringify({ v: 1, f: 'xml', d: '<a/>' }));
  expect(decode('#' + token)).toEqual({ v: 1, f: 'xml', d: '<a/>' });
});

test('URL의 잘못된 규칙은 무시한다(색상 주입 방어)', () => {
  // bgColor가 #rrggbb가 아닌 임의 CSS → isRule 거부 → r 필드 없이 디코드
  const token = compressToEncodedURIComponent(
    JSON.stringify({
      v: 1,
      f: 'json',
      d: 'x',
      r: [{ id: '1', name: 'n', regex: 'a', enabled: true, textColor: '#000000', bgColor: 'red;}*{}' }],
    }),
  );
  expect(decode('#' + token)).toEqual({ v: 1, f: 'json', d: 'x' });
});

test('빈 규칙/false 패널 상태는 URL에 넣지 않는다(짧은 링크)', () => {
  const s: State = { v: 1, f: 'json', d: 'x', r: [], p: false, h: false };
  expect(decode(encode(s))).toEqual({ v: 1, f: 'json', d: 'x' });
});
