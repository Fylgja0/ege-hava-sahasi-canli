# Veri Akış Diyagramı (DFD) ve STRIDE Tehdit Modeli

**Proje:** Ege Hava Sahası Canlı (`ege-hava-sahasi-canli`)
**Kapsam:** *BVA 2245 Kullanıcı Arayüzü Tasarımı* ve *Bulut Bilişim ve Siber Güvenlik* Ders Projesi Final Sürümü
**Depo:** `https://github.com/Fylgja0/ege-hava-sahasi-canli`
**Canlı Dağıtım:** `https://ege-hava-sahasi-canli.pages.dev/`

> **Doğruluk ve Dürüstlük Notu:** Bu belge yalnızca depodaki gerçek kaynak koduna ([`scripts/fetch-opensky.mjs`](../scripts/fetch-opensky.mjs), [`scripts/compare-data.mjs`](../scripts/compare-data.mjs), [`.github/workflows/fetch-opensky.yml`](../.github/workflows/fetch-opensky.yml), [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), [`.github/dependabot.yml`](../.github/dependabot.yml), [`src/dataService.ts`](../src/dataService.ts), [`src/mapView.ts`](../src/mapView.ts), [`src/main.ts`](../src/main.ts), [`public/_headers`](../public/_headers), [`public/.well-known/security.txt`](../public/.well-known/security.txt)) dayanmaktadır. Kaynak kodda veya canlı ortamda gerçekten bulunmayan hiçbir kontrol (örneğin özel WAF, rate-limit, User-Agent engelleme veya özel önbellek kuralı) uygulanmış gibi gösterilmemiştir.

---

## 1. Veri Akış Diyagramı (DFD) ve Güven Sınırları (Trust Boundaries)

Uygulama mimarisinde istemci (tarayıcı) ile dış veri sağlayıcısı (OpenSky Network API) birbirinden tamamen ayrılmıştır. Tarayıcı doğrudan OpenSky API'sine istek göndermez; yalnızca zamanlanmış arka plan iş akışının (`fetch-opensky.yml`) `data` dalına yayımladığı statik JSON dosyalarını (`raw.githubusercontent.com` üzerinden) okur.

```mermaid
flowchart TB
    subgraph TB1["Güven Sınırı 1: Dış Veri ve Harita Sağlayıcıları (Üçüncü Taraf)"]
        OIDC["OpenSky OAuth2 Token Sunucusu\n(auth.opensky-network.org)\nPOST /protocol/openid-connect/token"]
        OSKY["OpenSky REST API\n(opensky-network.org)\nGET /api/states/all\n(36.5–40.5K, 24.5–30.5D)"]
        OSM["OpenStreetMap Karo Sunucuları\n(*.tile.openstreetmap.org)\nHTTPS GET (PNG Karoları)"]
    end

    subgraph TB2["Güven Sınırı 2: GitHub Actions & GitHub Depo Altyapısı"]
        SEC[("GitHub Actions Secrets\nOPENSKY_CLIENT_ID\nOPENSKY_CLIENT_SECRET")]
        GHA["GitHub Actions: fetch-opensky.yml\n(Cron: */30 * * * * / Manuel)\nscripts/fetch-opensky.mjs\nscripts/compare-data.mjs"]
        DATABR[("GitHub: data Dalı\ndata/latest.json\ndata/snapshots.json\n(MAX_SNAPSHOTS = 336)")]
        RAW["GitHub Raw CDN\n(raw.githubusercontent.com)\nHerkese Açık HTTPS GET"]
    end

    subgraph TB3["Güven Sınırı 3: Cloudflare Pages Edge & Statik Dağıtım"]
        CFP["Cloudflare Pages\n(ege-hava-sahasi-canli.pages.dev)\ndist/ Statik Varlıklar + _headers\n(CSP, HSTS, XFO, nosniff)"]
    end

    subgraph TB4["Güven Sınırı 4: Kullanıcı Tarayıcısı (İstemci Çalışma Zamanı)"]
        SPA["Vite + TypeScript Arayüzü\n(src/dataService.ts, src/main.ts)\n5 dk Otomatik Yenileme\nLeaflet + Chart.js + Erişilebilir Tablo"]
    end

    SEC -.->|"1. Yalnızca Çalışma Zamanı Ortam Değişkeni"| GHA
    GHA -->|"2. HTTPS POST (client_credentials)"| OIDC
    OIDC -->|"3. Geçici Bearer access_token (Bellekte)"| GHA
    GHA -->|"4. HTTPS GET (Authorization: Bearer)"| OSKY
    OSKY -->|"5. Ham Durum Vektörleri (JSON)"| GHA
    GHA -->|"6. Normalleştirme, Hata Koruma ve Karşılaştırma"| DATABR
    DATABR -->|"7. Statik Dosya Sunumu"| RAW
    CFP -->|"8. HTML/CSS/JS + Güvenlik Başlıkları"| SPA
    RAW -->|"9. HTTPS GET (latest.json, snapshots.json)"| SPA
    OSM -->|"10. HTTPS GET (Harita Karoları)"| SPA
```

