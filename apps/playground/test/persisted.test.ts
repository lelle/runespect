import { test, expect, beforeEach } from 'vitest';
import { loadSetting, saveSetting } from '@runespect/ui/internal';

beforeEach(() => localStorage.clear());

test('loadSetting returns the fallback when nothing is stored', () => {
  expect(loadSetting('x', 42)).toBe(42);
  expect(loadSetting('theme', 'dark')).toBe('dark');
});

test('saveSetting + loadSetting round-trip JSON values', () => {
  saveSetting('split', 60);
  expect(loadSetting('split', 45)).toBe(60);
  saveSetting('flags', { onlyStateful: true });
  expect(loadSetting('flags', null)).toEqual({ onlyStateful: true });
});

test('loadSetting falls back on corrupt JSON rather than throwing', () => {
  localStorage.setItem('runespect:bad', '{not valid json');
  expect(loadSetting('bad', 7)).toBe(7);
});

test('settings are namespaced under "runespect:"', () => {
  saveSetting('k', 1);
  expect(localStorage.getItem('runespect:k')).toBe('1');
});
