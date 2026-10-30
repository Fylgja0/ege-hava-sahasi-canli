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

- Bu komutların yerel ortamda çalıştırılmasıyla elde edilen gerçek terminal çıktıları [`local-verification-output.txt`](local-verification-output.txt) dosyasında kayıtlıdır:
  - `npm test`: `11/11` test başarılı (`compare-data`, `fetch-opensky`, `security-config`).
  - `npm audit --audit-level=high`: `found 0 vulnerabilities`.
  - `npm run build`: `tsc --noEmit && vite build` (`dist/_headers` ve `dist/.well-known/security.txt` dosyalarının üretildiği doğrulandı).

---

## 2. Dış Araç ve Hesap Paneli Kanıtlarını Kaydetme Kılavuzu

Aşağıdaki kanıtlar, son yerel değişiklikler `main` dalına push edilip Cloudflare Pages üzerinde yayınlandıktan sonra üretilmeli ve bu dizine kaydedilmelidir. Henüz çalıştırılmamış dış testlerin sonuç alanları **bilinçli olarak boş** bırakılmıştır.

### 2.1. Lighthouse Mobil Denetimi (`https://ege-hava-sahasi-canli.pages.dev/`)
- **Nasıl Alınır:**
  1. Google Chrome Gizli Sekmede (uzantılar kapalıyken) `https://ege-hava-sahasi-canli.pages.dev/` adresini açın.
  2. **DevTools (F12) → Lighthouse** sekmesine geçin.
  3. **Mode:** `Navigation`, **Device:** `Mobile`, **Categories:** `Performance`, `Accessibility`, `Best Practices`, `SEO` seçin ve **Analyze page load** düğmesine tıklayın.
  4. Raporu `docs/evidence/lighthouse-mobile.html` (veya `.json` / ekran görüntüsü `lighthouse-mobile.png`) olarak kaydedin.
- **Gerçek Sonuç Özeti (Test Sonrası Doldurulacak):**
  - Performans (Performance): `[Boş — Gerçek ölçüm sonrası yazılacak]`
  - Erişilebilirlik (Accessibility): `[Boş — Gerçek ölçüm sonrası yazılacak]`
  - En İyi Uygulamalar (Best Practices): `[Boş — Gerçek ölçüm sonrası yazılacak]`
  - SEO: `[Boş — Gerçek ölçüm sonrası yazılacak]`

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
- **Kaydedilecek Dosyalar:**
  - `docs/evidence/zap-baseline-before.md` *(Önceki sürüm taraması varsa)*
  - `docs/evidence/zap-baseline-after.md` *(HSTS, CSP ve `security.txt` dağıtımı sonrası gerçek rapor)*
- **Gerçek Sonuç Özeti (Test Sonrası Doldurulacak):**
  - PASS / WARN / FAIL sayıları: `[Boş — Gerçek ZAP baseline çalıştırması sonrası doldurulacak]`

---

### 2.3. HTTP Güvenlik Başlıkları ve `/.well-known/security.txt` Yanıtı
- **Mevcut Canlı Durum (Dağıtım Öncesi Gerçek Test — 2026-10-30):**
  - Yerel derlemede `dist/_headers` içinde `Strict-Transport-Security: max-age=31536000` ve `dist/.well-known/security.txt` dosyası hazırlandı.
  - Ancak değişiklikler henüz `git push` ile canlı ortama gönderilmediği için `https://ege-hava-sahasi-canli.pages.dev/.well-known/security.txt` şu anda Cloudflare Pages SPA yedeklemesi (fallback) nedeniyle `index.html` döndürmektedir.
- **Dağıtım Sonrası Doğrulama Komutları:**
  ```bash
  curl -sI https://ege-hava-sahasi-canli.pages.dev/ > docs/evidence/http-headers-prod.txt
  curl -si https://ege-hava-sahasi-canli.pages.dev/.well-known/security.txt > docs/evidence/security-txt-prod.txt
  ```
- **Gerçek Sonuç Özeti (Dağıtım Sonrası Doldurulacak):**
  - `Strict-Transport-Security: max-age=31536000` doğrulandı mı?: `[Boş — Deploy sonrası doldurulacak]`
  - `/.well-known/security.txt` `200 OK` ve `text/plain` döndürüyor mu?: `[Boş — Deploy sonrası doldurulacak]`

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
