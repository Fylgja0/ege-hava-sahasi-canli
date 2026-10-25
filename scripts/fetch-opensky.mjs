#!/usr/bin/env node
/**
 * Ege Hava Sahası Canlı - OpenSky Network Veri Toplama ve Normalleştirme Betiği
 *
 * Resmi uç nokta: https://opensky-network.org/api/states/all
 * Sınır kutusu (Ege): lamin=36.5, lomin=24.5, lamax=40.5, lomax=30.5 (4° x 6° = 24 kare derece)
 *
 * Davranış:
 * 1. Önce anonim erişimi dener.
 * 2. Zaman aşımı (TIMEOUT), boş yanıt (EMPTY_RESPONSE), bağlantı hatası (NETWORK_ERROR)
 *    ve HTTP 429 (HTTP_429) durumlarını açıkça yönetir ve raporlar.
 * 3. Başarısız çağrılarda mevcut son başarılı veriyi (latest.json) SİLMEZ; yalnızca
 *    lastAttempt alanına hatayı kaydeder.
 * 4. Henüz hiç veri yoksa ve canlı API erişilemezse, veriyi açıkça "DEMO" (isDemo: true)
 *    olarak etiketleyerek yedek veri oluşturur; sahte veriyi asla canlıymış gibi göstermez.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Hem Vite public/data dizinine hem de kök data/ dizinine senkronize yazılır
const OUTPUT_DIRS = [
  path.join(ROOT_DIR, 'public', 'data'),
  path.join(ROOT_DIR, 'data')
];

const BBOX = {
  lamin: 36.5,
  lomin: 24.5,
  lamax: 40.5,
  lomax: 30.5,
  areaSqDeg: 24
};

const OPENSKY_BASE_URL = 'https://opensky-network.org/api/states/all';
const REQUEST_TIMEOUT_MS = Number(process.env.OPENSKY_TIMEOUT_MS || 15000);
const MAX_SNAPSHOTS = 168; // Son 168 kayıt (ör. saatlik 7 gün)

/**
 * OpenSky API URL'sini oluşturur.
 */
function buildOpenSkyUrl() {
  const url = new URL(OPENSKY_BASE_URL);
  url.searchParams.set('lamin', String(BBOX.lamin));
  url.searchParams.set('lomin', String(BBOX.lomin));
  url.searchParams.set('lamax', String(BBOX.lamax));
  url.searchParams.set('lomax', String(BBOX.lomax));
  return url.toString();
}

/**
 * Tek bir OpenSky state vektörünü normalleştirir.
 * @param {Array<any>} state
 */
function normalizeStateVector(state) {
  if (!Array.isArray(state) || state.length < 11) {
    return null;
  }

  const icao24 = typeof state[0] === 'string' ? state[0].trim().toLowerCase() : '';
  const rawCallsign = typeof state[1] === 'string' ? state[1].trim() : '';
  const originCountry = typeof state[2] === 'string' ? state[2].trim() : 'Bilinmiyor';
  const timePosition = typeof state[3] === 'number' ? state[3] : null;
  const lastContact = typeof state[4] === 'number' ? state[4] : Math.floor(Date.now() / 1000);
  const longitude = typeof state[5] === 'number' ? Number(state[5].toFixed(4)) : null;
  const latitude = typeof state[6] === 'number' ? Number(state[6].toFixed(4)) : null;

  // Konumu olmayan kayıtları harita bütünlüğü için filtrele
  if (
    !icao24 ||
    latitude === null ||
    longitude === null ||
    Number.isNaN(latitude) ||
    Number.isNaN(longitude)
  ) {
    return null;
  }

  const baroAltitudeM = typeof state[7] === 'number' ? Math.round(state[7]) : null;
  const onGround = Boolean(state[8]);
  const velocityMs = typeof state[9] === 'number' ? Number(state[9].toFixed(1)) : null;
  const velocityKmh = velocityMs !== null ? Math.round(velocityMs * 3.6) : null;
  const velocityKnots = velocityMs !== null ? Math.round(velocityMs * 1.94384) : null;
  const trueTrackDeg = typeof state[10] === 'number' ? Number(state[10].toFixed(1)) : 0;
  const verticalRateMs = typeof state[11] === 'number' ? Number(state[11].toFixed(1)) : 0;
  const geoAltitudeM = typeof state[13] === 'number' ? Math.round(state[13]) : null;
  const squawk = typeof state[14] === 'string' ? state[14].trim() : null;

  return {
    icao24,
    callsign: rawCallsign || `ICAO-${icao24.toUpperCase()}`,
    originCountry,
    longitude,
    latitude,
    baroAltitudeM,
    geoAltitudeM,
    onGround,
    velocityMs,
    velocityKmh,
    velocityKnots,
    trueTrackDeg,
    verticalRateMs,
    lastContact,
    timePosition,
    squawk
  };
}

