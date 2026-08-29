import { log } from '../log';
import { MemoryRepo } from './memory';
import { PgRepo, createSql } from './pg';
import type { Repo } from './repo-types';

export type { Repo } from './repo-types';

/**
 * Next bundles each route separately, so a plain module-level variable is NOT a
 * singleton across routes: every route handler would get its own store and a case
 * created by one would be invisible to the next. The instance lives on globalThis
 * so all of them share one.
 */
const GLOBAL_KEY = Symbol.for('saathi.repo');
type RepoGlobal = typeof globalThis & { [GLOBAL_KEY]?: { repo: Repo | null; announced: boolean } };
const store = ((globalThis as RepoGlobal)[GLOBAL_KEY] ??= { repo: null, announced: false });

/**
 * Postgres when DATABASE_URL is set, otherwise an in-memory store with the identical
 * contract. Both pass the same repository test suite.
 */
export function getRepo(): Repo {
  if (store.repo) return store.repo;
  const url = process.env.DATABASE_URL;
  if (url) {
    store.repo = new PgRepo(createSql(url));
    if (!store.announced) { log('info', { event: 'STORE', store: 'postgres' }); store.announced = true; }
    return store.repo;
  }
  store.repo = new MemoryRepo();
  if (!store.announced) {
    log('info', { event: 'STORE', store: 'memory', note: 'Using in-memory store — cases will be lost on restart' });
    store.announced = true;
  }
  return store.repo;
}

/** Test seam. */
export function setRepo(r: Repo | null): void {
  store.repo = r;
}
