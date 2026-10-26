import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(ROOT_DIR, 'scripts', 'fetch-opensky.mjs');

function runFetchScript(envOverrides) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [SCRIPT_PATH],
      {
        cwd: ROOT_DIR,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          ...envOverrides
        }
      },
      (error, stdout, stderr) => {
        resolve({
          exitCode: error ? error.code ?? 1 : 0,
          stdout,
          stderr
        });
      }
    );
  });
}

test('fetch-opensky: İlk çalıştırmada API başarısızsa açık DEMO etiketi, tek snapshot ve sıfır olmayan çıkış kodu', async () => {
  const tempDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ege-demo-fallback-test-'));

  try {
    const failedFirstRun = await runFetchScript({
      OPENSKY_DATA_DIR: tempDataDir,
      OPENSKY_API_URL: 'http://127.0.0.1:1/api/states/all',
      OPENSKY_TOKEN_URL: 'http://127.0.0.1:1/token'
    });

    assert.equal(failedFirstRun.exitCode, 1, 'İlk çalıştırmada hata olduğunda çıkış kodu 1 olmalı');

    const latestRaw = await fs.readFile(path.join(tempDataDir, 'latest.json'), 'utf8');
    const snapsRaw = await fs.readFile(path.join(tempDataDir, 'snapshots.json'), 'utf8');
    const latest = JSON.parse(latestRaw);
    const snaps = JSON.parse(snapsRaw);

    assert.equal(latest.isDemo, true, 'Demo yedek verisi isDemo: true olmalı');
    assert.equal(latest.source, 'demo-fallback', 'Kaynak demo-fallback olarak işaretlenmeli');
    assert.ok(
      latest.aircraft.every((a) => a.callsign.includes('[DEMO]')),
      'Tüm demo uçak çağrı adları [DEMO] etiketi içermeli'
    );
    assert.equal(latest.lastAttempt.status, 'error');
    assert.equal(latest.lastAttempt.errorType, 'NETWORK_ERROR');

    assert.equal(snaps.isDemo, true, 'Snapshots dokümanı isDemo: true olmalı');
    assert.equal(snaps.totalSnapshots, 1, 'Yapay geçmiş üretilmeden yalnızca 1 demo snapshot oluşturulmalı');
    assert.equal(snaps.snapshots.length, 1);
    assert.equal(snaps.snapshots[0].isDemo, true);
  } finally {
    await fs.rm(tempDataDir, { recursive: true, force: true });
  }
});