/**
 * Uçak listesinden özet KPI metriklerini hesaplar.
 * @param {Array<any>} aircraft
 */
function calculateMetrics(aircraft) {
  const aircraftCount = aircraft.length;
  const airborne = aircraft.filter((a) => !a.onGround);
  const airborneCount = airborne.length;
  const onGroundCount = aircraftCount - airborneCount;

  const altitudes = airborne
    .map((a) => a.baroAltitudeM ?? a.geoAltitudeM)
    .filter((v) => typeof v === 'number' && v > 0);

  const velocities = airborne
    .map((a) => a.velocityKmh)
    .filter((v) => typeof v === 'number' && v >= 0);

  const avgAltitudeM =
    altitudes.length > 0
      ? Math.round(altitudes.reduce((sum, val) => sum + val, 0) / altitudes.length)
      : 0;

  const avgVelocityKmh =
    velocities.length > 0
      ? Math.round(velocities.reduce((sum, val) => sum + val, 0) / velocities.length)
      : 0;

  return {
    aircraftCount,
    airborneCount,
    onGroundCount,
    avgAltitudeM,
    avgVelocityKmh
  };
}

/**
 * JSON dosyasını güvenli şekilde okur; dosya yoksa null döner.
 * @param {string} filePath
 */
async function readJsonSafe(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Veriyi tüm hedef dizinlere atomik/düzenli biçimde yazar.
 * @param {string} filename
 * @param {any} data
 */
async function writeJsonToAllDirs(filename, data) {
  const serialized = JSON.stringify(data, null, 2) + '\n';
  for (const dir of OUTPUT_DIRS) {
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, serialized, 'utf8');
  }
}

/**
 * Canlı API'ye ulaşılamadığında ve diskte hiç geçmiş başarılı veri olmadığında
 * kullanılacak açıkça DEMO etiketli yedek veriyi üretir.
 */
