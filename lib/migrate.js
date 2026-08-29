import * as db from '../db/database';
import { loadPlugin, pluginApi } from './pluginEngine';
import { matchChapterState } from './chapterMatch';

/** Migrates a novel to a target source, preserving library membership and matching chapter state. */
export async function migrateNovel(sourceNovel, targetMeta, extensions) {
  if (!sourceNovel?.id) throw new Error('Source novel not found');
  const targetId = `${targetMeta.pluginId}::${targetMeta.path}`;
  if (targetId === sourceNovel.id) throw new Error('That is already the current source');

  const record = extensions[targetMeta.pluginId];
  if (!record) throw new Error('The target source extension is not installed');

  const instance = loadPlugin(record);
  const detail = await pluginApi.novel(instance, targetMeta.path);
  if (!detail) throw new Error('Could not load the novel from the target source');

  const targetChapters = (Array.isArray(detail.chapters) ? detail.chapters : []).map((c, i) => ({
    id: `${targetId}::${c.path ?? c.name ?? i}`,
    path: c.path ?? null,
    name: c.name ?? `Chapter ${i + 1}`,
    releaseTime: c.releaseTime ?? null,
  }));

  const sourceChapters = await db.getChaptersFull(sourceNovel.id);
  const state = matchChapterState(sourceChapters, targetChapters);

  const newNovel = {
    id: targetId,
    pluginId: targetMeta.pluginId,
    path: targetMeta.path,
    title: detail?.name ?? detail?.title ?? targetMeta.title ?? sourceNovel.title,
    author: detail?.author ?? sourceNovel.author,
    cover: detail?.cover ?? targetMeta.cover ?? sourceNovel.cover,
    status: detail?.status ?? sourceNovel.status,
    summary: detail?.summary ?? detail?.description ?? sourceNovel.summary,
    genres: Array.isArray(detail?.genres)
      ? detail.genres
      : typeof detail?.genres === 'string'
        ? detail.genres.split(/,\s*/)
        : sourceNovel.genres,
    inLibrary: !!sourceNovel.inLibrary,
    addedAt: sourceNovel.addedAt ?? Date.now(),
  };

  await db.deleteNovel(targetId);
  await db.upsertNovel(newNovel);
  await db.insertChaptersWithState(targetId, targetChapters, state);
  await db.deleteNovel(sourceNovel.id);
}
