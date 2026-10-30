# Kanıt Klasörü ve Doğrulama Rehberi (`docs/evidence/`)

**Proje:** Ege Hava Sahası Canlı (`ege-hava-sahasi-canli`)
**Kapsam:** *BVA 2245 Kullanıcı Arayüzü Tasarımı* ve *Bulut Bilişim ve Siber Güvenlik* Final Teslim Kanıtları
**Depo:** `https://github.com/Fylgja0/ege-hava-sahasi-canli`
**Canlı Dağıtım (Kendi Sitemiz):** `https://ege-hava-sahasi-canli.pages.dev/`

> **Temel Kural (Dürüst Kanıt İlkesi):**
> - Bu dizine **yalnızca gerçek komut çıktıları, gerçek tarama raporları ve gerçek ekran görüntüleri** eklenmelidir.
> - Hiçbir zaman uydurma Lighthouse skoru, sahte ZAP çıktısı, kurgusal WAF olayı, sahte hesap paneli görüntüsü veya uydurma kullanıcı testi verisi yazılmamalıdır.
> - Tüm aktif güvenlik ve performans testleri **yalnızca kendi statik sitemize (`https://ege-hava-sahasi-canli.pages.dev/`)** veya yerel önizleme sunucusuna (`http://localhost:4173`) uygulanmalıdır. **Üçüncü taraf OpenSky Network API uç noktalarına (`opensky-network.org`) kesinlikle güvenlik taraması (ZAP vb.) veya yük testi gönderilmemelidir.**

---

## 1. Yerel Doğrulama Komutları ve Gerçek Çıktılar

Kod ve derleme bütünlüğünü doğrulamak için çalıştırılması gereken zorunlu komutlar:

```bash
npm ci
npm test
npm audit --audit-level=high
npm run build
```

- Bu komutların yerel ortamda çalıştırılmasıyla elde edilen güncel ve gerçek terminal çıktıları [`local-verification-output.txt`](local-verification-output.txt) dosyasında kayıtlıdır:
  - **Node.js sürümü:** `v22.23.4`
  - **npm sürümü:** `10.9.9`
  - **`npm test`:** `12/12` başarılı (`compare-data`, `fetch-opensky`, `security-config`)
  - **`npm audit --audit-level=high`:** `0 vulnerabilities` (`found 0 vulnerabilities`)
  - **`npm run build`:** Başarılı (`tsc --noEmit && vite build`)
  - **Üretilen Çıktı Dosyaları:** `dist/_headers`, `dist/404.html`, `dist/robots.txt`, `dist/sitemap.xml` ve `dist/.well-known/security.txt` dosyalarının varlığı doğrulandı.
  - **CORS Başlığı Kaldırma Kuralı:** `dist/_headers` içinde `! Access-Control-Allow-Origin` kuralı doğrulandı.

---

## 2. Dış Araç ve Hesap Paneli Kanıtlarını Kaydetme Kılavuzu

Aşağıdaki bölümlerde, 30 Ekim 2026 tarihinde canlı ortamda (`https://ege-hava-sahasi-canli.pages.dev/`) gerçekleştirilen başlangıç ölçümleri ile PR #3 kapsamındaki güvenlik ve yapılandırma iyileştirmelerinin (`! Access-Control-Allow-Origin`, `404.html`, `robots.txt`, `sitemap.xml`) canlıya dağıtılması sonrasında tamamlanan canlı doğrulama ve ikinci OWASP ZAP taraması sonuçları yer almaktadır. Henüz çalıştırılmamış dış testlerin sonuç alanları **bilinçli olarak boş** bırakılmıştır.

### 2.1. Lighthouse Mobil Denetimi (`https://ege-hava-sahasi-canli.pages.dev/`)
- **Nasıl Alınır:**
  1. Google Chrome Gizli Sekmede (uzantılar kapalıyken) `https://ege-hava-sahasi-canli.pages.dev/` adresini açın.
  2. **DevTools (F12) → Lighthouse** sekmesine geçin.
  3. **Mode:** `Navigation`, **Device:** `Mobile`, **Categories:** `Performance`, `Accessibility`, `Best Practices`, `SEO` seçin ve **Analyze page load** düğmesine tıklayın.
  4. Raporu [`lighthouse-mobile.html`](lighthouse-mobile.html) olarak kaydedin.
