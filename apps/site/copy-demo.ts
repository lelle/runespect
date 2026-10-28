// The demo is its own build (apps/demo); the site serves it at /runespect/demo/.
import { cpSync } from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
cpSync(path.join(here, '../demo/dist'), path.join(here, '../../site/demo'), { recursive: true });
