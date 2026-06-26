import { test, expect, vi } from 'vitest';
import { debounce } from '../src/util/debounce';

test('마지막 호출만 한 번 실행', async () => {
  vi.useFakeTimers();
  const fn = vi.fn();
  const d = debounce(fn, 100);
  d(1);
  d(2);
  d(3);
  expect(fn).not.toHaveBeenCalled();
  vi.advanceTimersByTime(100);
  expect(fn).toHaveBeenCalledTimes(1);
  expect(fn).toHaveBeenCalledWith(3);
  vi.useRealTimers();
});