function createExplicitDemoData(nowIso, attemptInfo) {
  const nowUnix = Math.floor(new Date(nowIso).getTime() / 1000);
  const demoAircraft = [
    {
      icao24: '4baa01',
      callsign: 'THY2314 [DEMO]',
      originCountry: 'Turkey',
      longitude: 27.1428,
      latitude: 38.4237,
      baroAltitudeM: 8530,
      geoAltitudeM: 8680,
      onGround: false,
      velocityMs: 218.5,
      velocityKmh: 787,
      velocityKnots: 425,
      trueTrackDeg: 192.4,
      verticalRateMs: -3.2,
      lastContact: nowUnix - 12,
      timePosition: nowUnix - 12,
      squawk: '2142'
    },
    {
      icao24: '4bb142',
      callsign: 'PGT412 [DEMO]',
      originCountry: 'Turkey',
      longitude: 26.885,
      latitude: 37.845,
      baroAltitudeM: 10970,
      geoAltitudeM: 11120,
      onGround: false,
      velocityMs: 242.0,
      velocityKmh: 871,
      velocityKnots: 470,
      trueTrackDeg: 344.0,
      verticalRateMs: 0.0,
      lastContact: nowUnix - 8,
      timePosition: nowUnix - 9,
      squawk: '4721'
    },
    {
      icao24: '4682a1',
      callsign: 'AEE390 [DEMO]',
      originCountry: 'Greece',
      longitude: 25.4615,
      latitude: 38.1204,
      baroAltitudeM: 9750,
      geoAltitudeM: 9890,
      onGround: false,
      velocityMs: 230.2,
      velocityKmh: 829,
      velocityKnots: 447,
      trueTrackDeg: 68.5,
      verticalRateMs: 1.5,
      lastContact: nowUnix - 15,
      timePosition: nowUnix - 15,
      squawk: '1044'
    },
    {
      icao24: '4bc889',
      callsign: 'SXS774 [DEMO]',
      originCountry: 'Turkey',
      longitude: 27.648,
      latitude: 37.042,
      baroAltitudeM: 4210,
      geoAltitudeM: 4320,
      onGround: false,
      velocityMs: 165.4,
      velocityKmh: 595,
      velocityKnots: 322,
      trueTrackDeg: 135.2,
      verticalRateMs: -5.8,
      lastContact: nowUnix - 6,
      timePosition: nowUnix - 7,
      squawk: '3310'
    },
    {
      icao24: '3c6544',
      callsign: 'DLH1792 [DEMO]',
      originCountry: 'Germany',
      longitude: 26.192,
      latitude: 39.485,
      baroAltitudeM: 11580,
      geoAltitudeM: 11740,
      onGround: false,
      velocityMs: 251.8,
      velocityKmh: 906,
      velocityKnots: 489,
      trueTrackDeg: 158.0,
      verticalRateMs: 0.0,
      lastContact: nowUnix - 10,
      timePosition: nowUnix - 10,
      squawk: '5412'
    },
    {
      icao24: '4baa99',
      callsign: 'AJET508 [DEMO]',
      originCountry: 'Turkey',
      longitude: 27.156,
      latitude: 38.292,
      baroAltitudeM: 0,
      geoAltitudeM: 125,
      onGround: true,
      velocityMs: 12.0,
      velocityKmh: 43,
      velocityKnots: 23,
      trueTrackDeg: 340.0,
      verticalRateMs: 0.0,
      lastContact: nowUnix - 5,
      timePosition: nowUnix - 5,
      squawk: '2000'
    }
  ];

  const metrics = calculateMetrics(demoAircraft);

  const latestPayload = {
    source: 'demo-fallback',
    isDemo: true,
    demoNotice:
      'DİKKAT: Bu veri DEMO amaçlıdır. OpenSky canlı API çağrısı başarısız olduğu ve daha önce kaydedilmiş canlı veri bulunmadığı için arayüz doğrulaması amacıyla oluşturulmuştur.',
    fetchedAt: nowIso,
    apiTimestamp: nowUnix,
    bbox: BBOX,
    ...metrics,
    lastAttempt: attemptInfo,
    aircraft: demoAircraft
  };

  // Saatlik grafik için açıkça isDemo: true olarak işaretlenmiş örnek zaman serisi
  const snapshots = [];
  for (let i = 11; i >= 0; i--) {
    const t = new Date(Date.now() - i * 3600 * 1000);
    const count = i === 0 ? demoAircraft.length : 5 + ((i * 3) % 8);
    snapshots.push({
      timestamp: t.toISOString(),
      unixTime: Math.floor(t.getTime() / 1000),
      aircraftCount: count,
      airborneCount: Math.max(1, count - 1),
      avgAltitudeM: 8400 + ((i * 250) % 2000),
      avgVelocityKmh: 760 + ((i * 25) % 120),
      source: 'demo-fallback',
      isDemo: true,
      status: 'demo'
    });
  }

  return {
    latestPayload,
    snapshotsPayload: {
      updatedAt: nowIso,
      isDemo: true,
      bbox: BBOX,
      totalSnapshots: snapshots.length,
      snapshots
    }
  };
}

/**
 * OpenSky API'ye anonim erişim dener; ortam değişkeni verilmişse ve anonim 401/429 dönerse
 * kimlik bilgisiyle tekrar dener.
 */
