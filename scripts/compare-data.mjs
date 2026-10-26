#!/usr/bin/env node
/**
 * OpenSky Veri Karşılaştırma Yardımcisi (scripts/compare-data.mjs)
 *
 * Uzak `data` dalından (`git show refs/remotes/origin/data:...`) çıkarılan eski
 * JSON dosyaları ile yeni çekilen JSON dosyalarını karşılaştırır.
 *
 * Yalnızca `lastAttempt.timestamp` ve `lastAttempt.message` gibi geçici hata deneme
 * alanları karşılaştırma dışında bırakılır.
 * - Eski dosyalar yoksa veya okunamıyorsa -> true
 * - `fetchedAt`, uçak listesi, `snapshots` dizisi, `lastAttempt.status` veya
 *   `lastAttempt.errorType` değişmişse -> true
 * - Yalnızca `lastAttempt.timestamp` veya `lastAttempt.message` değişmişse -> false
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Geçici deneme alanlarını (`lastAttempt.timestamp` ve `lastAttempt.message`) temizleyerek
 * deterministik karşılaştırma metni üretir.
 * @param {any} obj
 * @returns {string | null}
 */
export function stripTransientFields(obj) {
  if (!obj || typeof obj !== 'object') {
    return null;
  }
  const copy = JSON.parse(JSON.stringify(obj));
  if (copy.lastAttempt && typeof copy.lastAttempt === 'object') {
    delete copy.lastAttempt.timestamp;
    delete copy.lastAttempt.message;
  }
  return JSON.stringify(copy);
}

/**
 * Bellek içi eski ve yeni veri nesnelerini karşılaştırır.
 * @param {any} oldLatestObj
 * @param {any} newLatestObj
 * @param {any} oldSnapshotsObj
 * @param {any} newSnapshotsObj
 * @returns {boolean}
 */
export function shouldUpdateDataObjects(
  oldLatestObj,
  newLatestObj,
  oldSnapshotsObj,
  newSnapshotsObj
) {
  const oldLatest = stripTransientFields(oldLatestObj);
  const newLatest = stripTransientFields(newLatestObj);
  const oldSnaps = stripTransientFields(oldSnapshotsObj);
  const newSnaps = stripTransientFields(newSnapshotsObj);

  if (!newLatest || !newSnaps) {
    return false;
  }

  if (!oldLatest || !oldSnaps) {
    return true;
  }

  return oldLatest !== newLatest || oldSnaps !== newSnaps;
}

async function readJsonFirstFound(candidates) {
  for (const filePath of candidates) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      if (content.trim()) {
        return JSON.parse(content);
      }
    } catch {
      // Dosya yoksa bir sonraki adayı dene
    }
  }
  return null;
}

/**
 * Eski ve yeni veri dizinlerindeki `latest.json` ve `snapshots.json` dosyalarını karşılaştırır.
 * @param {string} oldDir
 * @param {string} newDir
 * @returns {Promise<boolean>}
 */
export async function shouldUpdateDataDirs(oldDir, newDir) {
  if (!oldDir || !newDir) {
    return true;
  }

  const oldLatestObj = await readJsonFirstFound([
    path.join(oldDir, 'latest.json'),
    path.join(oldDir, 'data', 'latest.json')
  ]);
  const oldSnapshotsObj = await readJsonFirstFound([
    path.join(oldDir, 'snapshots.json'),
    path.join(oldDir, 'data', 'snapshots.json')
  ]);

  const newLatestObj = await readJsonFirstFound([
    path.join(newDir, 'data', 'latest.json'),
    path.join(newDir, 'latest.json')
  ]);
  const newSnapshotsObj = await readJsonFirstFound([
    path.join(newDir, 'data', 'snapshots.json'),
    path.join(newDir, 'snapshots.json')
  ]);

  return shouldUpdateDataObjects(oldLatestObj, newLatestObj, oldSnapshotsObj, newSnapshotsObj);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const oldDir = process.argv[2] || '';
  const newDir = process.argv[3] || '';
  shouldUpdateDataDirs(oldDir, newDir)
    .then((result) => {
      process.stdout.write(result ? 'true' : 'false');
    })
    .catch(() => {
      process.stdout.write('true');
    });
}
