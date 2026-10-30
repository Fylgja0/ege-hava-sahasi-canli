import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('security-config: public/_headers HSTS (max-age=31536000, includeSubDomains olmadan) ve mevcut güvenlik başlıklarını korur', async () => {
  const headersRaw = await fs.readFile(path.join(ROOT_DIR, 'public', '_headers'), 'utf8');

  assert.match(
    headersRaw,
    /^\s*Strict-Transport-Security:\s*max-age=31536000\s*$/m,
    'Strict-Transport-Security: max-age=31536000 satırı bulunmalı'
  );
  assert.ok(
    !headersRaw.includes('includeSubDomains'),
    'Strict-Transport-Security içinde includeSubDomains bulunmamalı'
  );
  assert.ok(headersRaw.includes('X-Content-Type-Options: nosniff'));
  assert.ok(headersRaw.includes('Referrer-Policy: strict-origin-when-cross-origin'));
  assert.ok(headersRaw.includes('X-Frame-Options: DENY'));
  assert.ok(headersRaw.includes('Permissions-Policy: geolocation=(), camera=(), microphone=()'));
  assert.ok(headersRaw.includes("Content-Security-Policy: default-src 'self'; script-src 'self';"));
});

test('security-config: public/.well-known/security.txt RFC 9116 alanlarını içerir ve uydurma e-posta içermez', async () => {
  const securityTxt = await fs.readFile(
    path.join(ROOT_DIR, 'public', '.well-known', 'security.txt'),
    'utf8'
  );

  assert.match(securityTxt, /^Contact:\s*https:\/\/github\.com\/Fylgja0\/ege-hava-sahasi-canli\//m);
  assert.match(securityTxt, /^Expires:\s*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/m);
  assert.match(securityTxt, /^Preferred-Languages:\s*tr,\s*en$/m);
  assert.ok(
    !securityTxt.includes('mailto:'),
    'security.txt içinde doğrulanmamış veya uydurma mailto: adresi yer almamalı'
  );
});

test('security-config: Dependabot ve Gitleaks CI yapılandırmaları doğrulanmış SHA ve haftalık takvimle tanımlıdır', async () => {
  const dependabotYml = await fs.readFile(
    path.join(ROOT_DIR, '.github', 'dependabot.yml'),
    'utf8'
  );
  const ciYml = await fs.readFile(
    path.join(ROOT_DIR, '.github', 'workflows', 'ci.yml'),
    'utf8'
  );

  assert.ok(dependabotYml.includes('package-ecosystem: "npm"'));
  assert.ok(dependabotYml.includes('package-ecosystem: "github-actions"'));
  assert.ok(dependabotYml.includes('interval: "weekly"'));

  assert.ok(
    ciYml.includes('gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e'),
    'Gitleaks resmi action tam commit SHA (v3.0.0) ile sabitlenmeli'
  );
  assert.ok(ciYml.includes('fetch-depth: 0'));
  assert.ok(
    !ciYml.includes('secrets.OPENSKY_'),
    'CI iş akışı fork/PR senaryolarında OpenSky gizli anahtarlarına ihtiyaç duymamalı'
  );
});

test('security-config: Sahte test değerleriyle gizli bilgi sızıntı kontrolü ve ara kontrol etiketi temizliği', async () => {
  const fakeTestClientId = 'FAKE_TEST_ONLY_OPENSKY_ID_0000';
  const fakeTestClientSecret = 'FAKE_TEST_ONLY_OPENSKY_SECRET_0000';

  const indexHtml = await fs.readFile(path.join(ROOT_DIR, 'index.html'), 'utf8');
  const readmeMd = await fs.readFile(path.join(ROOT_DIR, 'README.md'), 'utf8');

  assert.ok(!indexHtml.includes(fakeTestClientId));
  assert.ok(!indexHtml.includes(fakeTestClientSecret));
  assert.ok(
    !indexHtml.includes('İlk Ara Kontrol Sürümü'),
    'index.html içinde eski İlk Ara Kontrol Sürümü etiketi kalmamalı'
  );
  assert.ok(
    !readmeMd.includes('İlk Ara Kontrol ve Canlıya Çıkış Hazırlık Sürümü'),
    'README.md içinde eski İlk Ara Kontrol alt başlığı kalmamalı'
  );
});

test('security-config: DFD_STRIDE.md 10 ayrı tehdit senaryosu (T-01..T-10), risk eşikleri ve T-08 bot/scraper analizi içerir', async () => {
  const dfdStride = await fs.readFile(path.join(ROOT_DIR, 'docs', 'DFD_STRIDE.md'), 'utf8');
  const runbook = await fs.readFile(
    path.join(ROOT_DIR, 'docs', 'incident-response-runbook.md'),
    'utf8'
  );
  const readme = await fs.readFile(path.join(ROOT_DIR, 'README.md'), 'utf8');

  for (let i = 1; i <= 10; i += 1) {
    const threatId = `T-${String(i).padStart(2, '0')}`;
    assert.ok(dfdStride.includes(threatId), `DFD_STRIDE.md içinde ${threatId} senaryosu bulunmalı`);
    assert.ok(
      runbook.includes(threatId),
      `incident-response-runbook.md içinde ${threatId} referansı bulunmalı`
    );
  }

  assert.ok(dfdStride.includes('Düşük Risk (`1 – 5`)'));
  assert.ok(dfdStride.includes('Orta Risk (`6 – 12`)'));
  assert.ok(dfdStride.includes('Yüksek Risk (`13 – 25`)'));
  assert.ok(dfdStride.includes('ölçülmüş kesin gerçekler değildir'));
  assert.ok(dfdStride.includes('Özel Atanmış Tehdit İncelemesi: Bot / Scraper Kaynaklı Hizmet Tüketimi (`T-08`)'));
  assert.ok(readme.includes('kesin 30 dakikalık veri tazeliği garantisi vermez'));
});