---

## 2. Varlık Envanteri ve Güven Sınırları

| Varlık Kodu | Varlık / Bileşen | Güven Sınırı | Açıklama ve Kritiklik |
| :--- | :--- | :--- | :--- |
| **A1** | OpenSky OAuth2 İstemci Sırları (`OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`) ve `access_token` | `TB2` ↔ `TB1` | GitHub Actions Secrets içinde saklanır ve yalnızca çalışma zamanında bellekte kullanılır. **Kritiklik: Çok Yüksek (Gizlilik).** |
| **A2** | Veri Toplama, Karşılaştırma ve CI Betikleri (`scripts/*.mjs`, `.github/workflows/*.yml`) | `TB2` | Veriyi çeken, doğrulayan, `data` dalına yayımlayan ve kod güvenliğini denetleyen otomasyon katmanı. **Kritiklik: Yüksek (Bütünlük).** |
| **A3** | Yayımlanan Uçuş Verisi (`data/latest.json`, `data/snapshots.json`) ve `raw.githubusercontent.com` | `TB2` ↔ `TB4` | `data` dalında tutulan ve istemciler tarafından herkese açık okunan zaman damgalı JSON dosyaları. **Kritiklik: Yüksek (Bütünlük & Erişilebilirlik).** |
| **A4** | Cloudflare Pages Statik Dağıtımı (`ege-hava-sahasi-canli.pages.dev`, `dist/`, `_headers`, `security.txt`) | `TB3` ↔ `TB4` | İstemciye sunulan HTML/CSS/JS paketi ve HTTP güvenlik başlıkları. **Kritiklik: Yüksek (Bütünlük & Erişilebilirlik).** |
| **A5** | İstemci Tarayıcı DOM, Leaflet Haritası ve Chart.js Görselleştirme Katmanı (`src/*.ts`) | `TB4` ↔ `TB1` | Kullanıcının tarayıcısında çalışan arayüz ve OpenStreetMap karo istekleri. **Kritiklik: Orta–Yüksek (Güvenlik & Kullanılabilirlik).** |

---

## 3. Risk Puanlama Metodolojisi ve Sınıflandırma Eşikleri

> **Önemli Metodolojik Not:** Bu belgedeki **Olasılık (`O`)**, **Etki (`E`)** ve **Risk Skoru (`R = O × E`)** değerleri geçmiş siber olay istatistiklerinden veya canlı üretim telemetrisinden **ölçülmüş kesin gerçekler değildir**; sistemin mevcut mimarisine, kod kontrollerine ve bulut barındırma kısıtlarına dayanan **gerekçelendirilmiş nitel/yarı-nicel mühendislik tahminleridir**.

### 3.1. Olasılık (`1–5`) ve Etki (`1–5`) Ölçeği