- **Gerçek İlk Ölçüm Sonuçları (30 Ekim 2026 — [`lighthouse-mobile.html`](lighthouse-mobile.html)):**
  - **Performans (Performance):** `95`
  - **Erişilebilirlik (Accessibility):** `100`
  - **En İyi Uygulamalar (Best Practices):** `100`
  - **SEO:** `92`

---

### 2.2. OWASP ZAP Baseline Taraması (Before / After)
> **Uyarı:** ZAP taramasını **yalnızca** `https://ege-hava-sahasi-canli.pages.dev/` (veya yerel `http://localhost:4173`) hedefine karşı çalıştırın. `opensky-network.org` adresine tarama göndermeyin.

- **Nasıl Alınır:**
  ```bash
  docker run --rm -v "$(pwd)/docs/evidence:/zap/wrk:rw" \
    ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
    -t https://ege-hava-sahasi-canli.pages.dev/ \
    -r zap-baseline-after.html \
    -w zap-baseline-after.md
  ```
- **Kaydedilen Rapor Dosyaları:**
  - [`zap-baseline-before.md`](zap-baseline-before.md) ve [`zap-baseline-before.html`](zap-baseline-before.html): **30 Ekim 2026 tarihli ilk (before) taramaya ait rapor dosyaları** (PR #3 güvenlik iyileştirmeleri öncesindeki başlangıç taraması).
  - [`zap-baseline-after.md`](zap-baseline-after.md) ve [`zap-baseline-after.html`](zap-baseline-after.html): **PR #3 (`! Access-Control-Allow-Origin`, `404.html`, `robots.txt`, `sitemap.xml`) canlı dağıtımı sonrasında yapılan ikinci (after) tarama** (30 Ekim 2026).
  - *Yapılandırma Dosyası Notu:* Dizindeki [`zap.yaml`](zap.yaml) dosyası, mevcut hâliyle ikinci (`after`) taramanın rapor dosya adlarını (`zap-baseline-after.html` ve `zap-baseline-after.md`) kullanmaktadır.
- **Gerçek Sonuç Özeti:**
  - **1. Başlangıç Taraması (`zap-baseline-before.md` ve `zap-baseline-before.html` — 30 Ekim 2026):**
    - `High: 0`, `Medium: 2` (`CSP: style-src unsafe-inline` [Leaflet için bilinçli mimari istisna], `Cross-Domain Misconfiguration` [Cloudflare Pages varsayılan `Access-Control-Allow-Origin: *`]), `Low: 2` (`COEP`, `COOP`), `Informational: 2`.
  - **2. İyileştirme Sonrası İkinci Tarama (`zap-baseline-after.md` ve `zap-baseline-after.html` — 30 Ekim 2026):**
    - **Tarih:** 30 Ekim 2026
    - **Hedef:** `https://ege-hava-sahasi-canli.pages.dev/`
    - **Bulunan URL sayısı:** `10`
    - **`PASS`:** `64`
    - **`FAIL`:** `0`
    - **`WARN-NEW`:** `4` kategori
    - **`WARN-INPROG`:** `0`
    - **Devam Eden Uyarı (`WARN-NEW`) Kategorileri:**
      - `10015` *Re-examine Cache-control Directives*: `3` bulgu
      - `10049` *Non-Storable Content*: `6` bulgu
      - `10055` *CSP: style-src unsafe-inline*: `2` bulgu *(Leaflet harita konumlandırma ve işaretçi döndürme işlemleri için korunan bilinçli istisna)*
      - `90004` *Cross-Origin-Embedder-Policy Header Missing or Invalid*: `9` bulgu *(COEP başlığı, üçüncü taraf kaynaklarla (OpenStreetMap harita karoları ve GitHub Raw verileri) uyumluluk etkisi henüz doğrulanmadığından etkinleştirilmemiştir. İleride eklenmesi değerlendirilirken harita ve veri akışı regresyon testleri yapılmalıdır.)*
    - **Giderilen Bulgu (`10098`):** İlk taramada *Medium* seviyesinde uyarı veren `10098` *Cross-Domain Misconfiguration* kuralı artık **`PASS`** durumuna geçmiştir; önceki taramadaki wildcard CORS (`Access-Control-Allow-Origin: *`) uyarısı ikinci taramada görülmemiştir.
    - **Dürüst Değerlendirme Notu:** İkinci tarama sonucu *"hiçbir güvenlik bulgusu/uyarısı yok"* şeklinde yorumlanmamalıdır; taramada **`FAIL: 0`** olmakla birlikte yukarıda listelenen **dört uyarı (`WARN-NEW`) kategorisi** devam etmektedir.

---

### 2.3. HTTP Güvenlik Başlıkları ve `/.well-known/security.txt` Yanıtı
- **30 Ekim 2026 Tarihli Canlı HTTP Kontrolü Sonuçları (PR #3 Dağıtımı Sonrası):**
  - Canlı ortam (`https://ege-hava-sahasi-canli.pages.dev`) üzerinde `curl` ile `Origin: https://example.org` başlığı gönderilerek yapılan doğrulamada aşağıdaki gerçek yanıtlar alınmıştır:
    - `/` → **HTTP `200`**
    - `/robots.txt` → **HTTP `200`**, `text/plain; charset=utf-8`
    - `/sitemap.xml` → **HTTP `200`**, `application/xml`
    - `/.well-known/security.txt` → **HTTP `200`**, `text/plain; charset=utf-8`
    - `/olmayan-sayfa-testi` → **HTTP `404`**
  - **Doğrulanan Güvenlik ve CORS Başlıkları:**
    - Yanıtlarda `Strict-Transport-Security: max-age=31536000`, `Content-Security-Policy` (CSP) ve `X-Frame-Options: DENY` başlıkları mevcuttur.
    - `Origin: https://example.org` başlığı ile yapılan kontroller sırasında **hiçbir yanıtta `Access-Control-Allow-Origin` başlığı dönmemiştir** (`! Access-Control-Allow-Origin` kuralının canlıda çalıştığı doğrulanmıştır).
- **Canlı Doğrulama Komutları:**
  ```bash
  curl -sI -H "Origin: https://example.org" https://ege-hava-sahasi-canli.pages.dev/
  curl -sI -H "Origin: https://example.org" https://ege-hava-sahasi-canli.pages.dev/robots.txt
  curl -sI -H "Origin: https://example.org" https://ege-hava-sahasi-canli.pages.dev/sitemap.xml
  curl -sI -H "Origin: https://example.org" https://ege-hava-sahasi-canli.pages.dev/.well-known/security.txt
  curl -sI -H "Origin: https://example.org" https://ege-hava-sahasi-canli.pages.dev/olmayan-sayfa-testi
  ```
- **Gerçek Sonuç Özeti:**
  - `Strict-Transport-Security: max-age=31536000`, CSP ve `X-Frame-Options: DENY` mevcut mu?: **Evet (Canlıda Doğrulandı — 30 Ekim 2026)**
  - `/.well-known/security.txt` `200 OK` ve `text/plain; charset=utf-8` döndürüyor mu?: **Evet (Canlıda Doğrulandı — 30 Ekim 2026)**
  - `/robots.txt` (`200`, `text/plain; charset=utf-8`), `/sitemap.xml` (`200`, `application/xml`) ve `/olmayan-sayfa-testi` (`404`) doğrulandı mı?: **Evet (Canlıda Doğrulandı — 30 Ekim 2026)**
  - `Access-Control-Allow-Origin` başlığı kaldırıldı mı?: **Evet (`Origin: https://example.org` ile hiçbir yanıtta dönmediği canlıda doğrulandı — 30 Ekim 2026)**

---

### 2.4. MDN HTTP Observatory ve SecurityHeaders.com Kanıtları
- **Nasıl Alınır:**
  1. [MDN HTTP Observatory](https://developer.mozilla.org/en-US/observatory) üzerinde `ege-hava-sahasi-canli.pages.dev` adresini taratın ve ekran görüntüsünü `docs/evidence/observatory-screenshot.png` olarak kaydedin.
  2. [SecurityHeaders.com](https://securityheaders.com/) üzerinde `https://ege-hava-sahasi-canli.pages.dev/` adresini (`Hide results` işaretli) taratın ve ekran görüntüsünü `docs/evidence/securityheaders-screenshot.png` olarak kaydedin.
- **Gerçek Sonuç Özeti (Tarama Sonrası Doldurulacak):**
  - MDN Observatory Notu / Skoru: `[Boş — Gerçek tarama sonrası doldurulacak]`
  - SecurityHeaders.com Notu: `[Boş — Gerçek tarama sonrası doldurulacak]`

---

### 2.5. Cloudflare WAF / Rate-Limit Olay Kanıtı ve `*.pages.dev` Kısıtı
- **Teknik Durum:**
  - Canlı site şu anda `https://ege-hava-sahasi-canli.pages.dev/` varsayılan alt alan adında çalışmaktadır.
  - Cloudflare üzerinde özelleştirilmiş WAF ve Rate Limiting kuralları (Security → WAF → Rate limiting rules) bir Cloudflare Zone'a bağlı **özel alan adı (custom domain)** gerektirir. Kaynak kod içinde WAF kuralı tanımlı değildir.
- **Kanıt Kaydetme Yöntemi:**
  - Eğer projeye Cloudflare Zone üzerinde özel bir alan adı bağlanıp WAF/Rate-Limit kuralı tanımlanırsa, kural yapılandırması ve tetiklenen örnek güvenlik olayı ekran görüntüsü `docs/evidence/cloudflare-waf-event.png` olarak kaydedilmelidir.
  - Özel alan adı kullanılmıyorsa bu kısıt raporda açıkça belirtilmeli, sahte WAF ekran görüntüsü üretilmemelidir.

---

### 2.6. GitHub Dal Koruma (Branch Protection) Kanıtı
- **Nasıl Alınır:**
  1. GitHub deposunda **Settings → Branches** (veya **Rules → Rulesets**) menüsüne gidin.
  2. `main` dalı için Pull Request zorunluluğu ve başarılı CI (`Node.js 24 Test, Audit ve Build` ve `Gitleaks Gizli Bilgi Taraması`) durum kontrollerini (status checks) etkinleştirin.
  3. Ayar ekranının görüntüsünü `docs/evidence/github-branch-protection.png` olarak kaydedin.

---

### 2.7. Bulut Bütçe, Maliyet ve İzleme (Budget / Monitoring) Ekran Görüntüsü
- **Nasıl Alınır:**
  1. **Cloudflare Dashboard:** Workers & Pages → `ege-hava-sahasi-canli` → **Metrics / Analytics** ve **Billing** sayfasından ücretsiz kota kullanımı / bildirim ayarlarının ekran görüntüsünü (`docs/evidence/cloudflare-monitoring-budget.png`) kaydedin.
  2. **GitHub Actions & Billing:** GitHub Settings → **Billing and plans → Budgets and alerts** (veya Actions kullanım özeti) ekran görüntüsünü (`docs/evidence/github-actions-usage.png`) kaydedin.

---

### 2.8. Gerçek Kullanıcı Testi Kanıtları (2 Kullanıcı × 3 Görev)
- **Şablon Dosyası:** [`user-testing-template.md`](user-testing-template.md)
- **Nasıl Uygulanır:**
  1. 2 gerçek kullanıcıdan (Katılımcı `K-01` ve `K-02`) [`user-testing-template.md`](user-testing-template.md) içindeki 3 görevi canlı site üzerinde tamamlamalarını isteyin.
  2. Her görev için gerçek tamamlama süresini (saniye), hata/takılma sayısını ve katılımcı gözlemlerini tabloya kaydedin.
- **Gerçek Sonuç Özeti (Test Sonrası Doldurulacak):**
  - Katılımcı 1 (`K-01`) Tamamlanan Görev Sayısı: `[Boş — Gerçek kullanıcı testi sonrası doldurulacak]`
  - Katılımcı 2 (`K-02`) Tamamlanan Görev Sayısı: `[Boş — Gerçek kullanıcı testi sonrası doldurulacak]`