async function requestOpenSky(url) {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'EgeHavaSahasiCanli/0.1 (MCBU-BuyukVeriAnalistligi)'
  };

  console.log(`[OpenSky] Anonim istek gönderiliyor: ${url}`);
  const response = await fetch(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  // Eğer anonim erişim 401 veya 429 döndüyse ve ortamda isteğe bağlı kimlik bilgileri tanımlıysa dene
  if (
    (response.status === 401 || response.status === 429) &&
    process.env.OPENSKY_USERNAME &&
    process.env.OPENSKY_PASSWORD
  ) {
    console.warn(
      `[OpenSky] Anonim erişim HTTP ${response.status} döndü. Ortam değişkenindeki kimlik bilgileri ile yeniden deneniyor...`
    );
    const basicAuth = Buffer.from(
      `${process.env.OPENSKY_USERNAME}:${process.env.OPENSKY_PASSWORD}`
    ).toString('base64');
    return fetch(url, {
      method: 'GET',
      headers: {
        ...headers,
        Authorization: `Basic ${basicAuth}`
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  }

  return response;
}

async function main() {
  const nowIso = new Date().toISOString();
  const nowUnix = Math.floor(Date.now() / 1000);
  const url = buildOpenSkyUrl();

  const existingLatestPath = path.join(OUTPUT_DIRS[0], 'latest.json');
  const existingSnapshotsPath = path.join(OUTPUT_DIRS[0], 'snapshots.json');

  const existingLatest = await readJsonSafe(existingLatestPath);
  const existingSnapshotsDoc = await readJsonSafe(existingSnapshotsPath);

  let attemptInfo = {
    timestamp: nowIso,
    status: 'ok',
    httpStatus: 200,
    errorType: null,
    message: 'OpenSky API üzerinden canlı veri başarıyla alındı.'
  };

  try {
    const response = await requestOpenSky(url);

    if (response.status === 429) {
      const retryAfter = response.headers.get('X-Rate-Limit-Retry-After-Seconds');
      const err = new Error(
        `OpenSky API istek limiti aşıldı (HTTP 429 Too Many Requests).${
          retryAfter ? ` Yeniden deneme süresi: ${retryAfter} sn.` : ''
        }`
      );
      err.errorType = 'HTTP_429';
      err.httpStatus = 429;
      throw err;
    }

    if (!response.ok) {
      const err = new Error(`OpenSky API HTTP ${response.status} (${response.statusText}) hatası döndürdü.`);
      err.errorType = 'HTTP_ERROR';
      err.httpStatus = response.status;
      throw err;
    }

    const rawData = await response.json();

    if (!rawData || !Array.isArray(rawData.states) || rawData.states.length === 0) {
      const err = new Error(
        'OpenSky API boş yanıt döndürdü (states dizisi boş veya null). Son başarılı veri korundu.'
      );
      err.errorType = 'EMPTY_RESPONSE';
      err.httpStatus = response.status;
      throw err;
    }

    const normalizedAircraft = rawData.states
      .map(normalizeStateVector)
      .filter((item) => item !== null);

    if (normalizedAircraft.length === 0) {
      const err = new Error(
        'OpenSky API yanıtında geçerli koordinata sahip uçak bulunamadı (EMPTY_RESPONSE).'
      );
      err.errorType = 'EMPTY_RESPONSE';
      err.httpStatus = response.status;
      throw err;
    }

    const metrics = calculateMetrics(normalizedAircraft);
    const apiTimestamp = typeof rawData.time === 'number' ? rawData.time : nowUnix;

    const latestPayload = {
      source: 'opensky-live',
      isDemo: false,
      demoNotice: null,
      fetchedAt: nowIso,
      apiTimestamp,
      bbox: BBOX,
      ...metrics,
      lastAttempt: attemptInfo,
      aircraft: normalizedAircraft
    };

    // Mevcut canlı snapshot geçmişini koru (önceki kayıtlar sadece demo ise temizle ve gerçek veriye geç)
    const previousSnapshots =
      existingSnapshotsDoc &&
      Array.isArray(existingSnapshotsDoc.snapshots) &&
      !existingSnapshotsDoc.isDemo
        ? existingSnapshotsDoc.snapshots
        : [];

    const newSnapshot = {
      timestamp: nowIso,
      unixTime: apiTimestamp,
      aircraftCount: metrics.aircraftCount,
      airborneCount: metrics.airborneCount,
      avgAltitudeM: metrics.avgAltitudeM,
      avgVelocityKmh: metrics.avgVelocityKmh,
      source: 'opensky-live',
      isDemo: false,
      status: 'ok'
    };

    const updatedSnapshots = [...previousSnapshots, newSnapshot].slice(-MAX_SNAPSHOTS);

    const snapshotsPayload = {
      updatedAt: nowIso,
      isDemo: false,
      bbox: BBOX,
      totalSnapshots: updatedSnapshots.length,
      snapshots: updatedSnapshots
    };

    await writeJsonToAllDirs('latest.json', latestPayload);
    await writeJsonToAllDirs('snapshots.json', snapshotsPayload);

    console.log(
      `[OpenSky] BAŞARILI: Ege hava sahasında ${metrics.aircraftCount} uçak (${metrics.airborneCount} havada) kaydedildi.`
    );
  } catch (error) {
    let errorType = error?.errorType || 'NETWORK_ERROR';
    let httpStatus = error?.httpStatus || null;
    let errorMessage = error instanceof Error ? error.message : String(error);

    if (
      error?.name === 'TimeoutError' ||
      error?.name === 'AbortError' ||
      /timeout|aborted/i.test(errorMessage)
    ) {
      errorType = 'TIMEOUT';
      errorMessage = `OpenSky API isteği ${REQUEST_TIMEOUT_MS} ms içinde yanıt vermedi (Zaman Aşımı).`;
    } else if (errorType === 'NETWORK_ERROR' && error?.cause) {
      const causeCode = error.cause.code || error.cause.message || '';
      errorMessage = `Ağ bağlantı hatası (${causeCode || errorMessage}). OpenSky sunucusuna erişilemedi.`;
    }

    attemptInfo = {
      timestamp: nowIso,
      status: 'error',
      httpStatus,
      errorType,
      message: errorMessage
    };

    console.warn(`[OpenSky] UYARI (${errorType}): ${errorMessage}`);

    // Eğer daha önce kaydedilmiş bir latest.json varsa SİLME, son başarılı veriyi koru!
    if (existingLatest && Array.isArray(existingLatest.aircraft) && existingLatest.aircraft.length > 0) {
      const preservedLatest = {
        ...existingLatest,
        lastAttempt: attemptInfo
      };
      await writeJsonToAllDirs('latest.json', preservedLatest);

      if (existingSnapshotsDoc) {
        const preservedSnapshots = {
          ...existingSnapshotsDoc,
          lastAttempt: attemptInfo
        };
        await writeJsonToAllDirs('snapshots.json', preservedSnapshots);
      }

      console.warn(
        `[OpenSky] Son başarılı veri korundu (fetchedAt: ${existingLatest.fetchedAt}, isDemo: ${Boolean(
          existingLatest.isDemo
        )}, uçak sayısı: ${existingLatest.aircraft.length}).`
      );
    } else {
      // Henüz hiç veri yoksa açıkça DEMO olarak etiketlenmiş yedek veri oluştur
      console.warn(
        '[OpenSky] Diskte geçmiş başarılı veri bulunamadı. Açıkça DEMO olarak etiketlenmiş yedek veri (isDemo: true) oluşturuluyor.'
      );
      const { latestPayload, snapshotsPayload } = createExplicitDemoData(nowIso, attemptInfo);
      await writeJsonToAllDirs('latest.json', latestPayload);
      await writeJsonToAllDirs('snapshots.json', snapshotsPayload);
    }
  }
}

main();
