import { test, expect } from 'vitest';
import { unpublishedPackages } from './unpublished-packages.ts';

// The release workflow asks for approval to publish only when a package's version is missing from
// npm, so a run with nothing new does not sit waiting in the queue.

const manifest = (name: string, version: string, extra = {}) => ({ name, version, ...extra });

test('lists a public package whose version is not on npm', async () => {
  const onNpm = async () => false;
  expect(await unpublishedPackages([manifest('@runespect/ui', '0.2.0')], onNpm)).toEqual([
    '@runespect/ui@0.2.0',
  ]);
});

test('leaves out a version npm already has', async () => {
  const onNpm = async (spec: string) => spec === '@runespect/ui@0.1.0';
  const manifests = [manifest('@runespect/ui', '0.1.0'), manifest('@runespect/agent', '0.2.0')];
  expect(await unpublishedPackages(manifests, onNpm)).toEqual(['@runespect/agent@0.2.0']);
});

test('leaves out private packages without asking npm', async () => {
  const asked: string[] = [];
  const onNpm = async (spec: string) => (asked.push(spec), false);
  const manifests = [manifest('@runespect/extension', '0.1.1', { private: true })];
  expect(await unpublishedPackages(manifests, onNpm)).toEqual([]);
  expect(asked).toEqual([]);
});

test('counts a failed lookup as unpublished, so the publish step decides', async () => {
  const onNpm = async () => {
    throw new Error('registry unreachable');
  };
  expect(await unpublishedPackages([manifest('@runespect/ui', '0.1.0')], onNpm)).toEqual([
    '@runespect/ui@0.1.0',
  ]);
});
