# Ege Hava Sahası Canlı

**Manisa Celal Bayar Üniversitesi — Büyük Veri Analistliği Programı**  
*(İlk Ara Kontrol Temel Sürümü — Bulut Bilişim ve Siber Güvenlik Entegrasyonuna Hazır Altyapı)*

**Ege Hava Sahası Canlı**, Ege Denizi ve çevresindeki sivil hava trafiğini (`36.5°K–40.5°K`, `24.5°D–30.5°D`) **OpenSky Network** verileri üzerinden toplayan, normalleştiren ve koyu radar estetiğinde erişilebilir (WCAG AA uyumlu) bir web arayüzünde görselleştiren bir gözlem ve analiz uygulamasıdır.

---

## İçindekiler

1. [Kurulum](#1-kurulum)
2. [Çalıştırma](#2-çalıştırma)
3. [Veri Kaynağı ve Sınır Kutusu](#3-veri-kaynağı-ve-sınır-kutusu)
4. [Basit Mimari Şeması ve `data` Dalı Stratejisi](#4-basit-mimari-şeması-ve-data-dalı-stratejisi)
5. [Arayüz Özellikleri ve Erişilebilirlik](#5-arayüz-özellikleri-ve-erişilebilirlik)
6. [Harita ve Veri Atıfları (OpenStreetMap & OpenSky)](#6-harita-ve-veri-atıfları-openstreetmap--opensky)
7. [Lisans](#7-lisans)
8. [Yapay Zekâ Kullanım Beyanı](#8-yapay-zekâ-kullanım-beyanı)

---

## 1. Kurulum

Projeyi yerel ortamınızda kurmak için **Node.js (v20 veya v22+)** ve **npm** gereklidir.

```bash
# Depoyu klonlayın
git clone https://github.com/Fylgja0/ege-hava-sahasi-canli.git
cd ege-hava-sahasi-canli

# Bağımlılıkları yükleyin
npm install
```

> **Güvenlik Notu:** Kaynak kod içerisinde hiçbir API anahtarı, token veya şifre bulunmamaktadır. Veri toplama betiği önce **anonim erişimi** dener. İsteğe bağlı kimlik doğrulaması yalnızca ortam değişkenleri (`OPENSKY_USERNAME`, `OPENSKY_PASSWORD`) veya GitHub Actions Secrets üzerinden okunur.

---

## 2. Çalıştırma

```bash
# 1. OpenSky API'den Ege hava sahası verisini çekin ve normalleştirin
npm run data:fetch

# 2. Geliştirme sunucusunu başlatın (http://localhost:5173)
npm run dev

# 3. Tip kontrolü ve üretim (production) derlemesi alın
npm run build

# 4. Üretim derlemesini yerel olarak önizleyin
npm run preview
```

---

## 3. Veri Kaynağı ve Sınır Kutusu

Uygulama, tarayıcıdan doğrudan dış API çağrısı **yapmaz**. Veriler `scripts/fetch-opensky.mjs` Node.js betiği aracılığıyla resmi OpenSky REST API uç noktasından çekilir:

- **Resmi Uç Nokta:** `https://opensky-network.org/api/states/all`
- **Ege Sınır Kutusu (Bounding Box):**
  - `lamin = 36.5` (Güney sınırı)
  - `lomin = 24.5` (Batı sınırı)
  - `lamax = 40.5` (Kuzey sınırı)
  - `lomax = 30.5` (Doğu sınırı)
- **Alan Hesabı ve Kota Uyumu:** $(40.5 - 36.5) \times (30.5 - 24.5) = 4^\circ \times 6^\circ = 24\text{ kare derece}$. Bu alan, OpenSky Network'ün $< 25\text{ kare derece}$ küçük alan kotasına (istek başına yalnızca 1 kredi tüketimi) tam uyumludur.

### Hata Yönetimi ve Veri Koruma İlkeleri
`scripts/fetch-opensky.mjs` aşağıdaki durumları açıkça yakalar ve sınıflandırır:
- `TIMEOUT`: İstek zaman aşımı (varsayılan 15 saniye).
- `HTTP_429`: İstek limiti aşımı (`Too Many Requests`).
- `EMPTY_RESPONSE`: Boş veya geçersiz `states` dizisi.
- `NETWORK_ERROR` / `HTTP_ERROR`: Bağlantı veya sunucu hataları.

**Veri Koruma Garantisi:**
1. Herhangi bir hata durumunda daha önce kaydedilmiş son başarılı `latest.json` verisi **asla silinmez**; yalnızca `lastAttempt` alanı hata detayı ile güncellenir.
2. Henüz diskte hiç gerçek veri yoksa ve canlı API çağrısı başarısız olursa, hata gizlenmez; arayüzün doğrulanabilmesi için üretilen yedek veri `isDemo: true` ve `source: "demo-fallback"` olarak işaretlenir, çağrı adlarına `[DEMO]` etiketi eklenir ve arayüzde açıkça **"DEMO VERİSİ AKTİF (Canlı Veri Değil)"** uyarısı gösterilir.

---

## 4. Basit Mimari Şeması ve `data` Dalı Stratejisi

Sürüm kodunun bulunduğu korunan `main` dalının otomatik veri commit'leriyle kirlenmesini önlemek amacıyla **kod ve veri dalları birbirinden ayrılmıştır**:

```mermaid
flowchart LR
    A["OpenSky Network API\n/api/states/all\n(36.5-40.5K, 24.5-30.5D)"] -->|1. Anonim HTTP GET| B["scripts/fetch-opensky.mjs\n(GitHub Actions / Yerel CLI)"]
    B -->|2. Normalleştirme & Hata Koruma| C["latest.json & snapshots.json"]
    C -->|3a. Otomatik Push| D[("GitHub: data Dalı\n(Yalnızca Veri Dosyaları)")]
    C -->|3b. Yerel Dosya| E[("public/data/\n(Yerel Geliştirme)")]
    D -->|4. HTTPS Raw Fetch| F["Vite + TypeScript Arayüzü\n(main Dalından Derlenen İstemci)"]
    E -->|4. Yerel Okuma| F
    F --> G["3 KPI Kartı + Leaflet Radar Haritası\n+ Uçak Detay Paneli + Chart.js + Erişilebilir Tablo"]
```

### Arayüzün `data` Dalındaki Veriyi Okuma Yöntemi
1. **Otomatik Veri Toplama (`.github/workflows/fetch-opensky.yml`):**
   - Her 30 dakikada bir (`cron: '*/30 * * * *'`) veya GitHub Actions sekmesinden **manuel (`workflow_dispatch`)** olarak tetiklenir.
   - Uygulama kodunu `main` dalından alır, varsa `origin/data` dalındaki geçmiş `latest.json` ve `snapshots.json` dosyalarını geri yükler, `npm run data:fetch` çalıştırır ve oluşan JSON dosyalarını **`main` dalına dokunmadan yalnızca `data` dalına** (`origin/data`) yazar.
2. **İstemci (Tarayıcı) Veri Okuma (`src/dataService.ts`):**
   - İstemci, `VITE_DATA_BASE_URL` ortam değişkeni tanımlıysa veya GitHub Pages (`*.github.io`) üzerinde çalışıyorsa doğrudan `data` dalındaki ham JSON adresinden (`https://raw.githubusercontent.com/Fylgja0/ege-hava-sahasi-canli/data/data/latest.json` ve `snapshots.json`) veriyi okur.
   - Yerel geliştirmede (`npm run dev` / `npm run preview`) veya uzak dala henüz erişilemediğinde otomatik olarak yerel `./data/latest.json` ve `./data/snapshots.json` dosyalarını okur.

---

## 5. Arayüz Özellikleri ve Erişilebilirlik

- **3 KPI Kartı:** Aktif uçak sayısı (havada/yerde), ortalama barometrik irtifa (`m` / `ft`) ve ortalama yer hızı (`km/h` / `knot` / `m/s`).
- **İnteraktif Ege Radar Haritası (Leaflet):** Sınır kutusu çerçevesi, uçuş yönüne göre dönen uçak simgeleri ve seçim vurgusu.
- **Seçili Uçak Detay Paneli:** Haritadan veya tablodan bir uçak seçildiğinde barometrik/jeodezik irtifa, yer hızı (`km/h`, `knot`, `m/s`), dikey hız (`m/s`), baş açısı, ülke ve son temas zamanını gösterir.
- **Saatlere Göre Uçuş Sayısı Grafiği (Chart.js):** `snapshots.json` üzerinden zaman serisi grafiği, ekran okuyucular için dinamik **metinsel özet** (tek ölçüm olduğunda uydurma geçmiş üretmeden yalnızca 1 ölçüm bulunduğunu açıkça belirten özet) ve **erişilebilir veri tablosu alternatifi** (`<table>`).
- **Erişilebilir Uçak Listesi/Tablosu:** Harita üzerindeki tüm uçakları arama/filtreleme desteği ve klavye ile odaklanabilir *"Detay & Odakla"* düğmeleriyle sunar.
- **Ayrı Durum Gösterimleri:** `Yükleniyor`, `Boş Sonuç`, `Hata (HTTP 429 / Zaman Aşımı / Ağ Hatası)`, `Eski Veri (>30 dk)` ve `Demo Verisi` durumları ayrı bildirim bantlarıyla gösterilir ve üst araç çubuğundan test edilebilir.
- **Duyarlı ve Erişilebilir Tasarım:** Koyu radar estetiği, tek vurgu rengi (`#2dd4bf`), WCAG AA kontrast uyumu, görünür `:focus-visible` klavye odağı, `360px` mobil ve `1440px` masaüstü ekran desteği.

---

## 6. Harita ve Veri Atıfları (OpenStreetMap & OpenSky)

- **Harita Katmanı (Zorunlu Atıf):** Harita karoları **OpenStreetMap** tarafından sağlanmaktadır.  
  © [OpenStreetMap](https://www.openstreetmap.org/copyright) katkıda bulunanları (ODbL lisansı altında sunulmaktadır).
- **Uçuş Verisi:** Hava trafiği durum vektörleri [The OpenSky Network](https://opensky-network.org) (`https://opensky-network.org/api/states/all`) tarafından sağlanmaktadır.  
  *Matthias Schäfer, Martin Strohmeier, Vincent Lenders, Ivan Martinovic and Matthias Wilhelm. "Bringing Up OpenSky: A Large-scale ADS-B Sensor Network for Research". In Proceedings of the 13th IEEE/ACM International Symposium on Information Processing in Sensor Networks (IPSN), April 2014.*

---

## 7. Lisans

Bu proje **MIT Lisansı** altında lisanslanmıştır. Ayrıntılar için `LICENSE` dosyasına bakınız. Harita verileri OpenStreetMap ODbL lisansına, uçuş verileri ise OpenSky Network kullanım koşullarına tabidir.

---

## 8. Yapay Zekâ Kullanım Beyanı

Bu projenin ilk ara kontrol temel sürümünün geliştirilmesinde (proje iskeletinin oluşturulması, `scripts/fetch-opensky.mjs` veri normalleştirme ve hata koruma mantığının yazılması, Leaflet harita ve Chart.js grafik bileşenlerinin erişilebilir tablo alternatifleriyle yapılandırılması ve GitHub Actions `data` dalı iş akışının tasarlanması) yapay zekâ destekli kodlama asistanından yararlanılmıştır. Üretilen tüm kodlar, tip tanımları ve derleme çıktıları yerel terminal testleriyle (`npm run data:fetch`, `npm run build`) doğrulanmıştır.