| Puan | Olasılık (`O`) Tanımı | Etki (`E`) Tanımı |
| :---: | :--- | :--- |
| **1** | **Çok Düşük:** Saldırı yolu mimari olarak kapalı veya son derece zor. | **Çok Düşük:** Yalnızca kozmetik etki; veri veya hizmet kaybı yok. |
| **2** | **Düşük:** Otomatik kontroller mevcut; yalnızca istisnai/manuel hata ile gerçekleşebilir. | **Düşük:** Kısa süreli gecikme veya ikincil uyarı; son başarılı veri korunur. |
| **3** | **Orta:** Dış bağımlılık veya kısmi yapılandırma eksikliği nedeniyle makul olasılık. | **Orta:** Hizmet kalitesinde düşüş, bayat veri gösterimi veya CI/CD kesintisi. |
| **4** | **Yüksek:** Herkese açık uç nokta üzerinde korumasız/sınırsız erişim mevcut. | **Yüksek:** Veri bütünlüğünün bozulması, istemci tarafında kod çalışması veya kota tükenmesi. |
| **5** | **Çok Yüksek:** Basit bir betikle veya sıradan ağ koşullarında kolayca tetiklenebilir. | **Çok Yüksek:** Gizli kimlik bilgilerinin (`client_secret`) ifşası veya репозиtorinin ele geçirilmesi. |

### 3.2. Risk Skoru (`Olasılık × Etki = 1–25`) Sınıflandırma Eşikleri

- **Düşük Risk (`1 – 5`):** Mevcut kod ve mimari kontroller tehdidi kabul edilebilir seviyeye indirmiştir; rutin izleme yeterlidir.
- **Orta Risk (`6 – 12`):** Temel azaltıcı kontroller devrededir ancak dış bağımlılık, bulut platformu kısıtı veya manuel hesap ayarı nedeniyle izlenmesi ve ek kontrolle desteklenmesi gereken risk mevcuttur.
- **Yüksek Risk (`13 – 25`):** Gizli bilgi ifşası, kod bütünlüğü ihlali veya hizmet kesintisi yaratabilecek öncelikli tehdit; derhal teknik kontrol veya mimari izolasyon gerektirir.

---

## 4. Kapsamlı STRIDE Risk Tablosu (10 Ayrı Tehdit Senaryosu)

Aşağıdaki tabloda tüm STRIDE kategorilerini (**S**poofing, **T**ampering, **R**epudiation, **I**nformation Disclosure, **D**enial of Service, **E**levation of Privilege) kapsayan ve farklı saldırı yollarını ayrı ayrı ele alan **10 tehdit senaryosu (`T-01` – `T-10`)** değerlendirilmiştir:

| Tehdit ID, STRIDE ve Senaryo | Etkilenen Varlık | İlk Olasılık (1–5) | İlk Etki (1–5) | İlk Risk Skoru (`O×E`) | Mevcut ve Gerçekten Uygulanmış Kontroller | Önerilen Ek Kontroller | Kalan Olasılık (1–5) | Kalan Etki (1–5) | Kalan Risk Skoru (`O×E`) | Kontrolün Durumu ve Kanıtı |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| **T-01 [S — Spoofing]**<br>OpenSky OAuth2 token alma veya veri çekme aşamasında kimlik doğrulama akışının bozulması / sahte uç nokta taklidi | **A1, A2** (`scripts/fetch-opensky.mjs`, OpenSky OAuth2 & REST API) | 3 | 4 | **12 (Orta)** | • Eski Basic Auth tamamen kaldırıldı; resmi HTTPS OpenID Connect uç noktası (`auth.opensky-network.org`) üzerinden `grant_type=client_credentials` uygulandı.<br>• Kimlik bilgileri tanımlı değilse şeffaf biçimde anonim moda düşülür; sahte token üretilmez. | • OpenSky OAuth2 istemci sırlarının belirli periyotlarla (örn. 90 günde bir) GitHub Secrets üzerinde manuel döndürülmesi (rotation). | 1 | 4 | **4 (Düşük)** | **Uygulandı (Kod + Test)**<br>Kanıt: [`scripts/fetch-opensky.mjs`](../scripts/fetch-opensky.mjs), [`tests/fetch-opensky.test.mjs`](../tests/fetch-opensky.test.mjs) |
| **T-02 [S / T — Spoofing & Tampering]**<br>Üçüncü taraf GitHub Actions etiketlerinin (`@v4` vb.) veya `npm` paketlerinin tedarik zinciri saldırısıyla değiştirilmesi | **A2, A4** (`.github/workflows/*.yml`, `package-lock.json`) | 3 | 5 | **15 (Yüksek)** | • `ci.yml` ve `fetch-opensky.yml` içindeki tüm dış eylemler (`actions/checkout`, `actions/setup-node`, `gitleaks/gitleaks-action`) tam 40 karakterlik commit SHA ile sabitlendi.<br>• Kurulumlar `npm ci` ile kilit dosyasına sadık yapılır ve her CI çalışmasında `npm audit --audit-level=high` koşar.<br>• `.github/dependabot.yml` haftalık `npm` ve `github-actions` taraması yapar. | • GitHub depo ayarlarından Dependabot güvenlik uyarılarının ve `main` dalı Branch Protection kurallarının aktif tutulması. | 1 | 5 | **5 (Düşük)** | **Uygulandı (Kod + CI)**<br>Kanıt: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), [`.github/workflows/fetch-opensky.yml`](../.github/workflows/fetch-opensky.yml), [`.github/dependabot.yml`](../.github/dependabot.yml), [`tests/security-config.test.mjs`](../tests/security-config.test.mjs) |
| **T-03 [T — Tampering / DOM XSS]**<br>Dış OpenSky yanıtındaki veya JSON dosyasındaki `callsign`, `originCountry`, `icao24` alanları üzerinden istemci DOM'una zararlı HTML/JS enjekte edilmesi | **A4, A5** (`src/mapView.ts`, `src/main.ts`, `public/_headers`) | 3 | 4 | **12 (Orta)** | • `src/mapView.ts` içinde dış veriler `escapeHtml()` fonksiyonundan geçirilerek popup şablonuna eklenir.<br>• `src/main.ts` tablo ve detay panelinde `innerHTML` yerine güvenli DOM API'leri (`document.createElement`, `textContent`) kullanılır.<br>• `public/_headers` içinde `script-src 'self'; object-src 'none'` ile inline JS çalışması engellenir. | • Dağıtım sonrasında canlı URL üzerinde OWASP ZAP Baseline ve CSP başlık doğrulamasının kanıt klasörüne kaydedilmesi. | 1 | 3 | **3 (Düşük)** | **Uygulandı (Kod)** / **Canlı Dağıtım Bekliyor (HSTS Güncellemesi)**<br>Kanıt: [`src/mapView.ts`](../src/mapView.ts), [`src/main.ts`](../src/main.ts), [`public/_headers`](../public/_headers) |
| **T-04 [T — Tampering / Veri Bütünlüğü]**<br>API hatasında veya boş yanıtta son başarılı uçuş verisinin (`latest.json`, `snapshots.json`) ezilmesi, sahte canlı ölçüm eklenmesi veya `main` dalının bozulması | **A2, A3** (`scripts/fetch-opensky.mjs`, `fetch-opensky.yml`, `data` dalı) | 4 | 4 | **16 (Yüksek)** | • Hata anında mevcut son başarılı `latest.json` ve `snapshots.json` korunur; `snapshots.json` listesine hata anında sahte canlı ölçüm eklenmez.<br>• İlk kurulumda veri yoksa üretilen yedek veri açıkça `isDemo: true`, `source: "demo-fallback"` ve `[DEMO]` olarak etiketlenir.<br>• Otomatik veri commit'leri `main` dalına değil, izole `data` dalına yazılır. | • GitHub Settings üzerinden `main` dalına doğrudan push işlemini engelleyen Branch Protection kuralının etkinleştirilmesi. | 1 | 3 | **3 (Düşük)** | **Uygulandı (Kod + Test)**<br>Kanıt: [`scripts/fetch-opensky.mjs`](../scripts/fetch-opensky.mjs), [`.github/workflows/fetch-opensky.yml`](../.github/workflows/fetch-opensky.yml), [`tests/fetch-opensky.test.mjs`](../tests/fetch-opensky.test.mjs) |
| **T-05 [R — Repudiation]**<br>Veri çekim hatalarının izlenememesi veya tekrarlayan kesintilerde her 30 dakikada bir anlamsız commit'lerle `data` dalı geçmişinin kirlenmesi | **A2, A3** (`scripts/fetch-opensky.mjs`, `scripts/compare-data.mjs`) | 4 | 3 | **12 (Orta)** | • Her çekim denemesi `lastAttempt` (`timestamp`, `status`, `httpStatus`, `errorType`, `message`) alanına kaydedilir ve başarısız çekimde betik `exit code 1` döndürür.<br>• `scripts/compare-data.mjs`, `git show refs/remotes/origin/data:...` ile alınan eski veriyi karşılaştırır; yalnızca `lastAttempt.timestamp` ve `lastAttempt.message` değişmişse gereksiz commit üretmez. | • GitHub Actions bildirimlerinin (e-posta/webhook) ardışık iş akışı hataları için depo sahibi tarafından izlenmesi. | 1 | 2 | **2 (Düşük)** | **Uygulandı (Kod + Test)**<br>Kanıt: [`scripts/compare-data.mjs`](../scripts/compare-data.mjs), [`tests/compare-data.test.mjs`](../tests/compare-data.test.mjs) |
| **T-06 [I — Information Disclosure]**<br>`OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` veya OAuth2 `access_token` değerlerinin JSON dosyalarına, CI loglarına, git geçmişine veya `dist/` paketine sızması | **A1, A2, A3** (`scripts/fetch-opensky.mjs`, `.github/workflows/ci.yml`) | 3 | 5 | **15 (Yüksek)** | • Kimlik bilgileri yalnızca Node.js arka plan betiğinde ortam değişkeninden okunur; hiçbir zaman JSON çıktısına, hata mesajına veya konsol loguna yazılmaz.<br>• `tests/fetch-opensky.test.mjs` sahte kimlik bilgileriyle JSON ve `stdout`/`stderr` çıktılarında sızıntı olmadığını doğrular.<br>• `ci.yml` içinde `gitleaks/gitleaks-action` (`v3.0.0`) `fetch-depth: 0` ile tüm git geçmişini tarar. | • GitHub depo ayarlarından yerel **GitHub Secret Scanning** ve **Push Protection** özelliklerinin de aktif edilmesi. | 1 | 5 | **5 (Düşük)** | **Uygulandı (Kod + CI + Test)**<br>Kanıt: [`tests/fetch-opensky.test.mjs`](../tests/fetch-opensky.test.mjs), [`tests/security-config.test.mjs`](../tests/security-config.test.mjs), [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |
| **T-07 [I / T — Taşıma Katmanı & İstemci Çerçeveleme]**<br>İstemci bağlantısının HTTP'ye düşürülmesi (SSL stripping), tıklama hilesi (clickjacking) veya MIME koklama saldırıları | **A4, A5** (`public/_headers`, `dist/_headers`) | 3 | 3 | **9 (Orta)** | • `public/_headers` içine `Strict-Transport-Security: max-age=31536000` (`includeSubDomains` olmadan), `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` ve `Permissions-Policy` eklendi.<br>• Derleme sonrasında `dist/_headers` dosyasının oluştuğu doğrulandı. | • Değişikliklerin canlıya (`pages.dev`) dağıtılmasının ardından `curl -sI` ve SecurityHeaders / Observatory ile üretim başlıklarının doğrulanması. | 1 | 3 | **3 (Düşük)** | **Yerel Derlemede Uygulandı / Canlı Dağıtım Bekliyor**<br>Kanıt: [`public/_headers`](../public/_headers), [`dist/_headers`](../dist/_headers), [`docs/evidence/local-verification-output.txt`](evidence/local-verification-output.txt) |
| **T-08 [D — Denial of Service / Özel Atanmış Tehdit]**<br>Bot ve scraper kaynaklı aşırı isteklerin Cloudflare Pages (`pages.dev`), GitHub Raw (`raw.githubusercontent.com`) ve harita karo katmanlarında hizmet tüketimi yaratması | **A3, A4, A5** (`ege-hava-sahasi-canli.pages.dev`, `raw.githubusercontent.com`, `src/main.ts`) | 4 | 3 | **12 (Orta)** | • **Mimari Kota İzolasyonu:** Tarayıcı OpenSky API'sine doğrudan bağlanmaz; `raw.githubusercontent.com` üzerinden statik JSON okur. Bu sayede **sayfa kazıması OpenSky API kotasını doğrudan tüketmez**.<br>• **İstemci Öz-Kısıtlama:** `src/main.ts` yenilemeyi 5 dakikada bir yapar, arka plan sekmelerinde (`hidden`) durdurur ve `isRefreshing` kilidi uygular.<br>• **Uygulanmamış Kenar Kontrolleri:** Özel Cloudflare WAF, bot koruması, rate-limit, User-Agent engelleme veya özel cache kuralı **kurulu değildir**. | • Özel alan adı (custom domain) satın alınarak Cloudflare Zone'a bağlanması ve Zone düzeyinde WAF Rate Limiting, Bot Fight Mode ve özel Edge Cache kurallarının tanımlanması *(Ayrıntılı analiz Bölüm 5'tedir)*. | 3 | 2 | **6 (Orta)** | **Kısmen Uygulandı (Mimari İzolasyon Mevcut; Özel WAF/Rate-Limit Kurulu Değil)**<br>Kanıt ve Engel Analizi: [`src/dataService.ts`](../src/dataService.ts), [`src/main.ts`](../src/main.ts), **Bölüm 5** |
| **T-09 [D — Denial of Service / Yukarı Akış Kesintisi & Cron Gecikmesi]**<br>OpenSky API'sinin `HTTP 429` veya zaman aşımı (`15 sn`) vermesi ya da GitHub Actions `cron` kuyruğunun gecikmesi nedeniyle verinin bayatlaması | **A2, A3, A5** (`scripts/fetch-opensky.mjs`, `fetch-opensky.yml`, `src/dataService.ts`) | 4 | 3 | **12 (Orta)** | • `scripts/fetch-opensky.mjs` içinde 15 saniyelik `AbortController` zaman aşımı ve `HTTP_429` yakalama mantığı mevcuttur.<br>• OAuth2 Bearer kimlik doğrulaması (`OPENSKY_CLIENT_ID` / `SECRET`) anonim IP limitini aşmayı azaltır.<br>• Veri yaşı 30 dakikayı aştığında veya uzak veri okunamadığında `src/dataService.ts` otomatik olarak `isStale = true` (`Eski Veri Uyarısı`) durumunu gösterir. | • GitHub Actions `cron` gecikmelerinin 60 dakikayı aştığı durumlarda manuel `workflow_dispatch` tetiklemesi için operasyonel izleme yapılması. | 2 | 2 | **4 (Düşük)** | **Uygulandı (Kod + Test)**<br>Kanıt: [`scripts/fetch-opensky.mjs`](../scripts/fetch-opensky.mjs), [`src/dataService.ts`](../src/dataService.ts), [`README.md`](../README.md) |
| **T-10 [E — Elevation of Privilege]**<br>CI veya veri toplama iş akışlarında aşırı yetkilendirilmiş `GITHUB_TOKEN` kullanımı veya fork/PR senaryolarında gizli anahtarların ifşası / yetkisiz yazma | **A1, A2** (`.github/workflows/ci.yml`, `.github/workflows/fetch-opensky.yml`) | 3 | 4 | **12 (Orta)** | • `ci.yml` yalnızca `permissions: contents: read` ve `persist-credentials: false` kullanır.<br>• `ci.yml` içindeki `gitleaks` adımı `GITLEAKS_ENABLE_COMMENTS: "false"` ile çalışır; fork PR'larında yazma yetkisi veya özel secret gerektirmez.<br>• `fetch-opensky.yml` yalnızca `schedule` ve `workflow_dispatch` ile tetiklenir (`pull_request` ile tetiklenmez); `main` dalına yazmaz, yalnızca `data` dalına push yapar. | • GitHub Actions genel depo ayarlarında *"Fork pull request workflows from outside collaborators"* için onay şartının ve `main` dalı korumasının aktif tutulması. | 1 | 4 | **4 (Düşük)** | **Uygulandı (Kod + Test)**<br>Kanıt: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), [`.github/workflows/fetch-opensky.yml`](../.github/workflows/fetch-opensky.yml), [`tests/security-config.test.mjs`](../tests/security-config.test.mjs) |

---

## 5. Özel Atanmış Tehdit İncelemesi: Bot / Scraper Kaynaklı Hizmet Tüketimi (`T-08`)

Bu bölümde, projeye özel atanmış tehdit olan **otomatik botların ve kazıyıcıların (scrapers) yarattığı hizmet tüketimi riski (`T-08`)** mimari gerçekler ve mevcut platform kısıtları çerçevesinde ayrıntılı olarak incelenmiştir.

### 5.1. Saldırı Yolu ve Mimari Etki Analizi
1. **OpenSky API Kotasının Doğrudan Tüketilmemesi (Mimari İzolasyon):**
   - Kullanıcının tarayıcısında çalışan istemci kodu ([`src/dataService.ts`](../src/dataService.ts)), OpenSky Network REST API'sine (`https://opensky-network.org/api/states/all`) **hiçbir zaman doğrudan bağlanmaz**.
   - İstemci yalnızca `https://raw.githubusercontent.com/Fylgja0/ege-hava-sahasi-canli/data/data/latest.json` ve `snapshots.json` adreslerindeki herkese açık statik JSON dosyalarını okur.
   - Dolayısıyla kötü niyetli bir botun veya kazıyıcının `https://ege-hava-sahasi-canli.pages.dev/` sayfasını saniyede yüzlerce kez yenilemesi veya HTML/JSON içeriğini kazıması, **OpenSky API kredisini veya OAuth2 kotasını doğrudan tüketmez**. OpenSky API kotası yalnızca GitHub Actions üzerindeki zamanlanmış iş akışı (`fetch-opensky.yml`) çalıştığında tüketilir.
2. **Buna Rağmen Oluşabilecek Hizmet Tüketimi ve İstek Yükü:**
   - **Cloudflare Pages (`ege-hava-sahasi-canli.pages.dev`) Üzerindeki Yük:** Yoğun bot/scraper trafiği statik HTML, CSS ve JS varlıkları üzerinde yüksek sayıda HTTP isteği ve bant genişliği tüketimi oluşturabilir.
   - **GitHub Raw (`raw.githubusercontent.com`) Üzerindeki Yük:** Başsız tarayıcı (headless browser) kullanan botlar veya doğrudan JSON uç noktalarını sorgulayan kazıyıcılar `raw.githubusercontent.com` üzerinde aşırı istek yükü oluşturabilir ve GitHub Raw CDN hız sınırlarının (rate limit / `HTTP 429`) tetiklenmesine yol açabilir.
   - **OpenStreetMap Karo Sunucuları (`*.tile.openstreetmap.org`) Üzerindeki Yük:** Başsız tarayıcılarla yapılan otomatik sayfa kazımaları, üçüncü taraf ücretsiz OpenStreetMap karo sunucularına gereksiz karo (tile) istekleri göndererek OSM kullanım politikası sınırlarını zorlayabilir.

### 5.2. Mevcut Durum, Gereksinim, Engel ve Kalan Risk Dökümü

| Boyut | Ayrıntılı Teknik Açıklama |
| :--- | :--- |
| **1. Mevcut Durum**<br>*(Gerçekten Uygulanmış Olanlar vs. Kurulu Olmayanlar)* | **Uygulanmış Kontroller (Kodda Doğrulanabilir):**<br>• **Veri Hattı Ayrımı:** İstemci yalnızca statik JSON okur; OpenSky API kotası istemci trafiğinden tamamen izoledir ([`src/dataService.ts`](../src/dataService.ts)).<br>• **İstemci Öz-Sınırlama:** [`src/main.ts`](../src/main.ts) otomatik yenilemeyi yalnızca 5 dakikada bir (`AUTO_REFRESH_INTERVAL_MS = 300000`) yapar, sekme arka plandayken (`document.visibilityState === 'hidden'`) ağ isteklerini durdurur ve eşzamanlı istekleri `isRefreshing` kilidiyle engeller.<br>• **Yedek Veri Davranışı:** Uzak `raw.githubusercontent.com` adresi aşırı yük nedeniyle yanıt veremezse istemci yerel paket yedeğine (`./data`) düşer ve durumu dürüstçe `Eski Veri (Yerel Yedek)` olarak işaretler.<br><br>**Kurulu Olmayan Kontroller (Dürüst Durum Tespiti):**<br>• Şu anda canlı dağıtımda **özel Cloudflare WAF kuralı**, **özel bot koruması (Bot Fight Mode)**, **IP bazlı hız sınırlama (Rate Limiting kuralı)**, **User-Agent engelleme kuralı** veya **özel Edge Cache kuralı kurulu değildir**. |
| **2. Gereksinim**<br>*(Tam Koruma İçin İhtiyaç Duyulan Kontroller)* | • Otomatik kazıyıcıların ve agresif botların kenar (edge) katmanında durdurulması için:<br>  1. IP başına dakikadaki istek sayısını sınırlayan **Cloudflare WAF Rate Limiting** kuralı (örn. `/data/*` ve kök dizin için eşik tanımlanması),<br>  2. Otomatik bot imzalarını ve şüpheli başsız tarayıcıları filtreleyen **Cloudflare Bot Fight Mode / Managed Challenge**,<br>  3. Kötü amaçlı kazıyıcıları filtreleyen **User-Agent / ASN tabanlı WAF özel kuralları**,<br>  4. JSON verilerinin `raw.githubusercontent.com` yerine aynı özel alan adı altındaki önbellekli (Edge Cached) bir rotadan (`Cache-Control: public, max-age=300`) sunulması. |
| **3. Engel**<br>*(Neden Şu Anda Uygulanamıyor?)* | • Canlı uygulama şu anda Cloudflare'in paylaşımlı varsayılan alt alan adı olan **`https://ege-hava-sahasi-canli.pages.dev/` (`*.pages.dev`)** üzerinde barındırılmaktadır.<br>• Cloudflare mimarisinde `*.pages.dev` alt alan adları için kullanıcı hesabında **yönetilebilir bir Cloudflare Zone (DNS Bölgesi) bulunmaz**.<br>• Özel WAF kuralları, Rate Limiting kuralları, Bot Fight Mode ve özel Cache Rules özellikleri yalnızca bir **özel alan adı (custom domain)** satın alınıp Cloudflare Zone olarak hesaba eklendiğinde ve Pages projesine bağlandığında yapılandırılabilir. |
| **4. Kalan Risk**<br>*(Kontroller Sonrası Değerlendirme)* | • **İlk Risk:** Olasılık `4` × Etki `3` = **`12 (Orta)`**.<br>• **Kalan Risk:** Olasılık `3` × Etki `2` = **`6 (Orta)`**.<br>• **Gerekçe:** Mimari izolasyon sayesinde bot/scraper saldırıları en kritik varlık olan OpenSky OAuth2/API kotasını (`A1`/`A2`) tüketemez ve uygulamanın arka plan veri toplama hattını durduramaz (Etki `3` → `2` düşmüştür). Ancak `pages.dev` üzerinde özel WAF ve rate-limit kuralı bulunmadığından `pages.dev` ve `raw.githubusercontent.com` uç noktalarına yönelik aşırı istek riski **Orta (`6`)** seviyede kalmaya devam etmektedir. |

---

## 6. Bilinen Diğer Mimari Ödünleşimler ve Açık Noktalar

1. **CSP `style-src 'unsafe-inline'` İstisnası (`T-03` ile İlişkili):**
   - **Gerekçe:** Leaflet harita kütüphanesi, harita karolarının konumlandırılması (`transform: translate3d(...)`) ve uçak işaretçilerinin yön açısına (`transform: rotate(...)`) göre döndürülmesi için DOM öğelerine çalışma zamanında satır içi CSS uygular.
   - **Azaltıcı Kontrol:** `script-src 'self'` ve `object-src 'none'` katı biçimde korunarak satır içi JavaScript çalıştırılması tamamen engellenmiştir.
2. **GitHub Actions Cron Zamanlama Gecikmesi (`T-09` ile İlişkili):**
   - `.github/workflows/fetch-opensky.yml` içindeki `cron: '*/30 * * * *'` ifadesi GitHub Actions için hedeflenen zamanlama planıdır; paylaşımlı GitHub Actions kuyruk yoğunluğuna bağlı olarak gerçek çalıştırma zamanları gecikebilir ve kesin 30 dakikalık gerçek zamanlı veri garantisi vermez. Arayüz bu durumu veri yaşı >30 dakika olduğunda `Eski Veri Uyarısı` ile şeffaf biçimde kullanıcıya bildirir.
3. **`security.txt` İletişim Kanalı Doğrulaması:**
   - [`public/.well-known/security.txt`](../public/.well-known/security.txt) içinde uydurma e-posta kullanılmamıştır. GitHub Security Advisories özel bildirim bağlantısının (`/security/advisories/new`) dış araştırmacılara açık olması için depo sahibi tarafından GitHub ayarlarından **Private vulnerability reporting** özelliğinin açılması gerekir.
