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
