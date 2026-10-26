import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { shouldUpdateDataDirs, shouldUpdateDataObjects } from '../scripts/compare-data.mjs';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COMPARE_SCRIPT = path.resolve(__dirname, '..', 'scripts', 'compare-data.mjs');

const BASE_LATEST = {
  source: 'opensky-live',
  isDemo: false,
  fetchedAt: '2026-10-26T09:00:00.000Z',
  apiTimestamp: 1793005200,
  aircraftCount: 58,
  airborneCount: 58,
  onGroundCount: 0,
  avgAltitudeM: 8900,
  avgVelocityKmh: 750,
  lastAttempt: {
    timestamp: '2026-10-26T09:00:00.000Z',
    status: 'ok',
    httpStatus: 200,
    errorType: null,
    message: 'OpenSky API üzerinden canlı veri başarıyla alındı.'
  },
  aircraft: [{ icao24: '4baa01', callsign: 'THY101' }]
};

const BASE_SNAPSHOTS = {
  updatedAt: '2026-10-26T09:00:00.000Z',
  isDemo: false,
  totalSnapshots: 2,
  snapshots: [
    { timestamp: '2026-10-26T08:30:00.000Z', aircraftCount: 52 },
    { timestamp: '2026-10-26T09:00:00.000Z', aircraftCount: 58 }
  ]
};

test('compare-data: Yeni snapshot veya fetchedAt değiştiğinde true döner', () => {
  const newLatest = {
    ...BASE_LATEST,
    fetchedAt: '2026-10-26T09:30:00.000Z',
    aircraftCount: 65,
    lastAttempt: {
      ...BASE_LATEST.lastAttempt,
      timestamp: '2026-10-26T09:30:00.000Z'
    }
  };
  const newSnapshots = {
    ...BASE_SNAPSHOTS,
    updatedAt: '2026-10-26T09:30:00.000Z',
    totalSnapshots: 3,
    snapshots: [
      ...BASE_SNAPSHOTS.snapshots,
      { timestamp: '2026-10-26T09:30:00.000Z', aircraftCount: 65 }
    ]
  };

  assert.equal(
    shouldUpdateDataObjects(BASE_LATEST, newLatest, BASE_SNAPSHOTS, newSnapshots),
    true
  );
});

test('compare-data: Yalnızca lastAttempt.timestamp ve lastAttempt.message değiştiğinde false döner', () => {
  const oldErrorLatest = {
    ...BASE_LATEST,
    lastAttempt: {
      timestamp: '2026-10-26T09:30:00.000Z',
      status: 'error',
      httpStatus: 429,
      errorType: 'HTTP_429',
      message: 'OpenSky API istek limiti aşıldı. Yeniden deneme süresi: 90 sn.'
    }
  };
  const newErrorLatest = {
    ...BASE_LATEST,
    lastAttempt: {
      timestamp: '2026-10-26T10:00:00.000Z',
      status: 'error',
      httpStatus: 429,
      errorType: 'HTTP_429',
      message: 'OpenSky API istek limiti aşıldı. Yeniden deneme süresi: 45 sn.'
    }
  };

  assert.equal(
    shouldUpdateDataObjects(oldErrorLatest, newErrorLatest, BASE_SNAPSHOTS, BASE_SNAPSHOTS),
    false
  );
});

test('compare-data: Hata türü (errorType) veya durum (status) değiştiğinde true döner', () => {
  const newErrorLatest = {
    ...BASE_LATEST,
    lastAttempt: {
      timestamp: '2026-10-26T09:30:00.000Z',
      status: 'error',
      httpStatus: 429,
      errorType: 'HTTP_429',
      message: 'OpenSky API istek limiti aşıldı.'
    }
  };

  // ok -> error geçişi
  assert.equal(
    shouldUpdateDataObjects(BASE_LATEST, newErrorLatest, BASE_SNAPSHOTS, BASE_SNAPSHOTS),
    true
  );

  // HTTP_429 -> TIMEOUT geçişi
  const timeoutErrorLatest = {
    ...BASE_LATEST,
    lastAttempt: {
      timestamp: '2026-10-26T10:00:00.000Z',
      status: 'error',
      httpStatus: null,
      errorType: 'TIMEOUT',
      message: 'Zaman aşımı.'
    }
  };

  assert.equal(
    shouldUpdateDataObjects(newErrorLatest, timeoutErrorLatest, BASE_SNAPSHOTS, BASE_SNAPSHOTS),
    true
  );
});

test('compare-data: Eski dosyalar yoksa (ilk çalıştırma) true döner ve CLI üzerinden doğru çıktı verir', async () => {
  assert.equal(shouldUpdateDataObjects(null, BASE_LATEST, null, BASE_SNAPSHOTS), true);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compare-data-test-'));
  const oldDir = path.join(tempDir, 'old');
  const newDir = path.join(tempDir, 'new');
  await fs.mkdir(oldDir, { recursive: true });
  await fs.mkdir(path.join(newDir, 'data'), { recursive: true });

  try {
    await fs.writeFile(
      path.join(newDir, 'data', 'latest.json'),
      JSON.stringify(BASE_LATEST, null, 2)
    );
    await fs.writeFile(
      path.join(newDir, 'data', 'snapshots.json'),
      JSON.stringify(BASE_SNAPSHOTS, null, 2)
    );

    // Eski dizin boşken true dönmeli
    assert.equal(await shouldUpdateDataDirs(oldDir, newDir), true);
    const cliEmptyOld = await execFileAsync(process.execPath, [COMPARE_SCRIPT, oldDir, newDir]);
    assert.equal(cliEmptyOld.stdout, 'true');

    // Eski dizine aynı dosyalar yazıldığında ve yalnızca timestamp değiştiğinde false dönmeli
    await fs.writeFile(path.join(oldDir, 'latest.json'), JSON.stringify(BASE_LATEST, null, 2));
    await fs.writeFile(
      path.join(oldDir, 'snapshots.json'),
      JSON.stringify(BASE_SNAPSHOTS, null, 2)
    );

    const sameWithNewAttemptTime = {
      ...BASE_LATEST,
      lastAttempt: {
        ...BASE_LATEST.lastAttempt,
        timestamp: '2026-10-26T11:00:00.000Z',
        message: 'Yeni zaman damgalı mesaj'
      }
    };
    await fs.writeFile(
      path.join(newDir, 'data', 'latest.json'),
      JSON.stringify(sameWithNewAttemptTime, null, 2)
    );

    assert.equal(await shouldUpdateDataDirs(oldDir, newDir), false);
    const cliSame = await execFileAsync(process.execPath, [COMPARE_SCRIPT, oldDir, newDir]);
    assert.equal(cliSame.stdout, 'false');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
