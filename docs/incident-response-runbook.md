# Olay Müdahale Kılavuzu (Incident Response Runbook)

**Proje:** Ege Hava Sahası Canlı (`ege-hava-sahasi-canli`)  
**Depo:** `https://github.com/Fylgja0/ege-hava-sahasi-canli`  
**Canlı Ortam:** `https://ege-hava-sahasi-canli.pages.dev/`

Bu kılavuz, Ege Hava Sahası Canlı projesinde karşılaşabilecek güvenlik, veri bütünlüğü ve erişilebilirlik olaylarına müdahale etmek için adım adım uygulanacak operasyonel prosedürleri tanımlar.

---

## 1. Olay Sınıflandırma ve Öncelik Seviyeleri

| Seviye | Tanım | Örnek Olay | Hedef Müdahale Süresi |
| :--- | :--- | :--- | :--- |
| **P1 — Kritik** | Gizli anahtar sızıntısı veya canlı sitede zararlı içerik/kod çalışması | `OPENSKY_CLIENT_SECRET` değerinin git geçmişine sızması; Gitleaks uyarısı | Derhal (< 30 dakika) |
| **P2 — Yüksek** | Veri hattının tamamen durması veya yüksek/kritik bağımlılık zafiyeti | `fetch-opensky.yml` iş akışının ardışık hatalarla durması; `npm audit` High/Critical bulgusu | < 4 saat |
| **P3 — Orta** | Veri gecikmesi (`HTTP 429` / OpenSky API kesintisi) veya dağıtım başlığı eksikliği | OpenSky API'sinin geçici olarak yanıt vermemesi (`isStale` uyarısının devreye girmesi) | < 24 saat |

---

## 2. Senaryo Bazlı Müdahale Prosedürleri

### Senaryo A: OpenSky OAuth2 Gizli Anahtarının (`OPENSKY_CLIENT_SECRET`) Sızması (P1)

**Belirtiler / Tespit:**
- `.github/workflows/ci.yml` içindeki `gitleaks` iş adımının sıfır olmayan çıkış koduyla başarısız olması.
- GitHub Secret Scanning bildirimi veya `latest.json` / log çıktılarında beklenmeyen kimlik bilgisi görülmesi.

