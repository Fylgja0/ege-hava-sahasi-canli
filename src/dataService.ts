import type { LatestFlightData, SnapshotsDocument } from './types';

const REMOTE_DATA_BRANCH_BASE =
  'https://raw.githubusercontent.com/Fylgja0/ege-hava-sahasi-canli/data/data';
const LOCAL_DATA_BASE = './data';

export interface LoadedDashboardData {
  latest: LatestFlightData;
  snapshotsDoc: SnapshotsDocument;
  loadedFrom: 'local-static' | 'github-data-branch';
  isStale: boolean;
  dataAgeMinutes: number;
}

const STALE_THRESHOLD_MINUTES = 30;

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
 * Tarayıcıdan doğrudan OpenSky API'sine istek ATILMAZ.
 * Yalnızca veri toplama scriptinin ürettiği latest.json ve snapshots.json okunur.
 * Üretim ortamında (GitHub Pages veya VITE_DATA_SOURCE=remote) önce `data` dalındaki
 * güncel JSON dosyaları denenir; yerel geliştirmede `./data/` altındaki dosyalar okunur.
 */
export async function loadDashboardData(preferRemoteBranch = false): Promise<LoadedDashboardData> {
  const envBase = import.meta.env.VITE_DATA_BASE_URL as string | undefined;
  const isGitHubPages =
    typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

  const candidateBases: Array<{ base: string; type: 'local-static' | 'github-data-branch' }> = [];

  if (envBase) {
    candidateBases.push({ base: envBase.replace(/\/$/, ''), type: 'github-data-branch' });
  } else if (preferRemoteBranch || isGitHubPages) {
    candidateBases.push({ base: REMOTE_DATA_BRANCH_BASE, type: 'github-data-branch' });
  }

  candidateBases.push({ base: LOCAL_DATA_BASE, type: 'local-static' });

  let lastError: Error | null = null;

  for (const candidate of candidateBases) {
    try {
      const [latest, snapshotsDoc] = await Promise.all([
        fetchJsonWithTimeout<LatestFlightData>(`${candidate.base}/latest.json`),
        fetchJsonWithTimeout<SnapshotsDocument>(`${candidate.base}/snapshots.json`)
      ]);

      const fetchedTimeMs = new Date(latest.fetchedAt).getTime();
      const ageMs = Math.max(0, Date.now() - (Number.isNaN(fetchedTimeMs) ? 0 : fetchedTimeMs));
      const dataAgeMinutes = Math.round(ageMs / 60000);
      const isStale = dataAgeMinutes > STALE_THRESHOLD_MINUTES;

      return {
        latest,
        snapshotsDoc,
        loadedFrom: candidate.type,
        isStale,
        dataAgeMinutes
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw (
    lastError ??
    new Error('Uçuş veri dosyalarına (latest.json / snapshots.json) erişilemedi.')
  );
}
