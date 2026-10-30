# Olay Müdahale Kılavuzu (Incident Response Runbook)

**Proje:** Ege Hava Sahası Canlı (`ege-hava-sahasi-canli`)
**Depo:** `https://github.com/Fylgja0/ege-hava-sahasi-canli`
**Canlı Ortam:** `https://ege-hava-sahasi-canli.pages.dev/`
**İlişkili Tehdit Modeli:** [`docs/DFD_STRIDE.md`](DFD_STRIDE.md) (`T-01` – `T-10`)

Bu kılavuz, [`docs/DFD_STRIDE.md`](DFD_STRIDE.md) belgesinde tanımlanan 10 STRIDE tehdit senaryosu (`T-01` – `T-10`) ile uyumlu olarak güvenlik, veri bütünlüğü ve hizmet tüketimi olaylarına müdahale prosedürlerini tanımlar.

---

## 1. Olay Sınıflandırma, Tehdit Eşleşmesi ve Öncelik Seviyeleri

| Seviye | İlişkili Tehdit ID'leri | Tanım ve Örnek Olay | Hedef Müdahale Süresi |
| :--- | :--- | :--- | :--- |
| **P1 — Kritik** | `T-01`, `T-06`, `T-10` | Gizli anahtar (`OPENSKY_CLIENT_SECRET`) sızıntısı, yetkisiz token kullanımı veya CI/CD iş akışı yetki ihlali | Derhal (< 30 dakika) |
| **P2 — Yüksek** | `T-02`, `T-03`, `T-04`, `T-07` | Tedarik zinciri / `npm audit` yüksek-kritik zafiyeti, DOM/veri bütünlüğü bozulması veya canlı güvenlik başlıklarının (`_headers`) devre dışı kalması | < 4 saat |
| **P3 — Orta** | `T-05`, `T-08`, `T-09` | Bot/scraper kaynaklı `pages.dev` / `raw.githubusercontent.com` aşırı istek yükü, OpenSky API `HTTP 429` / kesintisi veya GitHub Actions `cron` gecikmesi nedeniyle verinin bayatlaması (`isStale`) | < 24 saat |

---

## 2. Senaryo Bazlı Müdahale Prosedürleri

### Senaryo A: OpenSky OAuth2 Gizli Anahtarının (`OPENSKY_CLIENT_SECRET`) Sızması veya Yetki İhlali (`T-01`, `T-06`, `T-10` — P1)

**Belirtiler / Tespit:**
- `.github/workflows/ci.yml` içindeki `gitleaks` (`gitleaks/gitleaks-action@v3.0.0`) iş adımının sıfır olmayan çıkış koduyla başarısız olması.
- `tests/fetch-opensky.test.mjs` veya `tests/security-config.test.mjs` sızıntı testlerinin hata vermesi.
- GitHub Secret Scanning bildirimi veya `latest.json` / CI log çıktılarında beklenmeyen kimlik bilgisi görülmesi.

