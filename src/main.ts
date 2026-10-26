import './style.css';
import {
  loadDashboardData,
  STALE_THRESHOLD_MINUTES,
  type LoadedDashboardData
} from './dataService';
import { AegeanRadarMap } from './mapView';
import { HourlyFlightsChart } from './chartView';
import type { AircraftState, UiStateMode } from './types';

const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 dakikada bir otomatik yenileme

class DashboardController {
  private mapView: AegeanRadarMap;
  private chartView: HourlyFlightsChart;
  private loadedData: LoadedDashboardData | null = null;
  private selectedAircraft: AircraftState | null = null;
  private uiMode: UiStateMode = 'auto';
  private searchQuery = '';
  private statusFilter: 'all' | 'airborne' | 'ground' = 'all';
  private isRefreshing = false;
  private refreshErrorMessage: string | null = null;
  private autoRefreshTimerId: number | null = null;

  constructor() {
    this.mapView = new AegeanRadarMap('aegean-map', (aircraft) => {
      this.selectAircraft(aircraft, false);
    });
    this.chartView = new HourlyFlightsChart('hourly-flights-chart');

    this.bindEvents();
    this.startAutoRefreshLifecycle();
    void this.refreshData({ isBackground: false });
  }

  private bindEvents(): void {
    const refreshBtn = document.getElementById('refresh-btn');
    refreshBtn?.addEventListener('click', () => {
      void this.refreshData({ isBackground: false });
    });

    const resetMapBtn = document.getElementById('reset-map-btn');
    resetMapBtn?.addEventListener('click', () => {
      if (this.loadedData) {
        this.mapView.resetView(this.loadedData.latest.bbox);
      }
    });

    const clearSelectionBtn = document.getElementById('clear-selection-btn');
    clearSelectionBtn?.addEventListener('click', () => {
      this.selectAircraft(null, false);
    });

    const focusSelectedBtn = document.getElementById('focus-selected-btn');
    focusSelectedBtn?.addEventListener('click', () => {
      if (this.selectedAircraft) {
        this.mapView.focusAircraft(this.selectedAircraft);
      }
    });

    const stateSelect = document.getElementById('ui-state-select') as HTMLSelectElement | null;
    stateSelect?.addEventListener('change', () => {
      this.uiMode = (stateSelect.value as UiStateMode) || 'auto';
      this.renderAll();
    });

    const searchInput = document.getElementById('aircraft-search') as HTMLInputElement | null;
    searchInput?.addEventListener('input', () => {
      this.searchQuery = searchInput.value.trim().toLowerCase();
      this.renderAircraftMapAndTable();
    });

    const filterSelect = document.getElementById('aircraft-filter') as HTMLSelectElement | null;
    filterSelect?.addEventListener('change', () => {
      this.statusFilter = (filterSelect.value as 'all' | 'airborne' | 'ground') || 'all';
      this.renderAircraftMapAndTable();
    });
  }

