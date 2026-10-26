# Ege Hava Sahası Canlı

**Manisa Celal Bayar Üniversitesi — Büyük Veri Analistliği Programı**  
*(İlk Ara Kontrol ve Canlıya Çıkış Hazırlık Sürümü — Bulut Bilişim ve Siber Güvenlik Entegrasyonuna Hazır Altyapı)*

**Ege Hava Sahası Canlı**, Ege Denizi ve çevresindeki sivil hava trafiğini (`36.5°K–40.5°K`, `24.5°D–30.5°D`) **OpenSky Network** verileri üzerinden toplayan, normalleştiren ve koyu radar estetiğinde erişilebilirlik ilkelerini (WCAG AA kontrast ve klavye erişimi hedeflerini) gözeterek bir web arayüzünde görselleştiren bir gözlem ve analiz uygulamasıdır.

---

## İçindekiler

1. [Kurulum ve OAuth2 Kimlik Doğrulama Ayarları](#1-kurulum-ve-oauth2-kimlik-doğrulama-ayarları)
2. [Çalıştırma, Test ve Güvenlik Denetimi Komutları](#2-çalıştırma-test-ve-güvenlik-denetimi-komutları)
3. [Veri Kaynağı, Sınır Kutusu ve Saklama Süresi](#3-veri-kaynağı-sınır-kutusu-ve-saklama-süresi)
4. [Basit Mimari Şeması, `data` Dalı Stratejisi ve Canlı Yenileme](#4-basit-mimari-şeması-data-dalı-stratejisi-ve-canlı-yenileme)
5. [Cloudflare Pages Dağıtımı ve Güvenlik Başlıkları (CSP)](#5-cloudflare-pages-dağıtımı-ve-güvenlik-başlıkları-csp)
6. [Arayüz Özellikleri ve Erişilebilirlik](#6-arayüz-özellikleri-ve-erişilebilirlik)
7. [Harita ve Veri Atıfları (OpenStreetMap & OpenSky)](#7-harita-ve-veri-atıfları-openstreetmap--opensky)
8. [Lisans](#8-lisans)
9. [Yapay Zekâ Kullanım Beyanı](#9-yapay-zekâ-kullanım-beyanı)

---

## 1. Kurulum ve OAuth2 Kimlik Doğrulama Ayarları

Yerel geliştirme, CI ve üretim derlemesi için önerilen çalışma ortamı **Node.js 24** (`.nvmrc` içinde `24` olarak tanımlıdır; yerel ortamda Node.js `>=22.12.0` ile de uyumludur) ve **npm**'dir.

```bash
# Depoyu klonlayın
git clone https://github.com/Fylgja0/ege-hava-sahasi-canli.git
cd ege-hava-sahasi-canli

# (İsteğe bağlı) nvm kullanıyorsanız Node.js 24 sürümüne geçin
nvm use

# Bağımlılıkları kilit dosyasına sadık kalarak kurun
npm ci
```

### OpenSky OAuth2 (`client_credentials`) ve GitHub Secrets Yapılandırması

> **Güvenlik Notu:** Kaynak kod, JSON veri dosyaları, günlükler (log) veya istemci (frontend) derlemesi içerisinde hiçbir API anahtarı, istemci sırrı veya erişim belirteci (token) **bulunmamaktadır**.

`scripts/fetch-opensky.mjs` iki erişim modunu destekler:
1. **Anonim Erişim (Varsayılan):** Ortam değişkenleri tanımlı değilse doğrudan anonim `GET` isteği gönderilir.
2. **OAuth2 İstemci Kimlik Bilgileri (`OPENSKY_CLIENT_ID` ve `OPENSKY_CLIENT_SECRET`):** Bu iki ortam değişkeni tanımlıysa betik önce OpenSky resmi OpenID Connect token uç noktasına (`https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token`) `application/x-www-form-urlencoded` biçiminde `grant_type=client_credentials` ile `POST` isteği gönderir; dönen `access_token` değerini `/api/states/all` çağrısında `Authorization: Bearer <token>` başlığı olarak kullanır.

#### GitHub Actions İçin GitHub Secrets Tanımlama Adımları
GitHub Actions paylaşımlı IP adreslerinde anonim istek limitine (`HTTP 429`) takılmamak için kendi OpenSky OAuth2 istemci bilgilerinizi depoya güvenli biçimde ekleyebilirsiniz:

1. [OpenSky Network Hesap Paneli](https://opensky-network.org/) üzerinden hesabınıza giriş yapın ve **OAuth2 API Client** oluşturarak `client_id` ile `client_secret` bilgilerinizi alın.
2. GitHub deponuzun sayfasında üst menüden **Settings** sekmesine tıklayın.
3. Sol menüden **Secrets and variables** → **Actions** bölümüne gidin.
4. **New repository secret** düğmesine tıklayarak aşağıdaki iki gizli değişkeni ayrı ayrı ekleyin:
   - **Name:** `OPENSKY_CLIENT_ID` — **Secret:** *(OpenSky istemci kimliğiniz)*
   - **Name:** `OPENSKY_CLIENT_SECRET` — **Secret:** *(OpenSky istemci gizli anahtarınız)*
5. Bu değişkenler tanımlandığında `.github/workflows/fetch-opensky.yml` iş akışı otomatik olarak OAuth2 Bearer kimlik doğrulamasına geçer; tanımlanmadığında ise anonim modda çalışmaya devam eder.

---

## 2. Çalıştırma, Test ve Güvenlik Denetimi Komutları

```bash
# 1. Birim ve entegrasyon testlerini çalıştırın (Canlı API veya gizli anahtar gerektirmez)
npm test

# 2. Yüksek ve kritik bağımlılık güvenlik açıklarını denetleyin
npm audit --audit-level=high

# 3. OpenSky API'den Ege hava sahası verisini çekin ve normalleştirin
npm run data:fetch

# 4. Geliştirme sunucusunu başlatın (http://localhost:5173 - yerel ./data dosyalarını okur)
npm run dev

# 5. Tip kontrolü ve üretim (production) derlemesi alın (dist/ klasörünü üretir)
npm run build

# 6. Üretim derlemesini yerel olarak önizleyin
npm run preview
```

### Otomatik CI İş Akışı (`.github/workflows/ci.yml`)
- `main` dalına yapılan her `push` ve `main` hedefli her `pull_request` olayında otomatik çalışır.
- En az ayrıcalık ilkesiyle (`permissions: contents: read`) ve tam commit SHA ile sabitlenmiş `actions/checkout` (`v7.0.1`) ve `actions/setup-node` (`v7.1.0`, Node.js 24, `package-manager-cache: false`) adımlarını kullanır.
- Sırasıyla `npm ci`, `npm test`, `npm audit --audit-level=high` ve `npm run build` adımlarını gerçek OpenSky API'sine istek göndermeden ve hiçbir gizli anahtara (`secret`) ihtiyaç duymadan doğrular.

---

## 3. Veri Kaynağı, Sınır Kutusu ve Saklama Süresi

Uygulama, tarayıcıdan doğrudan dış API çağrısı **yapmaz**. Veriler `scripts/fetch-opensky.mjs` Node.js betiği aracılığıyla resmi OpenSky REST API uç noktasından çekilir:

- **Resmi Uç Nokta:** `https://opensky-network.org/api/states/all`
- **Ege Sınır Kutusu (Bounding Box):**
  - `lamin = 36.5` (Güney sınırı)
  - `lomin = 24.5` (Batı sınırı)
  - `lamax = 40.5` (Kuzey sınırı)
  - `lomax = 30.5` (Doğu sınırı)
- **Alan Hesabı ve Kota Uyumu:** $(40.5 - 36.5) \times (30.5 - 24.5) = 4^\circ \times 6^\circ = 24\text{ kare derece}$. Bu alan, OpenSky Network'ün $< 25\text{ kare derece}$ küçük alan kotasına (istek başına yalnızca 1 kredi tüketimi) tam uyumludur.
- **Snapshot Saklama Sınırı (7 Günlük Geçmiş):** Otomatik veri toplama sıklığı **30 dakika** (saatte 2 ölçüm, günde 48 ölçüm) olduğundan, 7 günlük zaman serisi geçmişini eksiksiz saklamak üzere `MAX_SNAPSHOTS = 336` ($7 \times 24 \times 2 = 336$ kayıt) olarak yapılandırılmıştır.

### Hata Yönetimi ve Veri Koruma İlkeleri
`scripts/fetch-opensky.mjs` aşağıdaki durumları açıkça yakalar ve sınıflandırır:
- `TIMEOUT`: İstek zaman aşımı (varsayılan 15 saniye).
- `HTTP_429`: İstek limiti aşımı (`Too Many Requests`).
- `EMPTY_RESPONSE`: Boş veya geçersiz `states` dizisi.
- `NETWORK_ERROR` / `HTTP_ERROR`: Bağlantı veya sunucu/kimlik doğrulama hataları.

**Veri Koruma ve Çıkış Kodu Garantisi:**
1. Herhangi bir hata durumunda daha önce kaydedilmiş son başarılı `latest.json` ve `snapshots.json` verileri **asla silinmez**, hata anında `snapshots.json` içerisine sahte canlı ölçüm eklenmez; yalnızca `lastAttempt` alanı hata detayı ile güncellenir.
2. Henüz diskte hiç gerçek veri yoksa ve canlı API çağrısı başarısız olursa, hata gizlenmez; arayüzün doğrulanabilmesi için üretilen yedek veri `isDemo: true` ve `source: "demo-fallback"` olarak işaretlenir, çağrı adlarına `[DEMO]` etiketi eklenir ve arayüzde açıkça **"DEMO VERİSİ AKTİF (Canlı Veri Değil)"** uyarısı gösterilir.
3. Veri dosyaları güvenle korunduktan sonra `npm run data:fetch` komutu **sıfır olmayan çıkış koduyla (`exit code 1`)** sonlanarak CI/CD izleme sistemlerine hatayı doğru biçimde bildirir.

---

## 4. Basit Mimari Şeması, `data` Dalı Stratejisi ve Canlı Yenileme

Sürüm kodunun bulunduğu korunan `main` dalının otomatik veri commit'leriyle kirlenmesini önlemek amacıyla **kod ve veri dalları birbirinden ayrılmıştır**:

```mermaid
flowchart LR
    A["OpenSky Network API\n/api/states/all\n(OAuth2 Bearer / Anonim)"] -->|1. HTTP GET| B["scripts/fetch-opensky.mjs\n(GitHub Actions / Yerel CLI)"]
    B -->|2. Normalleştirme & Hata Koruma| C["latest.json & snapshots.json\n(MAX_SNAPSHOTS = 336)"]
    C -->|3a. scripts/compare-data.mjs| D[("GitHub: data Dalı\n(Yalnızca Veri Dosyaları)")]
    C -->|3b. Yerel Dosya| E[("public/data/\n(Yerel Geliştirme / Yedek)")]
    D -->|4. HTTPS Raw Fetch\n(5 dk Otomatik Yenileme)| F["Vite + TypeScript Arayüzü\n(Cloudflare / GitHub Pages)"]
    E -->|4. Yerel / Yedek Okuma| F
    F --> G["3 KPI Kartı + Leaflet Radar Haritası\n+ Uçak Detay Paneli + Chart.js + Erişilebilir Tablo"]
```

### Arayüzün `data` Dalındaki Veriyi Okuma ve Yenileme Yöntemi
1. **Otomatik Veri Toplama (`.github/workflows/fetch-opensky.yml`):**
   - Her 30 dakikada bir (`cron: '*/30 * * * *'`) veya GitHub Actions sekmesinden **manuel (`workflow_dispatch`)** olarak tetiklenir.
   - `scripts/compare-data.mjs` yardımcısını kullanarak `refs/remotes/origin/data` dalındaki önceki dosyalarla yeni üretilen dosyaları karşılaştırır. Tekrarlayan API kesintilerinde yalnızca `lastAttempt.timestamp` / `lastAttempt.message` değişmişse her 30 dakikada bir gereksiz commit üretmez; gerçek veri (`fetchedAt`, `snapshots`) veya hata türü (`errorType`) değiştiğinde `data` dalını günceller.
2. **İstemci Veri Kaynağı Önceliği (`src/dataService.ts`):**
   - `VITE_DATA_BASE_URL` ortam değişkeni tanımlıysa önce bu adresi kullanır.
   - Tanımlı değilse üretim derlemesinde (`import.meta.env.PROD`) ve GitHub Pages üzerinde varsayılan olarak `https://raw.githubusercontent.com/Fylgja0/ege-hava-sahasi-canli/data/data` adresinden `latest.json` ve `snapshots.json` dosyalarını okur.
   - Yerel geliştirmede (`npm run dev`) doğrudan yerel `./data` dosyalarını okur.
   - Üretim ortamında uzak veri okunamazsa yerel paket yedeğine (`./data`) düşer; ancak bu durumda veriyi asla yeni/canlı gibi işaretlemez, `isStale = true` ve `Eski Veri (Yerel Yedek)` uyarısını aktif eder.
3. **Canlı Arayüz Otomatik Yenileme (`src/main.ts`):**
   - Arayüz açıkken her **5 dakikada bir** yayımlanmış JSON dosyalarını otomatik olarak yeniden okur.
   - Sekme arka plandayken (`document.visibilityState === 'hidden'`) gereksiz ağ isteği yapmaz; sekme tekrar görünür olduğunda (`visible`) veriyi yeniler.
   - Eşzamanlı yenileme isteklerini (`isRefreshing` kilidi ile) engeller. Arka plan yenilemesi başarısız olursa mevcut harita ve tablo verilerini silmeden korur ve kullanıcıya yenileme hatası bildirimi gösterir.

---

## 5. Cloudflare Pages Dağıtımı ve Güvenlik Başlıkları (CSP)

Uygulama Cloudflare Pages üzerinde statik site olarak yayınlanmaya hazırdır:

| Ayar | Değer |
| :--- | :--- |
| **Framework preset** | `Vite` (veya `None`) |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Node.js sürümü** | `24` (`NODE_VERSION = 24` veya `.nvmrc` üzerinden otomatik) |
| **`VITE_DATA_BASE_URL`** *(İsteğe bağlı)* | `https://raw.githubusercontent.com/Fylgja0/ege-hava-sahasi-canli/data/data` *(Boş bırakılsa da üretim derlemesinde varsayılan olarak bu adres kullanılır)* |

### Güvenlik Başlıkları (`public/_headers` → `dist/_headers`)
Vite derlemesi sırasında `public/_headers` dosyası otomatik olarak `dist/_headers` konumuna kopyalanır ve aşağıdaki başlıkları uygular:
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy: geolocation=(), camera=(), microphone=()`
- `Content-Security-Policy`:
  ```text
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.tile.openstreetmap.org; connect-src 'self' https://raw.githubusercontent.com; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'
  ```
  > **Neden `style-src` içinde `'unsafe-inline'` kullanılıyor?**
  > **Leaflet** harita kütüphanesi, harita karolarının konumlandırılması (`transform: translate3d(...)`) ve uçak işaretçilerinin yön açısına (`transform: rotate(...)`) göre döndürülmesi için DOM öğelerine çalışma zamanında satır içi (inline) CSS stilleri uygular. Bu nedenle `style-src` için `'unsafe-inline'` gereklidir. Buna karşın **`script-src` tamamen `'self'` ile sınırlandırılmıştır**; `unsafe-inline` veya `unsafe-eval` içermez.

---

## 6. Arayüz Özellikleri ve Erişilebilirlik

- **3 KPI Kartı:** Aktif uçak sayısı (havada/yerde), ortalama barometrik irtifa (`m` / `ft`) ve ortalama yer hızı (`km/h` / `knot` / `m/s`).
- **İnteraktif Ege Radar Haritası (Leaflet):** Sınır kutusu çerçevesi, uçuş yönüne göre dönen uçak simgeleri ve seçim vurgusu.
- **Seçili Uçak Detay Paneli:** Haritadan veya tablodan bir uçak seçildiğinde barometrik/jeodezik irtifa, yer hızı (`km/h`, `knot`, `m/s`), dikey hız (`m/s`), baş açısı, ülke ve son temas zamanını gösterir.
- **Saatlere Göre Uçuş Sayısı Grafiği (Chart.js):** `snapshots.json` üzerinden zaman serisi grafiği, ekran okuyucular için dinamik **metinsel özet** (tek ölçüm olduğunda uydurma geçmiş üretmeden yalnızca 1 ölçüm bulunduğunu açıkça belirten özet) ve **erişilebilir veri tablosu alternatifi** (`<table>`).
- **Erişilebilir Uçak Listesi/Tablosu:** Harita üzerindeki tüm uçakları arama/filtreleme desteği ve klavye ile odaklanabilir *"Detay & Odakla"* düğmeleriyle sunar.
- **Ayrı Durum Gösterimleri:** `Yükleniyor`, `Boş Sonuç`, `Hata (HTTP 429 / Zaman Aşımı / Ağ Hatası / Yenileme Hatası)`, `Eski Veri (>30 dk veya Yerel Yedek)` ve `Demo Verisi` durumları ayrı bildirim bantlarıyla gösterilir.
- **Erişilebilirlik Hedefi ve Yapılan Kontroller:** Arayüz tasarımında **WCAG 2.1 AA** kontrast oranları (koyu radar zemini `#060d14` / `#0b1622` üzerinde `#eef7f5` birincil metin ve `#2dd4bf` vurgu rengi), semantik bölgeler (`<header>`, `<main>`, `<section>`, `<footer>`), klavye ile içeriğe atlama bağlantısı (`.skip-link`), görünür `:focus-visible` odak halkaları ve grafik/harita için metinsel özet + veri tablosu alternatifleri uygulanmıştır. *(Not: Bağımsız bir resmi erişilebilirlik sertifikasyon denetimi gerçekleştirilmemiştir; bu özellikler hedeflenen WCAG AA tasarım ve geliştirme kontrollerini temsil eder.)*

---

## 7. Harita ve Veri Atıfları (OpenStreetMap & OpenSky)

- **Harita Katmanı (Zorunlu Atıf):** Harita karoları **OpenStreetMap** tarafından sağlanmaktadır.  
  © [OpenStreetMap](https://www.openstreetmap.org/copyright) katkıda bulunanları (ODbL lisansı altında sunulmaktadır).
- **Uçuş Verisi:** Hava trafiği durum vektörleri [The OpenSky Network](https://opensky-network.org) (`https://opensky-network.org/api/states/all`) tarafından sağlanmaktadır.  
  *Matthias Schäfer, Martin Strohmeier, Vincent Lenders, Ivan Martinovic and Matthias Wilhelm. "Bringing Up OpenSky: A Large-scale ADS-B Sensor Network for Research". In Proceedings of the 13th IEEE/ACM International Symposium on Information Processing in Sensor Networks (IPSN), April 2014.*

---

## 8. Lisans

Bu proje **MIT Lisansı** altında lisanslanmıştır. Ayrıntılar için `LICENSE` dosyasına bakınız. Harita verileri OpenStreetMap ODbL lisansına, uçuş verileri ise OpenSky Network kullanım koşullarına tabidir.

---

## 9. Yapay Zekâ Kullanım Beyanı

Bu projenin geliştirilmesinde ve canlıya çıkış öncesi teknik bakımında (`scripts/fetch-opensky.mjs` OAuth2 kimlik doğrulama ve hata koruma mantığı, `scripts/compare-data.mjs` veri karşılaştırma yardımcısı, `tests/` altındaki otomatik birim/entegrasyon testleri, Leaflet/Chart.js arayüz bileşenleri, otomatik arka plan yenilemesi, Cloudflare Pages CSP/`_headers` yapılandırması ve GitHub Actions iş akışları) yapay zekâ destekli kodlama asistanından yararlanılmıştır. Üretilen tüm kodlar, tip tanımları, güvenlik denetimleri ve derleme çıktıları yerel terminal testleriyle (`npm ci`, `npm test`, `npm audit`, `npm run build`) doğrulanmıştır.