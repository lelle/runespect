import { test, expect } from 'vitest';
import { unpublishedPackages } from './unpublished-packages.ts';

// The release workflow asks for approval to publish only when a package's version is not released
// yet, so a run with nothing new does not sit waiting in the queue.

const manifest = (name: string, version: string, extra = {}) => ({ name, version, ...extra });

const noTags = async () => false;

test('lists a public package whose version is not on npm', async () => {
  const onNpm = async () => false;
  expect(await unpublishedPackages([manifest('@runespect/ui', '0.2.0')], onNpm, noTags)).toEqual([
    '@runespect/ui@0.2.0',
  ]);
});

test('leaves out a version npm already has', async () => {
  const onNpm = async (spec: string) => spec === '@runespect/ui@0.1.0';
  const manifests = [manifest('@runespect/ui', '0.1.0'), manifest('@runespect/agent', '0.2.0')];
  expect(await unpublishedPackages(manifests, onNpm, noTags)).toEqual(['@runespect/agent@0.2.0']);
});

// A private package is on no registry: its release is the tag `changeset publish` makes for it.
test('lists a private package whose version has no tag, without asking npm', async () => {
  const asked: string[] = [];
  const onNpm = async (spec: string) => (asked.push(spec), false);
  const manifests = [manifest('@runespect/extension', '0.1.1', { private: true })];
  expect(await unpublishedPackages(manifests, onNpm, noTags)).toEqual([
    '@runespect/extension@0.1.1',
  ]);
  expect(asked).toEqual([]);
});

test('leaves out a private package whose version is tagged', async () => {
  const tagged = async (spec: string) => spec === '@runespect/extension@0.1.1';
  const manifests = [manifest('@runespect/extension', '0.1.1', { private: true })];
  expect(await unpublishedPackages(manifests, async () => false, tagged)).toEqual([]);
});

// These never get a tag, so counting them would ask for approval on every push to main.
test('leaves out what the changesets config ignores', async () => {
  const manifests = [
    manifest('@runespect/ui', '0.2.0'),
    manifest('@runespect/proxy', '0.0.0', { private: true }),
  ];
  expect(
    await unpublishedPackages(manifests, async () => false, noTags, ['@runespect/proxy']),
  ).toEqual(['@runespect/ui@0.2.0']);
});

test('counts a failed lookup as unpublished, so the publish step decides', async () => {
  const onNpm = async () => {
    throw new Error('registry unreachable');
  };
  expect(await unpublishedPackages([manifest('@runespect/ui', '0.1.0')], onNpm, noTags)).toEqual([
    '@runespect/ui@0.1.0',
  ]);
});
