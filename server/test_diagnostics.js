import { buildOverpassQuery, getBoundingBox } from './services/osmService.js';

const coords = [
  [72.565, 23.015],
  [72.580, 23.015],
  [72.580, 23.030],
  [72.565, 23.030],
  [72.565, 23.015]
];

const bbox = getBoundingBox(coords);
console.log('BBox:', bbox);

const query = buildOverpassQuery(bbox, ['buildings', 'roads', 'water', 'waterways', 'railways', 'pois']);
console.log('Query length:', query.length);
console.log('Query:\n', query);

const endpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

for (const url of endpoints) {
  console.log(`\nTesting endpoint: ${url}...`);
  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const params = new URLSearchParams();
    params.append('data', query);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'SatQuery-AI/1.0',
      },
      body: params.toString(),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const duration = Date.now() - t0;
    console.log(`Status: ${res.status} in ${duration}ms`);
    const text = await res.text();
    console.log(`Response length: ${text.length} chars. Preview: ${text.slice(0, 150)}`);
  } catch (err) {
    const duration = Date.now() - t0;
    console.log(`Failed on ${url} in ${duration}ms: ${err.message}`);
  }
}
