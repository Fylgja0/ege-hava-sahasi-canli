import type { LatestFlightData, SnapshotsDocument } from './types';

export const DEFAULT_REMOTE_DATA_BASE_URL =
  'https://raw.githubusercontent.com/Fylgja0/ege-hava-sahasi-canli/data/data';
const LOCAL_DATA_BASE = './data';

export interface LoadedDashboardData {
  latest: LatestFlightData;
  snapshotsDoc: SnapshotsDocument;
  loadedFrom: 'local-static' | 'github-data-branch';
  isStale: boolean;
  dataAgeMinutes: number;
  usedFallbackAfterRemoteError: boolean;
  remoteFallbackReason: string | null;
}

export const STALE_THRESHOLD_MINUTES = 30;

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const cacheBustUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    const response = await fetch(cacheBustUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Veri dosyası okunamadı: HTTP ${response.status} (${url})`);
    }
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Tarayıcıdan doğrudan OpenSky API'sine hiçbir koşulda istek ATILMAZ.
 * Yalnızca veri toplama scriptinin yayımladığı latest.json ve snapshots.json okunur.
 *
 * Öncelik sırası:
 * 1. VITE_DATA_BASE_URL ortam değişkeni tanımlıysa önce bu adres kullanılır.
 * 2. Değilse üretim derlemesinde (import.meta.env.PROD) veya GitHub Pages'te varsayılan olarak
 *    https://raw.githubusercontent.com/Fylgja0/ege-hava-sahasi-canli/data/data kullanılır.
 * 3. Yerel geliştirmede (npm run dev) veya uzak adres okunamadığında ./data yerel yedeği kullanılır.
 *    Uzak adres başarısız olup yerel yedeğe düşüldüğünde veri asla yeni/canlı gibi işaretlenmez;
 *    eski veri (isStale = true) ve yedek uyarısı aktif edilir.
 */
export async function loadDashboardData(preferRemoteBranch = false): Promise<LoadedDashboardData> {
  const envBase = (import.meta.env.VITE_DATA_BASE_URL as string | undefined)?.trim();
  const isProdBuild = Boolean(import.meta.env.PROD);
  const isGitHubPages =
    typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

  const candidateBases: Array<{ base: string; type: 'local-static' | 'github-data-branch' }> = [];

  if (envBase) {
    candidateBases.push({ base: envBase.replace(/\/$/, ''), type: 'github-data-branch' });
  } else if (preferRemoteBranch || isProdBuild || isGitHubPages) {
    candidateBases.push({ base: DEFAULT_REMOTE_DATA_BASE_URL, type: 'github-data-branch' });
  }

  candidateBases.push({ base: LOCAL_DATA_BASE, type: 'local-static' });

  let lastError: Error | null = null;
  let remoteError: Error | null = null;

  for (const candidate of candidateBases) {
    try {
      const [latest, snapshotsDoc] = await Promise.all([
        fetchJsonWithTimeout<LatestFlightData>(`${candidate.base}/latest.json`),
        fetchJsonWithTimeout<SnapshotsDocument>(`${candidate.base}/snapshots.json`)
      ]);

      const fetchedTimeMs = new Date(latest.fetchedAt).getTime();
      const ageMs = Math.max(0, Date.now() - (Number.isNaN(fetchedTimeMs) ? 0 : fetchedTimeMs));
      const dataAgeMinutes = Math.round(ageMs / 60000);
      const usedFallbackAfterRemoteError =
        candidate.type === 'local-static' && remoteError !== null;

      // Uzaktaki güncel veri okunamayıp yerel paket yedeğine düşüldüyse eski veri uyarısını zorunlu göster
      const isStale =
        dataAgeMinutes > STALE_THRESHOLD_MINUTES || usedFallbackAfterRemoteError;

      return {
        latest,
        snapshotsDoc,
        loadedFrom: candidate.type,
        isStale,
        dataAgeMinutes,
        usedFallbackAfterRemoteError,
        remoteFallbackReason: remoteError ? remoteError.message : null
      };
    } catch (err) {
      const normalizedErr = err instanceof Error ? err : new Error(String(err));
      lastError = normalizedErr;
      if (candidate.type === 'github-data-branch') {
        remoteError = normalizedErr;
      }
    }
  }

  throw (
    lastError ??
    new Error('Uçuş veri dosyalarına (latest.json / snapshots.json) erişilemedi.')
  );
}