  /**
   * 5 dakikada bir yayımlanmış JSON dosyalarını yeniden okur.
   * Sekme gizliyken (arka planda) gereksiz ağ isteği yapmaz; sekme tekrar görünür olduğunda yeniler.
   */
  private startAutoRefreshLifecycle(): void {
    if (this.autoRefreshTimerId !== null) {
      window.clearInterval(this.autoRefreshTimerId);
    }

    this.autoRefreshTimerId = window.setInterval(() => {
      if (document.visibilityState === 'hidden') {
        return;
      }
      void this.refreshData({ isBackground: true });
    }, AUTO_REFRESH_INTERVAL_MS);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.refreshData({ isBackground: true });
      }
    });
  }

  public async refreshData(options: { isBackground?: boolean } = {}): Promise<void> {
    // Aynı anda birden fazla yenileme çalışmasını engelle
    if (this.isRefreshing) {
      return;
    }

    this.isRefreshing = true;
    const isInitialLoad = this.loadedData === null;
    const showLoadingSpinner = !options.isBackground || isInitialLoad;

    this.setRefreshButtonState(true);
    if (showLoadingSpinner) {
      this.setLoadingBanner(true);
    }

    try {
      const data = await loadDashboardData();
      this.loadedData = data;
      this.refreshErrorMessage = null;
      this.mapView.drawBoundingBox(data.latest.bbox);

      // Seçili uçak hala listedeyse referansını güncelle
      if (this.selectedAircraft) {
        const updated =
          data.latest.aircraft.find((a) => a.icao24 === this.selectedAircraft?.icao24) ?? null;
        this.selectedAircraft = updated;
      }

      this.setLoadingBanner(false);
      this.renderAll();
    } catch (err) {
      this.setLoadingBanner(false);
      const message = err instanceof Error ? err.message : String(err);

      if (this.loadedData) {
        // Arka plan veya el ile yenileme başarısız olduğunda önceki başarılı harita ve tablo verilerini SİLME
        this.refreshErrorMessage = message;
        this.recalculateLoadedDataAge();
        this.renderStatusBanners();
        this.renderHeaderMeta();
      } else {
        // İlk açılıştaki yükleme hatasını mevcut hata ekranıyla yönet
        this.showFatalLoadError(message);
      }
    } finally {
      this.isRefreshing = false;
      this.setRefreshButtonState(false);
    }
  }

  private recalculateLoadedDataAge(): void {
    if (!this.loadedData) return;
    const fetchedTimeMs = new Date(this.loadedData.latest.fetchedAt).getTime();
    const ageMs = Math.max(0, Date.now() - (Number.isNaN(fetchedTimeMs) ? 0 : fetchedTimeMs));
    const dataAgeMinutes = Math.round(ageMs / 60000);
    this.loadedData.dataAgeMinutes = dataAgeMinutes;
    this.loadedData.isStale =
      dataAgeMinutes > STALE_THRESHOLD_MINUTES || this.loadedData.usedFallbackAfterRemoteError;
  }

  private setRefreshButtonState(busy: boolean): void {
    const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement | null;
    if (!refreshBtn) return;
    refreshBtn.disabled = busy;
    refreshBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
    refreshBtn.textContent = busy ? 'Yenileniyor...' : 'Veriyi Yenile';
  }

  private setLoadingBanner(isLoading: boolean): void {
    const loadingEl = document.getElementById('state-loading');
    if (loadingEl) {
      loadingEl.hidden = !isLoading;
    }
  }

  private showFatalLoadError(message: string): void {
    const errorEl = document.getElementById('state-error');
    const errorTypeEl = document.getElementById('error-type-code');
    const errorTextEl = document.getElementById('error-banner-text');
    const sourceBadge = document.getElementById('data-source-badge');

    if (errorEl) errorEl.hidden = false;
    if (errorTypeEl) errorTypeEl.textContent = 'DOSYA_OKUMA_HATASI';
    if (errorTextEl) {
      errorTextEl.textContent = `Veri dosyaları okunamadı: ${message}. Lütfen önce "npm run data:fetch" komutunu çalıştırın.`;
    }
    if (sourceBadge) {
      sourceBadge.textContent = 'Hata: Veri Yok';
    }
  }

  private getFilteredAircraft(): AircraftState[] {
    if (!this.loadedData) return [];
    if (this.uiMode === 'empty') return [];

    return this.loadedData.latest.aircraft.filter((a) => {
      if (this.statusFilter === 'airborne' && a.onGround) return false;
      if (this.statusFilter === 'ground' && !a.onGround) return false;

      if (this.searchQuery) {
        const haystack = `${a.callsign} ${a.icao24} ${a.originCountry}`.toLowerCase();
        if (!haystack.includes(this.searchQuery)) return false;
      }
      return true;
    });
  }

  private renderAll(): void {
    if (!this.loadedData) return;

    const { snapshotsDoc } = this.loadedData;

    this.renderStatusBanners();
    this.renderHeaderMeta();
    this.renderKpiCards();
    this.renderAircraftMapAndTable();
    this.renderDetailPanel();

    const summaryEl = document.getElementById('chart-text-summary');
    const chartTableBodyEl = document.getElementById('chart-table-body');
    if (summaryEl && chartTableBodyEl) {
      const snapshotsToRender = this.uiMode === 'empty' ? [] : snapshotsDoc.snapshots;
      this.chartView.render(snapshotsToRender, summaryEl, chartTableBodyEl);
    }
  }

  private renderStatusBanners(): void {
    if (!this.loadedData) return;
    const {
      latest,
      isStale,
      dataAgeMinutes,
      usedFallbackAfterRemoteError,
      remoteFallbackReason
    } = this.loadedData;

    const loadingEl = document.getElementById('state-loading');
    const demoEl = document.getElementById('state-demo');
    const demoTextEl = document.getElementById('demo-banner-text');
    const errorEl = document.getElementById('state-error');
    const errorTypeEl = document.getElementById('error-type-code');
    const errorTextEl = document.getElementById('error-banner-text');
    const staleEl = document.getElementById('state-stale');
    const staleTextEl = document.getElementById('stale-banner-text');
    const emptyEl = document.getElementById('state-empty');

    if (loadingEl) loadingEl.hidden = this.uiMode !== 'loading' && !this.isRefreshing;

    // Demo durumu: Gerçek veri alınamadığında sahte veriyi asla canlıymış gibi göstermez
    if (demoEl) {
      demoEl.hidden = !latest.isDemo;
      if (latest.isDemo && demoTextEl) {
        demoTextEl.textContent =
          latest.demoNotice ||
          'OpenSky API canlı çağrısı başarısız olduğu için açıkça DEMO olarak etiketlenmiş örnek veri gösterilmektedir. Bu kayıtlar canlı uçuş verisi değildir.';
      }
    }

    // Hata durumu (Son deneme başarısızsa, arka plan yenilemesi hata verdiyse veya 'error' önizlemesi seçildiyse)
    const hasAttemptError = Boolean(latest.lastAttempt && latest.lastAttempt.status === 'error');
    const hasRefreshError = Boolean(this.refreshErrorMessage);
    const showError =
      this.uiMode === 'error' ||
      (this.uiMode === 'auto' && (hasAttemptError || hasRefreshError));

    if (errorEl) {
      errorEl.hidden = !showError;
      if (showError && errorTypeEl && errorTextEl) {
        if (hasRefreshError) {
          errorTypeEl.textContent = 'YENİLEME_HATASI';
          errorTextEl.textContent = `Yeni veri dosyaları okunamadı (${this.refreshErrorMessage}). Önceki başarılı harita ve tablo verileri silinmeden korunmaktadır.`;
        } else {
          const errCode =
            this.uiMode === 'error' && !hasAttemptError
              ? 'HTTP_429 / TIMEOUT (ÖNİZLEME)'
              : latest.lastAttempt.errorType || 'API_HATASI';
          const errMsg =
            this.uiMode === 'error' && !hasAttemptError
              ? 'OpenSky API istek limiti (HTTP 429) veya zaman aşımı oluştu. Son başarılı veri silinmeden korunmaktadır.'
              : `${latest.lastAttempt.message} (${
                  latest.isDemo
                    ? 'Canlı veri bulunmadığından açıkça etiketlenmiş DEMO verisi yüklendi.'
                    : 'Son başarılı uçuş verisi silinmeden korundu.'
                })`;
          errorTypeEl.textContent = errCode;
          errorTextEl.textContent = errMsg;
        }
      }
    }

    // Eski veri durumu (veya uzak dal okunamayıp yerel yedeğe düşülmesi)
    const showStale = this.uiMode === 'stale' || (this.uiMode === 'auto' && isStale);
    if (staleEl) {
      staleEl.hidden = !showStale;
      if (showStale && staleTextEl) {
        const mins = this.uiMode === 'stale' && !isStale ? 45 : dataAgeMinutes;
        const fallbackNote = usedFallbackAfterRemoteError
          ? ` Uzak veri kaynağına ulaşılamadığı için (${
              remoteFallbackReason || 'bağlantı hatası'
            }) yerel yedek paket verisi gösterilmektedir; bu veri canlı/yeni değildir.`
          : '';
        staleTextEl.textContent = `Görüntülenen son başarılı uçuş verisi ${mins} dakika önce çekilmiştir (${formatDateTime(
          latest.fetchedAt
        )}).${fallbackNote} Otomatik GitHub Actions iş akışı veya "Veriyi Yenile" ile güncellenebilir.`;
      }
    }

    // Boş sonuç durumu
    const filtered = this.getFilteredAircraft();
    const showEmpty = this.uiMode === 'empty' || filtered.length === 0;
    if (emptyEl) {
      emptyEl.hidden = !showEmpty;
    }
  }

  private renderHeaderMeta(): void {
    if (!this.loadedData) return;
    const { latest, loadedFrom, dataAgeMinutes, isStale, usedFallbackAfterRemoteError } =
      this.loadedData;

    const sourceBadge = document.getElementById('data-source-badge');
    const ageBadge = document.getElementById('data-age-badge');
    const updatedText = document.getElementById('last-updated-text');

    if (sourceBadge) {
      if (latest.isDemo) {
        sourceBadge.textContent = 'DEMO VERİSİ (Canlı Değil)';
        sourceBadge.className = 'badge badge-outline';
      } else if (usedFallbackAfterRemoteError) {
        sourceBadge.textContent = 'Eski Veri (Yerel Yedek)';
        sourceBadge.className = 'badge badge-outline';
      } else if (isStale) {
        sourceBadge.textContent = 'OpenSky Verisi (Eski)';
        sourceBadge.className = 'badge badge-outline';
      } else {
        sourceBadge.textContent = 'OpenSky Canlı Veri';
        sourceBadge.className = 'badge badge-accent';
      }
    }

    if (ageBadge) {
      const originLabel =
        loadedFrom === 'github-data-branch'
          ? 'data dalı'
          : usedFallbackAfterRemoteError
          ? 'yerel yedek'
          : 'yerel JSON';
      ageBadge.textContent =
        dataAgeMinutes <= 1 && !usedFallbackAfterRemoteError
          ? `Az önce güncellendi (${originLabel})`
          : `${dataAgeMinutes} dk önce (${originLabel})`;
    }

    if (updatedText) {
      const attemptNote =
        latest.lastAttempt?.status === 'error'
          ? ` | Son deneme: ${formatDateTime(latest.lastAttempt.timestamp)} (${
              latest.lastAttempt.errorType
            })`
          : '';
      updatedText.textContent = `Son Başarılı Veri Zamanı: ${formatDateTime(
        latest.fetchedAt
      )}${attemptNote}`;
    }
  }

  private renderKpiCards(): void {
    if (!this.loadedData) return;
    const { latest } = this.loadedData;

    const countEl = document.getElementById('kpi-aircraft-count');
    const countSubEl = document.getElementById('kpi-aircraft-sub');
    const altEl = document.getElementById('kpi-avg-altitude');
    const altSubEl = document.getElementById('kpi-altitude-sub');
    const speedEl = document.getElementById('kpi-avg-speed');
    const speedSubEl = document.getElementById('kpi-speed-sub');

    if (this.uiMode === 'empty') {
      if (countEl) countEl.textContent = '0';
      if (countSubEl) countSubEl.textContent = 'Havada: 0 | Yerde: 0';
      if (altEl) altEl.textContent = '0 m';
      if (altSubEl) altSubEl.textContent = 'Aktif uçuş yok';
      if (speedEl) speedEl.textContent = '0 km/h';
      if (speedSubEl) speedSubEl.textContent = 'Aktif uçuş yok';
      return;
    }

    const demoSuffix = latest.isDemo ? ' (DEMO)' : '';
    const avgAltFeet = Math.round(latest.avgAltitudeM * 3.28084);
    const avgKnots = Math.round(latest.avgVelocityKmh / 1.852);
    const avgMs = Math.round(latest.avgVelocityKmh / 3.6);

    if (countEl) {
      countEl.textContent = `${latest.aircraftCount}${demoSuffix}`;
    }
    if (countSubEl) {
      countSubEl.textContent = `Havada: ${latest.airborneCount} | Yerde: ${latest.onGroundCount}`;
    }

    if (altEl) {
      altEl.textContent = `${latest.avgAltitudeM.toLocaleString('tr-TR')} m`;
    }
    if (altSubEl) {
      altSubEl.textContent = `Yaklaşık ${avgAltFeet.toLocaleString('tr-TR')} ft (barometrik ort.)`;
    }

    if (speedEl) {
      speedEl.textContent = `${latest.avgVelocityKmh.toLocaleString('tr-TR')} km/h`;
    }
    if (speedSubEl) {
      speedSubEl.textContent = `Yaklaşık ${avgKnots.toLocaleString('tr-TR')} knot (${avgMs} m/s)`;
    }
  }

  private renderAircraftMapAndTable(): void {
    const filtered = this.getFilteredAircraft();
    this.mapView.renderAircraft(filtered, this.selectedAircraft?.icao24 ?? null);

    // Durum bandındaki boş sonuç görünümünü güncelle
    const emptyEl = document.getElementById('state-empty');
    if (emptyEl) {
      emptyEl.hidden = !(this.uiMode === 'empty' || filtered.length === 0);
    }

    const countLabel = document.getElementById('table-count-label');
    if (countLabel) {
      countLabel.textContent = `${filtered.length} uçak listeleniyor`;
    }

    const tbody = document.getElementById('aircraft-table-body');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="empty-cell">
            Eşleşen uçak kaydı bulunamadı (Boş Sonuç).
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered
      .map((aircraft) => {
        const isSelected = this.selectedAircraft?.icao24 === aircraft.icao24;
        const safeIcao = escapeHtml(aircraft.icao24);
        const safeCallsign = escapeHtml(aircraft.callsign);
        const safeCountry = escapeHtml(aircraft.originCountry);
        const altM =
          aircraft.baroAltitudeM !== null
            ? `${aircraft.baroAltitudeM.toLocaleString('tr-TR')} m`
            : 'Yerde (0 m)';
        const altFt =
          aircraft.baroAltitudeM !== null
            ? `${Math.round(aircraft.baroAltitudeM * 3.28084).toLocaleString('tr-TR')} ft`
            : '-';
        const spdKmh =
          aircraft.velocityKmh !== null ? `${aircraft.velocityKmh} km/h` : '0 km/h';
        const spdKt =
          aircraft.velocityKnots !== null ? `${aircraft.velocityKnots} kt` : '0 kt';
        const statusText = aircraft.onGround ? 'Yerde' : 'Havada';

        return `
          <tr
            class="${isSelected ? 'is-selected-row' : ''}"
            aria-selected="${isSelected ? 'true' : 'false'}"
            data-icao24="${safeIcao}"
          >
            <th scope="row">
              <strong>${safeCallsign}</strong>
            </th>
            <td><code>${safeIcao}</code></td>
            <td>${safeCountry}</td>
            <td>${altM} <small>(${altFt})</small></td>
            <td>${spdKmh} <small>(${spdKt})</small></td>
            <td>${aircraft.trueTrackDeg.toFixed(1)}°</td>
            <td>${aircraft.latitude.toFixed(3)}°K, ${aircraft.longitude.toFixed(3)}°D</td>
            <td>
              <span class="badge ${aircraft.onGround ? 'badge-outline' : 'badge-accent'}">
                ${statusText}
              </span>
            </td>
            <td>
              <button
                type="button"
                class="btn btn-secondary btn-sm select-aircraft-btn"
                data-icao24="${safeIcao}"
                aria-label="${safeCallsign} uçağının irtifa ve hız detayını göster"
              >
                ${isSelected ? 'Seçili ✓' : 'Detay & Odakla'}
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    const buttons = tbody.querySelectorAll<HTMLButtonElement>('.select-aircraft-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const icao = btn.getAttribute('data-icao24');
        const found = filtered.find((a) => a.icao24 === icao) ?? null;
        if (found) {
          this.selectAircraft(found, true);
        }
      });
    });
  }

  private selectAircraft(aircraft: AircraftState | null, flyToOnMap: boolean): void {
    this.selectedAircraft = aircraft;
    this.renderAircraftMapAndTable();
    this.renderDetailPanel();

    if (aircraft && flyToOnMap) {
      this.mapView.focusAircraft(aircraft);
    }
  }

  private renderDetailPanel(): void {
    const emptyStateEl = document.getElementById('detail-empty-state');
    const contentEl = document.getElementById('detail-content');
    const clearBtn = document.getElementById('clear-selection-btn');

    if (!this.selectedAircraft || this.uiMode === 'empty') {
      if (emptyStateEl) emptyStateEl.hidden = false;
      if (contentEl) contentEl.hidden = true;
      if (clearBtn) clearBtn.hidden = true;
      return;
    }

    const a = this.selectedAircraft;
    if (emptyStateEl) emptyStateEl.hidden = true;
    if (contentEl) contentEl.hidden = false;
    if (clearBtn) clearBtn.hidden = false;

    setText('detail-callsign', a.callsign);

    const statusBadge = document.getElementById('detail-status-badge');
    if (statusBadge) {
      statusBadge.textContent = a.onGround ? 'Yerde' : 'Havada';
      statusBadge.className = a.onGround ? 'badge badge-outline' : 'badge badge-accent';
    }

    const baroAltM =
      a.baroAltitudeM !== null ? `${a.baroAltitudeM.toLocaleString('tr-TR')} m` : '0 m (Yerde)';
    const baroAltFt =
      a.baroAltitudeM !== null
        ? `${Math.round(a.baroAltitudeM * 3.28084).toLocaleString('tr-TR')} ft`
        : 'Yerde';
    setText('detail-baro-alt', baroAltM);
    setText('detail-baro-ft', baroAltFt);

    const spdKmh = a.velocityKmh !== null ? `${a.velocityKmh.toLocaleString('tr-TR')} km/h` : '0 km/h';
    const spdSub =
      a.velocityKnots !== null && a.velocityMs !== null
        ? `${a.velocityKnots} knot (${a.velocityMs} m/s)`
        : '0 knot (0 m/s)';
    setText('detail-speed-kmh', spdKmh);
    setText('detail-speed-sub', spdSub);

    setText('detail-icao24', a.icao24.toUpperCase());
    setText('detail-country', a.originCountry);
    setText(
      'detail-geo-alt',
      a.geoAltitudeM !== null ? `${a.geoAltitudeM.toLocaleString('tr-TR')} m` : 'Bilinmiyor'
    );

    const vRate = a.verticalRateMs ?? 0;
    const vRateLabel =
      vRate > 0.3
        ? `+${vRate} m/s (Tırmanış)`
        : vRate < -0.3
        ? `${vRate} m/s (Alçalış)`
        : `${vRate} m/s (Düz Uçuş)`;
    setText('detail-vertical-rate', vRateLabel);

    setText('detail-heading', `${a.trueTrackDeg.toFixed(1)}°`);
    setText('detail-coords', `${a.latitude.toFixed(4)}° K, ${a.longitude.toFixed(4)}° D`);
    setText('detail-squawk', a.squawk || 'Belirtilmedi');
    setText(
      'detail-last-contact',
      new Date(a.lastContact * 1000).toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    );
  }
}

function setText(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.addEventListener('DOMContentLoaded', () => {
  new DashboardController();
});