**Müdahale Adımları:**
1. **Sınırlandırma ve İptal (Containment & Revocation):**
   - Derhal [OpenSky Network Hesap Paneli](https://opensky-network.org/) üzerinden ilgili OAuth2 istemcisini (`client_id`) iptal edin (revoke/delete) veya yeni bir `client_secret` üretin.
2. **Anahtar Döndürme (Rotation):**
   - GitHub deposunda **Settings → Secrets and variables → Actions** sayfasına gidin.
   - `OPENSKY_CLIENT_ID` ve `OPENSKY_CLIENT_SECRET` değerlerini yeni kimlik bilgileriyle güncelleyin.
3. **Kod ve Geçmiş Temizliği (Eradication):**
   - Sızıntı bir commit ile depoya girdiyse ilgili anahtar iptal edilmiş olsa bile commit geçmişini temizleyin ve `npm test` ile sızıntı önleme testlerini çalıştırın.
4. **Doğrulama (Recovery & Verification):**
   - GitHub Actions sekmesinden `Fetch OpenSky Data` iş akışını manuel (`workflow_dispatch`) tetikleyerek yeni OAuth2 kimlik bilgileriyle veri çekiminin başarılı olduğunu ve `CI` iş akışındaki `Gitleaks` adımının yeşil geçtiğini doğrulayın.

---

### Senaryo B: OpenSky API Kesintisi, `HTTP 429` Kota Aşımı veya Bozuk Veri Yayını (P2 / P3)

**Belirtiler / Tespit:**
- `Fetch OpenSky Data` GitHub Actions iş akışının kırmızı (başarısız) sonuçlanması.
- Canlı arayüzde `Veri Çekim Hatası (HTTP_429 / TIMEOUT / NETWORK_ERROR)` veya `Eski Veri Uyarısı` bandının görünmesi.

**Otomatik Koruma Davranışı (Kodda Mevcut):**
- `scripts/fetch-opensky.mjs` hata anında son başarılı `latest.json` ve `snapshots.json` dosyalarını **silmez**; `snapshots.json` içine sahte canlı ölçüm eklemez.
- Yalnızca `lastAttempt` alanını günceller ve CI izlemesi için `exit code 1` döndürür.
- `scripts/compare-data.mjs` yalnızca `lastAttempt.timestamp` veya `lastAttempt.message` değişmişse `data` dalına gereksiz commit atılmasını önler.

**Müdahale Adımları:**
1. **Teşhis:**
   - GitHub Actions → `Fetch OpenSky Data` son çalışma günlüğünü (log) inceleyin.
   - Hata türü `HTTP_429` ise: `OPENSKY_CLIENT_ID` ve `OPENSKY_CLIENT_SECRET` GitHub Secrets değerlerinin doğru tanımlandığını kontrol edin (anonim mod paylaşımlı GitHub Actions IP'lerinde kota sınırına daha hızlı takılır).
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

### Senaryo C: Yüksek/Kritik Bağımlılık Zafiyeti veya Tedarik Zinciri Uyarısı (P2)

**Belirtiler / Tespit:**
- `.github/workflows/ci.yml` içindeki `npm audit --audit-level=high` adımının başarısız olması.
- `.github/dependabot.yml` tarafından açılan güvenlik güncellemesi Pull Request'i.

**Müdahale Adımları:**
1. **Analiz:**
   - Yerel terminalde `npm audit` komutunu çalıştırarak etkilenen paketi, zafiyet şiddetini ve çalışma zamanı (`dependencies`) mı yoksa derleme zamanı (`devDependencies`) mı olduğunu belirleyin.
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

### Senaryo D: Canlı Arayüz (`pages.dev`) Erişim Sorunu, Kazıma (Scraping) veya Güvenlik Başlığı İhlali (P2 / P3)

**Mimari Gerçek:**
- Canlı arayüz (`https://ege-hava-sahasi-canli.pages.dev/`) statik bir uygulamadır ve uçuş verisini `raw.githubusercontent.com` üzerinden okur. Bu nedenle **sayfaya yönelik yoğun HTTP istekleri veya sayfa kazıması (scraping) OpenSky API kotasını doğrudan tüketmez**.

**Müdahale Adımları:**
1. **Hatalı Dağıtımı Geri Alma (Cloudflare Pages Rollback):**
   - Yeni bir derleme arayüzü veya `_headers` kurallarını bozduysa Cloudflare Dashboard → **Workers & Pages** → `ege-hava-sahasi-canli` → **Deployments** sekmesinden bir önceki başarılı dağıtım için **Rollback to this deployment** seçeneğini kullanın.
2. **Güvenlik Başlıklarını ve `security.txt` Dosyasını Doğrulama:**
   ```bash
   curl -sI https://ege-hava-sahasi-canli.pages.dev/
   curl -sI https://ege-hava-sahasi-canli.pages.dev/.well-known/security.txt
   ```
   Yanıtlarda `Strict-Transport-Security: max-age=31536000`, `Content-Security-Policy`, `X-Content-Type-Options: nosniff` ve `X-Frame-Options: DENY` başlıklarının döndüğünü doğrulayın.
3. **İstenmeyen Trafik / Rate Limiting:**
   - `*.pages.dev` varsayılan alt alan adında Cloudflare Zone tabanlı özel WAF/Rate-Limit kuralları kısıtlı olduğundan, gelişmiş WAF kuralları gerekiyorsa projeye Cloudflare Zone üzerinde özel bir alan adı (custom domain) bağlayarak Security → WAF üzerinden hız sınırlama (rate limiting) kuralı tanımlayın.

---

## 3. Gerçek Olay Kayıt Şablonu (Incident Log Template)

> *Not: Aşağıdaki tablo yalnızca gerçek bir olay yaşandığında doldurulmak üzere boş bırakılmıştır; kurgusal olay kaydı girilmemiştir.*

| Olay No | Tarih / Saat (UTC) | Seviye (P1-P3) | Tespit Yöntemi | Kök Neden | Uygulanan Müdahale | Durum / Kapanış Tarihi |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| *(Boş)* | *(YYYY-AA-GG SS:DD)* | *(P1/P2/P3)* | *(Gitleaks / CI / Manuel)* | *(Açıklama)* | *(Alınan aksiyon)* | *(Açık / Kapalı)* |
