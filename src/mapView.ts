import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { AircraftState, BoundingBox } from './types';

export type AircraftSelectCallback = (aircraft: AircraftState) => void;

export class AegeanRadarMap {
  private map: L.Map;
  private markersLayer: L.LayerGroup;
  private bboxLayer: L.LayerGroup;
  private markersByIcao: Map<string, L.Marker> = new Map();
  private selectedIcao24: string | null = null;
  private onSelect: AircraftSelectCallback;

  constructor(containerId: string, onSelect: AircraftSelectCallback) {
    this.onSelect = onSelect;

    this.map = L.map(containerId, {
      center: [38.5, 27.5],
      zoom: 7,
      minZoom: 5,
      maxZoom: 13,
      zoomControl: true
    });

    // Zorunlu OpenStreetMap atfı ile harita katmanı
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> katkıda bulunanları | Veri: <a href="https://opensky-network.org" target="_blank" rel="noopener noreferrer">OpenSky Network</a>',
      maxZoom: 18,
      className: 'radar-map-tiles'
    }).addTo(this.map);

    this.bboxLayer = L.layerGroup().addTo(this.map);
    this.markersLayer = L.layerGroup().addTo(this.map);
  }

  public drawBoundingBox(bbox: BoundingBox): void {
    this.bboxLayer.clearLayers();
    const bounds: L.LatLngBoundsExpression = [
      [bbox.lamin, bbox.lomin],
      [bbox.lamax, bbox.lomax]
    ];

    const rect = L.rectangle(bounds, {
      color: '#2dd4bf',
      weight: 2,
      opacity: 0.75,
      fillColor: '#2dd4bf',
      fillOpacity: 0.04,
      dashArray: '6, 6'
    });

    rect.bindTooltip(
      `Ege Gözlem Sınır Kutusu (${bbox.lamin}°K - ${bbox.lamax}°K, ${bbox.lomin}°D - ${bbox.lomax}°D | ${bbox.areaSqDeg} kare derece)`,
      { sticky: false, direction: 'top' }
    );

    this.bboxLayer.addLayer(rect);
  }

  private createAircraftIcon(aircraft: AircraftState, isSelected: boolean): L.DivIcon {
    const rotation = Number.isFinite(aircraft.trueTrackDeg) ? Number(aircraft.trueTrackDeg) : 0;
    const statusClass = isSelected
      ? 'aircraft-marker is-selected'
      : aircraft.onGround
      ? 'aircraft-marker is-ground'
      : 'aircraft-marker';

    const altText =
      aircraft.baroAltitudeM !== null
        ? `${Number(aircraft.baroAltitudeM).toLocaleString('tr-TR')} m`
        : 'Yerde / Bilinmiyor';
    const spdText =
      aircraft.velocityKmh !== null ? `${Number(aircraft.velocityKmh)} km/h` : '0 km/h';

    const safeCallsign = escapeHtml(aircraft.callsign);
    const safeOriginCountry = escapeHtml(aircraft.originCountry);
    const safeTag = escapeHtml(aircraft.callsign.replace(' [DEMO]', ''));
    const safeAltText = escapeHtml(altText);
    const safeSpdText = escapeHtml(spdText);

    const html = `
      <button
        type="button"
        class="${statusClass}"
        aria-label="Uçak ${safeCallsign}, İrtifa ${safeAltText}, Hız ${safeSpdText}"
        title="${safeCallsign} (${safeOriginCountry}) - İrtifa: ${safeAltText}, Hız: ${safeSpdText}"
      >
        <span class="aircraft-glyph" style="transform: rotate(${rotation}deg);" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
            <path d="M12 2L14.5 9.5L21 12L14.5 14L13.5 20L16 21.5V22.5L12 21.5L8 22.5V21.5L10.5 20L9.5 14L3 12L9.5 9.5L12 2Z" fill="currentColor" />
          </svg>
        </span>
        <span class="aircraft-tag">${safeTag}</span>
      </button>
    `;

    return L.divIcon({
      html,
      className: 'aircraft-div-icon',
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
  }

  public renderAircraft(aircraftList: AircraftState[], selectedIcao24: string | null): void {
    this.selectedIcao24 = selectedIcao24;
    this.markersLayer.clearLayers();
    this.markersByIcao.clear();

    for (const aircraft of aircraftList) {
      const isSelected = aircraft.icao24 === this.selectedIcao24;
      const marker = L.marker([aircraft.latitude, aircraft.longitude], {
        icon: this.createAircraftIcon(aircraft, isSelected),
        keyboard: false, // İçerideki <button> doğrudan klavye odağını yönetir
        zIndexOffset: isSelected ? 1000 : aircraft.onGround ? -100 : 100
      });

      marker.on('click', () => {
        this.onSelect(aircraft);
      });

      marker.addTo(this.markersLayer);
      this.markersByIcao.set(aircraft.icao24, marker);
    }
  }

  public focusAircraft(aircraft: AircraftState): void {
    this.selectedIcao24 = aircraft.icao24;
    this.map.flyTo([aircraft.latitude, aircraft.longitude], Math.max(this.map.getZoom(), 8), {
      duration: 0.6
    });
  }

  public resetView(bbox: BoundingBox): void {
    this.map.fitBounds(
      [
        [bbox.lamin, bbox.lomin],
        [bbox.lamax, bbox.lomax]
      ],
      { padding: [20, 20] }
    );
  }

  public invalidateSize(): void {
    this.map.invalidateSize();
  }
}

function escapeHtml(raw: string): string {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

