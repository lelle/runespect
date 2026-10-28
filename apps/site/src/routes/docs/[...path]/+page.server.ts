import { error } from '@sveltejs/kit';
import { loadDoc, pages } from '#lib/content.server.ts';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () =>
  pages.map((page) => ({ path: page.path.slice('docs/'.length).replace(/\/$/, '') }));

export const load: PageServerLoad = ({ params }) => {
  const loaded = loadDoc(params.path);
  if (!loaded) error(404, 'Not found');
  return {
    ...loaded,
    menu: pages,
  };
};