**Müdahale Adımları:**
1. **Sınırlandırma ve İptal (Containment & Revocation):**
   - Derhal [OpenSky Network Hesap Paneli](https://opensky-network.org/) üzerinden ilgili OAuth2 API istemcisini (`client_id`) iptal edin (revoke/delete) veya yeni bir `client_secret` üretin.
2. **Anahtar Döndürme (Rotation):**
   - GitHub deposunda **Settings → Secrets and variables → Actions** sayfasına gidin.
   - `OPENSKY_CLIENT_ID` ve `OPENSKY_CLIENT_SECRET` değerlerini yeni kimlik bilgileriyle güncelleyin.
3. **Kod ve Geçmiş Temizliği (Eradication):**
   - Sızıntı bir commit ile depoya girdiyse ilgili anahtar iptal edilmiş olsa bile commit geçmişini temizleyin ve yerel ortamda `npm test` çalıştırarak sızıntı olmadığını doğrulayın.
4. **Doğrulama (Recovery & Verification):**
   - GitHub Actions sekmesinden `Fetch OpenSky Data` iş akışını manuel (`workflow_dispatch`) tetikleyerek yeni OAuth2 kimlik bilgileriyle veri çekiminin başarılı olduğunu ve `CI` iş akışındaki `Gitleaks Gizli Bilgi Taraması` adımının yeşil geçtiğini doğrulayın.

---

### Senaryo B: OpenSky API Kesintisi, `HTTP 429`, Cron Gecikmesi veya Bozuk Veri Yayını (`T-04`, `T-05`, `T-09` — P2 / P3)

**Belirtiler / Tespit:**
- `Fetch OpenSky Data` GitHub Actions iş akışının kırmızı (başarısız) sonuçlanması.
- Canlı arayüzde `Veri Çekim Hatası (HTTP_429 / TIMEOUT / NETWORK_ERROR)` veya `Eski Veri Uyarısı` (>30 dk) bandının görünmesi.
- GitHub Actions paylaşımlı kuyruk yoğunluğu nedeniyle `cron: '*/30 * * * *'` çalışmasının gecikmesi.

**Otomatik Koruma Davranışı (Kodda Mevcut):**
- [`scripts/fetch-opensky.mjs`](../scripts/fetch-opensky.mjs) hata anında son başarılı `latest.json` ve `snapshots.json` dosyalarını **silmez**; `snapshots.json` içine sahte canlı ölçüm eklemez.
- Yalnızca `lastAttempt` alanını günceller ve CI izlemesi için `exit code 1` döndürür.
- [`scripts/compare-data.mjs`](../scripts/compare-data.mjs) yalnızca `lastAttempt.timestamp` veya `lastAttempt.message` değişmişse `data` dalına gereksiz commit atılmasını önler.

**Müdahale Adımları:**
1. **Teşhis:**
   - GitHub Actions → `Fetch OpenSky Data` son çalışma günlüğünü (log) inceleyin.
   - Sorun GitHub Actions `cron` kuyruk gecikmesinden kaynaklanıyorsa iş akışını **Run workflow (`workflow_dispatch`)** düğmesiyle manuel tetikleyin.
   - Hata türü `HTTP_429` ise: `OPENSKY_CLIENT_ID` ve `OPENSKY_CLIENT_SECRET` GitHub Secrets değerlerinin doğru tanımlandığını kontrol edin.
2. **`data` Dalında Bozuk Veri Olması Durumunda Geri Alma (Rollback):**
   ```bash
   git fetch origin data
   git log origin/data -n 5 --oneline
   # Son sağlam commit'e geri dönmek için (yalnızca data dalında):
   git checkout -B data origin/data
   git revert HEAD --no-edit
   git push origin data
   ```
3. **Doğrulama:**
   - `https://raw.githubusercontent.com/Fylgja0/ege-hava-sahasi-canli/data/data/latest.json` adresindeki JSON yapısının geçerli olduğunu ve arayüzde görüntülendiğini kontrol edin.

---

### Senaryo C: Yüksek/Kritik Bağımlılık Zafiyeti veya Tedarik Zinciri Uyarısı (`T-02` — P2)

**Belirtiler / Tespit:**
- `.github/workflows/ci.yml` içindeki `npm audit --audit-level=high` adımının başarısız olması.
- `.github/dependabot.yml` tarafından açılan `npm` veya `github-actions` güvenlik güncellemesi Pull Request'i.

**Müdahale Adımları:**
1. **Analiz:**
   - Yerel terminalde `npm audit` komutunu çalıştırarak etkilenen paketi, zafiyet şiddetini ve çalışma zamanı (`dependencies`) mı yoksa derleme zamanı (`devDependencies`) mı olduğunu belirleyin.
   - GitHub Actions güncellemesi ise yeni sürümün resmi depodaki tam 40 karakterlik commit SHA değerini doğrulayın.
2. **İyileştirme:**
   - `npm audit fix --force` komutunu körlemesine **kullanmayın**.
   - Uyumlu sürüm güncellemesini `package.json` ve `package-lock.json` üzerinde birlikte uygulayın.
3. **Doğrulama:**
   ```bash
   npm ci
   npm test
   npm audit --audit-level=high
   npm run build
   ```
   Komutlarının tamamı `0` çıkış koduyla geçtikten sonra değişikliği `main` dalına birleştirin.

---

### Senaryo D: Bot / Scraper Kaynaklı Hizmet Tüketimi, İstenmeyen Trafik ve Güvenlik Başlığı İhlali (`T-03`, `T-07`, `T-08` — P2 / P3)

**Mimari Gerçek ve Mevcut Kısıtlar (`T-08`):**
- İstemci arayüzü (`https://ege-hava-sahasi-canli.pages.dev/`) OpenSky API'sine doğrudan bağlanmaz; `raw.githubusercontent.com` üzerinden statik JSON okur. Bu nedenle **bot veya sayfa kazıması (scraping) OpenSky API kotasını doğrudan tüketmez**.
- Buna karşın yoğun bot/scraper trafiği **Cloudflare Pages (`pages.dev`)**, **GitHub Raw (`raw.githubusercontent.com`)** ve **OpenStreetMap karo sunucuları** üzerinde aşırı istek yükü oluşturabilir.
- Şu anda `ege-hava-sahasi-canli.pages.dev` üzerinde **özel Cloudflare WAF, bot koruması, rate-limit, User-Agent engelleme veya özel cache kuralı kurulu değildir**; çünkü `*.pages.dev` paylaşımlı alt alan adında kullanıcı tarafından yönetilebilir bir Cloudflare Zone bulunmamaktadır.

**Müdahale Adımları:**
1. **Etki Tespiti:**
   - Sorunun yalnızca istemci/CDN katmanında mı (`pages.dev` / `raw.githubusercontent.com` `HTTP 429`) yoksa arka plan veri toplama iş akışında mı olduğunu ayırın. (`raw.githubusercontent.com` erişilemez olduğunda istemci otomatik olarak yerel `./data` yedeğine düşer ve `Eski Veri (Yerel Yedek)` uyarısı gösterir.)
2. **Hatalı Dağıtımı veya Başlık İhlalini Geri Alma (Cloudflare Pages Rollback — `T-03`, `T-07`):**
   - Yeni bir derleme arayüzü veya `_headers` kurallarını bozduysa Cloudflare Dashboard → **Workers & Pages** → `ege-hava-sahasi-canli` → **Deployments** sekmesinden bir önceki başarılı dağıtım için **Rollback to this deployment** seçeneğini kullanın.
   - Dağıtım sonrası başlıkları doğrulayın:
     ```bash
     curl -sI https://ege-hava-sahasi-canli.pages.dev/
     curl -si https://ege-hava-sahasi-canli.pages.dev/.well-known/security.txt
     ```
3. **Kalıcı Bot / Rate-Limit Korumasına Geçiş (Özel Alan Adı & Cloudflare Zone Gereksinimi — `T-08`):**
   - Bot/scraper trafiğini kenar (edge) katmanında engellemek için:
     1. Projeye Cloudflare hesabında yönetilen bir **özel alan adı (custom domain)** ve **Cloudflare Zone** bağlayın,
     2. Cloudflare Zone → **Security → WAF → Rate limiting rules** altında IP bazlı istek sınırı tanımlayın,
     3. **Security → Bots** altında **Bot Fight Mode** özelliğini etkinleştirin ve şüpheli `User-Agent` imzaları için WAF kuralı ekleyin.

---

## 3. Gerçek Olay Kayıt Şablonu (Incident Log Template)

> *Not: Aşağıdaki tablo yalnızca gerçek bir olay yaşandığında doldurulmak üzere boş bırakılmıştır; kurgusal olay kaydı girilmemiştir.*

| Olay No | Tarih / Saat (UTC) | İlişkili Tehdit ID | Seviye (P1-P3) | Tespit Yöntemi | Kök Neden | Uygulanan Müdahale | Durum / Kapanış Tarihi |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| *(Boş)* | *(YYYY-AA-GG SS:DD)* | *(T-01 .. T-10)* | *(P1/P2/P3)* | *(Gitleaks / CI / Manuel)* | *(Açıklama)* | *(Alınan aksiyon)* | *(Açık / Kapalı)* |
