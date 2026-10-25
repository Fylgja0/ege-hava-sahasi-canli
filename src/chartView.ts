import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend
} from 'chart.js';
import type { SnapshotEntry } from './types';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend
);

export class HourlyFlightsChart {
  private chart: Chart | null = null;
  private canvas: HTMLCanvasElement;

  constructor(canvasId: string) {
    const el = document.getElementById(canvasId);
    if (!(el instanceof HTMLCanvasElement)) {
      throw new Error(`Grafik canvas öğesi bulunamadı: #${canvasId}`);
    }
    this.canvas = el;
  }

  public render(
    snapshots: SnapshotEntry[],
    summaryEl: HTMLElement,
    tableBodyEl: HTMLElement
  ): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    if (!snapshots || snapshots.length === 0) {
      summaryEl.textContent =
        'Grafik Özeti: Henüz saatlik uçuş geçmişi (snapshots.json) kaydı bulunmamaktadır.';
      tableBodyEl.innerHTML = `
        <tr>
          <td colspan="5" class="empty-cell">Saatlik kayıt bulunamadı.</td>
        </tr>
      `;
      return;
    }

    const labels = snapshots.map((s) => formatHourLabel(s.timestamp));
    const totalCounts = snapshots.map((s) => s.aircraftCount);
    const airborneCounts = snapshots.map((s) => s.airborneCount ?? s.aircraftCount);

    // Metinsel özeti hesapla
    const counts = totalCounts;
    const minCount = Math.min(...counts);
    const maxCount = Math.max(...counts);
    const avgCount = Math.round(counts.reduce((acc, v) => acc + v, 0) / counts.length);
    const maxIndex = counts.indexOf(maxCount);
    const peakTime = formatFullDateTime(snapshots[maxIndex].timestamp);
    const latestEntry = snapshots[snapshots.length - 1];
    const isDemoSeries = snapshots.some((s) => s.isDemo);
    const isSingleSnapshot = snapshots.length === 1;

    if (isSingleSnapshot) {
      const singleAlt = latestEntry.avgAltitudeM
        ? `${Number(latestEntry.avgAltitudeM).toLocaleString('tr-TR')} m`
        : '0 m';
      const singleSpd = latestEntry.avgVelocityKmh
        ? `${Number(latestEntry.avgVelocityKmh).toLocaleString('tr-TR')} km/h`
        : '0 km/h';

      summaryEl.textContent =
        `Grafik Metinsel Özeti (Tek Ölçüm): snapshots.json dosyasında henüz yalnızca 1 adet zaman damgalı ölçüm (${formatFullDateTime(
          latestEntry.timestamp
        )}) bulunmaktadır; geçmişe dönük yapay veri üretilmemiştir. ` +
        `Bu tek ölçümde Ege hava sahasında toplam ${latestEntry.aircraftCount} uçak (${
          latestEntry.airborneCount ?? latestEntry.aircraftCount
        } havada), ortalama ${singleAlt} irtifa ve ortalama ${singleSpd} yer hızı kaydedilmiştir. ` +
        `Yeni veri çekimleri eklendikçe saatlik zaman serisi eğrisi oluşacaktır.` +
        (isDemoSeries
          ? ' Not: Bu kayıt açıkça DEMO olarak etiketlenmiş yedek veridir, canlı ölçüm değildir.'
          : '');
    } else {
      summaryEl.textContent =
        `Grafik Metinsel Özeti: Toplam ${snapshots.length} zaman damgalı ölçüm incelenmiştir. ` +
        `Ege hava sahasında saatlik/anlık uçak sayısı en düşük ${minCount}, en yüksek ${maxCount} (${peakTime}) ` +
        `ve ortalama ${avgCount} uçak olarak kaydedilmiştir. Son ölçümde (${formatFullDateTime(
          latestEntry.timestamp
        )}) toplam ${latestEntry.aircraftCount} uçak (${latestEntry.airborneCount} havada) yer almaktadır.` +
        (isDemoSeries
          ? ' Not: Bu zaman serisi açıkça DEMO olarak etiketlenmiş yedek kayıtları içermektedir.'
          : '');
    }

    this.canvas.setAttribute('aria-label', summaryEl.textContent);

    // Tablo alternatifini doldur (en yeniden en eskiye)
    const reversed = [...snapshots].reverse();
    tableBodyEl.innerHTML = reversed
      .map((s) => {
        const modeBadge = s.isDemo ? 'DEMO' : 'Canlı (OpenSky)';
        const safeTime = escapeHtml(formatFullDateTime(s.timestamp));
        const safeTotal = Number(s.aircraftCount);
        const safeAirborne = Number(s.airborneCount ?? s.aircraftCount);
        const safeAlt = s.avgAltitudeM
          ? `${Number(s.avgAltitudeM).toLocaleString('tr-TR')} m`
          : '-';
        const safeSpeed = s.avgVelocityKmh
          ? `${Number(s.avgVelocityKmh).toLocaleString('tr-TR')} km/h`
          : '-';
        return `
          <tr>
            <th scope="row">${safeTime}</th>
            <td><strong>${safeTotal}</strong></td>
            <td>${safeAirborne}</td>
            <td>${escapeHtml(safeAlt)}</td>
            <td>${escapeHtml(safeSpeed)} (${escapeHtml(modeBadge)})</td>
          </tr>
        `;
      })
      .join('');

    this.chart = new Chart(this.canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: isSingleSnapshot
              ? 'Toplam Uçak Sayısı (Tek Ölçüm Noktası)'
              : 'Toplam Uçak Sayısı',
            data: totalCounts,
            borderColor: '#2dd4bf',
            backgroundColor: 'rgba(45, 212, 191, 0.16)',
            borderWidth: 2.5,
            pointBackgroundColor: '#2dd4bf',
            pointBorderColor: '#060d14',
            pointBorderWidth: 2,
            pointRadius: isSingleSnapshot ? 7 : 4,
            pointHoverRadius: isSingleSnapshot ? 9 : 6,
            fill: !isSingleSnapshot,
            tension: 0.25
          },
          {
            label: isSingleSnapshot
              ? 'Havadaki Uçak Sayısı (Tek Ölçüm Noktası)'
              : 'Havadaki Uçak Sayısı',
            data: airborneCounts,
            borderColor: '#99f6e4',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointBackgroundColor: '#99f6e4',
            pointRadius: isSingleSnapshot ? 5 : 3,
            pointHoverRadius: isSingleSnapshot ? 7 : 5,
            fill: false,
            tension: 0.25
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            labels: {
              color: '#eef7f5',
              font: {
                family: 'system-ui, -apple-system, sans-serif',
                size: 12
              }
            }
          },
          tooltip: {
            backgroundColor: '#0b1622',
            titleColor: '#eef7f5',
            bodyColor: '#eef7f5',
            borderColor: '#2dd4bf',
            borderWidth: 1
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#a3c2bb',
              maxRotation: 45,
              minRotation: 0
            },
            grid: {
              color: 'rgba(45, 212, 191, 0.08)'
            },
            title: {
              display: isSingleSnapshot,
              text: 'Tek Ölçüm Zaman Damgası (Yeni çekimlerle zaman serisi oluşur)',
              color: '#a3c2bb'
            }
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: '#a3c2bb',
              precision: 0
            },
            grid: {
              color: 'rgba(45, 212, 191, 0.12)'
            },
            title: {
              display: true,
              text: 'Uçak Sayısı',
              color: '#eef7f5'
            }
          }
        }
      }
    });
  }
}

function formatHourLabel(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatFullDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(raw: string): string {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