test('fetch-opensky: OAuth2, Anonim Mod, Yeni Snapshot Eklenmesi, HTTP 429, Bağlantı Hatası ve Gizli Bilgi Sızıntı Önleme', async () => {
  const tempDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ege-opensky-suite-'));

  const tokenRequests = [];
  const statesRequests = [];
  let nextStatesMode = 'oauth-ok';

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');

    if (
      req.method === 'POST' &&
      url.pathname === '/auth/realms/opensky-network/protocol/openid-connect/token'
    ) {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        tokenRequests.push({
          headers: req.headers,
          body
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: 'mock-jwt-token-xyz-987', expires_in: 1800 }));
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/states/all') {
      statesRequests.push({
        headers: req.headers,
        search: url.search
      });

      if (nextStatesMode === 'http-429') {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'X-Rate-Limit-Retry-After-Seconds': '90'
        });
        res.end(JSON.stringify({ message: 'Too many requests' }));
        return;
      }

      const states =
        nextStatesMode === 'oauth-ok'
          ? [
              [
                '4baa11',
                'THY101  ',
                'Turkey',
                1729880000,
                1729880001,
                27.15,
                38.42,
                9144,
                false,
                230.0,
                180.0,
                0.0,
                null,
                9300,
                '2140',
                false,
                0
              ],
              [
                '4682b2',
                'AEE202  ',
                'Greece',
                1729880000,
                1729880001,
                25.5,
                38.1,
                10363,
                false,
                240.0,
                90.0,
                1.2,
                null,
                10500,
                '1020',
                false,
                0
              ]
            ]
          : [
              [
                '4baa11',
                'THY101  ',
                'Turkey',
                1729880100,
                1729880101,
                27.2,
                38.45,
                9200,
                false,
                232.0,
                182.0,
                0.0,
                null,
                9350,
                '2140',
                false,
                0
              ],
              [
                '4682b2',
                'AEE202  ',
                'Greece',
                1729880100,
                1729880101,
                25.55,
                38.12,
                10400,
                false,
                241.0,
                91.0,
                0.5,
                null,
                10550,
                '1020',
                false,
                0
              ],
              [
                '3c6544',
                'DLH303  ',
                'Germany',
                1729880100,
                1729880101,
                26.2,
                39.48,
                11200,
                false,
                250.0,
                160.0,
                0.0,
                null,
                11350,
                '5412',
                false,
                0
              ]
            ];

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ time: 1729880100, states }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const tokenUrl = `${baseUrl}/auth/realms/opensky-network/protocol/openid-connect/token`;
  const apiUrl = `${baseUrl}/api/states/all`;

  try {
    // a & f. OAuth2 client_credentials token isteği, Bearer kullanımı ve gizli bilgilerin sızmaması
    nextStatesMode = 'oauth-ok';
    const oauthRun = await runFetchScript({
      OPENSKY_DATA_DIR: tempDataDir,
      OPENSKY_TOKEN_URL: tokenUrl,
      OPENSKY_API_URL: apiUrl,
      OPENSKY_CLIENT_ID: 'my-opensky-client',
      OPENSKY_CLIENT_SECRET: 'TOP_SECRET_CREDENTIAL_VALUE'
    });

    assert.equal(oauthRun.exitCode, 0, 'OAuth2 başarılı çekimde çıkış kodu 0 olmalı');
    assert.equal(tokenRequests.length, 1, 'OAuth2 token uç noktasına 1 POST isteği atılmalı');
    assert.match(
      tokenRequests[0].headers['content-type'] || '',
      /application\/x-www-form-urlencoded/i
    );
    assert.equal(
      tokenRequests[0].body,
      'grant_type=client_credentials&client_id=my-opensky-client&client_secret=TOP_SECRET_CREDENTIAL_VALUE'
    );
    assert.equal(statesRequests.length, 1);
    assert.equal(statesRequests[0].headers.authorization, 'Bearer mock-jwt-token-xyz-987');
    assert.equal(statesRequests[0].search, '?lamin=36.5&lomin=24.5&lamax=40.5&lomax=30.5');

    const latestAfterOauthRaw = await fs.readFile(path.join(tempDataDir, 'latest.json'), 'utf8');
    const snapsAfterOauthRaw = await fs.readFile(path.join(tempDataDir, 'snapshots.json'), 'utf8');

    assert.ok(!oauthRun.stdout.includes('TOP_SECRET_CREDENTIAL_VALUE'));
    assert.ok(!oauthRun.stderr.includes('TOP_SECRET_CREDENTIAL_VALUE'));
    assert.ok(!oauthRun.stdout.includes('mock-jwt-token-xyz-987'));
    assert.ok(!oauthRun.stderr.includes('mock-jwt-token-xyz-987'));
    assert.ok(!latestAfterOauthRaw.includes('TOP_SECRET_CREDENTIAL_VALUE'));
    assert.ok(!latestAfterOauthRaw.includes('mock-jwt-token-xyz-987'));
    assert.ok(!snapsAfterOauthRaw.includes('TOP_SECRET_CREDENTIAL_VALUE'));
    assert.ok(!snapsAfterOauthRaw.includes('mock-jwt-token-xyz-987'));

    const latestAfterOauth = JSON.parse(latestAfterOauthRaw);
    const snapsAfterOauth = JSON.parse(snapsAfterOauthRaw);
    assert.equal(latestAfterOauth.source, 'opensky-live');
    assert.equal(latestAfterOauth.isDemo, false);
    assert.equal(latestAfterOauth.aircraftCount, 2);
    assert.equal(snapsAfterOauth.totalSnapshots, 1);

    // b & d. Kimlik bilgileri yokken anonim erişim ve başarılı çekimde yeni snapshot eklenmesi
    nextStatesMode = 'anon-ok';
    const anonRun = await runFetchScript({
      OPENSKY_DATA_DIR: tempDataDir,
      OPENSKY_TOKEN_URL: tokenUrl,
      OPENSKY_API_URL: apiUrl
    });

    assert.equal(anonRun.exitCode, 0, 'Anonim başarılı çekimde çıkış kodu 0 olmalı');
    assert.equal(tokenRequests.length, 1, 'Anonim modda yeni token isteği gönderilmemeli');
    assert.equal(statesRequests.length, 2);
    assert.equal(statesRequests[1].headers.authorization, undefined);

    const latestAfterAnon = JSON.parse(
      await fs.readFile(path.join(tempDataDir, 'latest.json'), 'utf8')
    );
    const snapsAfterAnon = JSON.parse(
      await fs.readFile(path.join(tempDataDir, 'snapshots.json'), 'utf8')
    );
    assert.equal(latestAfterAnon.aircraftCount, 3);
    assert.equal(
      snapsAfterAnon.totalSnapshots,
      2,
      'Başarılı veri çekiminde geçmiş korunarak yeni snapshot eklenmeli'
    );
    const savedFetchedAt = latestAfterAnon.fetchedAt;

    // c. HTTP 429 durumunda sıfır olmayan çıkış kodu, son başarılı verinin korunması ve sahte snapshot eklenmemesi
    nextStatesMode = 'http-429';
    const rateLimitRun = await runFetchScript({
      OPENSKY_DATA_DIR: tempDataDir,
      OPENSKY_TOKEN_URL: tokenUrl,
      OPENSKY_API_URL: apiUrl
    });

    assert.equal(
      rateLimitRun.exitCode,
      1,
      'HTTP 429 durumunda sıfır olmayan çıkış kodu (1) dönmeli'
    );
    const latestAfter429 = JSON.parse(
      await fs.readFile(path.join(tempDataDir, 'latest.json'), 'utf8')
    );
    const snapsAfter429 = JSON.parse(
      await fs.readFile(path.join(tempDataDir, 'snapshots.json'), 'utf8')
    );
    assert.equal(
      latestAfter429.fetchedAt,
      savedFetchedAt,
      'HTTP 429 hatasında son başarılı fetchedAt korunmalı'
    );
    assert.equal(
      latestAfter429.aircraftCount,
      3,
      'HTTP 429 hatasında son başarılı 3 uçak korunmalı'
    );
    assert.equal(latestAfter429.isDemo, false, 'Mevcut canlı veri demo ile ezilmemeli');
    assert.equal(latestAfter429.lastAttempt.status, 'error');
    assert.equal(latestAfter429.lastAttempt.errorType, 'HTTP_429');
    assert.equal(latestAfter429.lastAttempt.httpStatus, 429);
    assert.equal(
      snapsAfter429.totalSnapshots,
      2,
      'Hata durumunda yeni sahte canlı snapshot oluşmamalı'
    );

    // c (devam). Bağlantı hatasında (NETWORK_ERROR) sıfır olmayan çıkış kodu ve verinin korunması
    const netErrRun = await runFetchScript({
      OPENSKY_DATA_DIR: tempDataDir,
      OPENSKY_TOKEN_URL: 'http://127.0.0.1:1/token',
      OPENSKY_API_URL: 'http://127.0.0.1:1/api/states/all'
    });

    assert.equal(netErrRun.exitCode, 1, 'Ağ hatasında sıfır olmayan çıkış kodu (1) dönmeli');
    const latestAfterNetErr = JSON.parse(
      await fs.readFile(path.join(tempDataDir, 'latest.json'), 'utf8')
    );
    const snapsAfterNetErr = JSON.parse(
      await fs.readFile(path.join(tempDataDir, 'snapshots.json'), 'utf8')
    );
    assert.equal(
      latestAfterNetErr.fetchedAt,
      savedFetchedAt,
      'Ağ hatasında son başarılı fetchedAt korunmalı'
    );
    assert.equal(
      latestAfterNetErr.aircraftCount,
      3,
      'Ağ hatasında son başarılı uçaklar korunmalı'
    );
    assert.equal(latestAfterNetErr.lastAttempt.status, 'error');
    assert.equal(latestAfterNetErr.lastAttempt.errorType, 'NETWORK_ERROR');
    assert.equal(
      snapsAfterNetErr.totalSnapshots,
      2,
      'Ağ hatasında snapshot sayısı değişmemeli'
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tempDataDir, { recursive: true, force: true });
  }
});
