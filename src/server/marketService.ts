import { db } from './db.ts';

export interface MarketPriceRecord {
  id: number | string;
  apmc_name: string;
  apmc_name_kn: string;
  district: string;
  crop_code: string;
  crop_name_en: string;
  crop_name_kn: string;
  variety: string;
  min_price: number;
  max_price: number;
  modal_price: number;
  unit: string;
  reported_date: string;
  trend: 'up' | 'down' | 'stable';
  source_name: string;
  source_url?: string;
  data_mode: 'live' | 'cached' | 'fallback' | 'admin_verified';
}

export interface MarketPricesPayload {
  prices: MarketPriceRecord[];
  feed_status: 'live' | 'cached' | 'fallback';
  provider: string;
  source_url: string;
  last_updated: string;
  live_count: number;
  cached_count: number;
  fallback_count: number;
  target_markets: string[];
  missing_live_targets: string[];
  api_configured: boolean;
  error_message?: string;
  source_note_en: string;
  source_note_kn: string;
}

const CACHE_KEY = 'karnataka_apmc_live_v1';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export const TARGET_KARNATAKA_MARKETS = [
  'Sira APMC',
  'Tumakuru APMC',
  'Tiptur APMC',
  'Yeshwanthpur APMC',
  'Kolar APMC',
  'Mandya APMC',
];

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

const CROP_META: Record<string, { en: string; kn: string }> = {
  ragi: { en: 'Ragi (Finger Millet)', kn: 'ರಾಗಿ' },
  groundnut: { en: 'Groundnut (Pods/Seed)', kn: 'ಶೇಂಗಾ' },
  red_gram: { en: 'Red Gram (Tur)', kn: 'ತೊಗರಿ' },
  maize: { en: 'Maize', kn: 'ಮೆಕ್ಕೆಜೋಳ' },
  paddy: { en: 'Paddy', kn: 'ಭತ್ತ' },
  onion: { en: 'Onion', kn: 'ಈರುಳ್ಳಿ' },
  tomato: { en: 'Tomato', kn: 'ಟೊಮೆಟೊ' },
  coconut: { en: 'Coconut', kn: 'ತೆಂಗಿನಕಾಯಿ' },
  copra: { en: 'Copra', kn: 'ಕೊಬ್ಬರಿ' },
  horse_gram: { en: 'Horse Gram (Kulthi)', kn: 'ಹುರುಳಿ' },
  jaggery: { en: 'Jaggery', kn: 'ಬೆಲ್ಲ' },
  beans: { en: 'Beans', kn: 'ಹುರುಳಿಕಾಯಿ (ಬೀನ್ಸ್)' },
  potato: { en: 'Potato', kn: 'ಆಲೂಗಡ್ಡೆ' },
  green_gram: { en: 'Green Gram (Moong)', kn: 'ಹೆಸರು ಕಾಳು' },
  black_gram: { en: 'Black Gram (Urad)', kn: 'ಉದ್ದಿನ ಕಾಳು' },
  arecanut: { en: 'Arecanut', kn: 'ಅಡಿಕೆ' },
};

const APMC_KN_MAP: Array<[RegExp, string]> = [
  [/\bSira\b/i, 'ಸಿರಾ ಎಪಿಎಂಸಿ'],
  [/\bTumakuru\b|\bTumkur\b/i, 'ತುಮಕೂರು ಎಪಿಎಂಸಿ'],
  [/\bTiptur\b/i, 'ತಿಪಟೂರು ಎಪಿಎಂಸಿ'],
  [/\bGubbi\b/i, 'ಗುಬ್ಬಿ ಎಪಿಎಂಸಿ'],
  [/\bYeshwanthpur\b/i, 'ಯಶವಂತಪುರ ಎಪಿಎಂಸಿ'],
  [/Binny Mill.*Bengaluru/i, 'ಬಿನ್ನಿ ಮಿಲ್ ಬೆಂಗಳೂರು ಎಪಿಎಂಸಿ'],
  [/\bBengaluru\b|\bBangalore\b/i, 'ಬೆಂಗಳೂರು ಎಪಿಎಂಸಿ'],
  [/\bBangarpet\b/i, 'ಬಂಗಾರಪೇಟೆ ಎಪಿಎಂಸಿ'],
  [/\bMalur\b/i, 'ಮಾಲೂರು ಎಪಿಎಂಸಿ'],
  [/\bKolar\b/i, 'ಕೋಲಾರ ಎಪಿಎಂಸಿ'],
  [/\bPandavapura\b/i, 'ಪಾಂಡವಪುರ ಎಪಿಎಂಸಿ'],
  [/\bMandya\b/i, 'ಮಂಡ್ಯ ಎಪಿಎಂಸಿ'],
  [/\bHiriyur\b/i, 'ಹಿರಿಯೂರು ಎಪಿಎಂಸಿ'],
  [/\bChannagiri\b/i, 'ಚನ್ನಗಿರಿ ಎಪಿಎಂಸಿ'],
  [/\bHarihara\b/i, 'ಹರಿಹರ ಎಪಿಎಂಸಿ'],
  [/\bGangavathi\b/i, 'ಗಂಗಾವತಿ ಎಪಿಎಂಸಿ'],
  [/\bKalaburagi\b/i, 'ಕಲಬುರಗಿ ಎಪಿಎಂಸಿ'],
  [/\bHanagal\b/i, 'ಹಾನಗಲ್ ಎಪಿಎಂಸಿ'],
  [/\bHaveri\b/i, 'ಹಾವೇರಿ ಎಪಿಎಂಸಿ'],
  [/\bChamarajanagar\b/i, 'ಚಾಮರಾಜನಗರ ಎಪಿಎಂಸಿ'],
  [/\bRamanagara\b/i, 'ರಾಮನಗರ ಎಪಿಎಂಸಿ'],
  [/\bBagepalli\b/i, 'ಬಾಗೇಪಲ್ಲಿ ಎಪಿಎಂಸಿ'],
  [/\bBelgaum\b|\bBelagavi\b/i, 'ಬೆಳಗಾವಿ ಎಪಿಎಂಸಿ'],
  [/\bSindhanur\b/i, 'ಸಿಂಧನೂರು ಎಪಿಎಂಸಿ'],
  [/\bHolalkere\b/i, 'ಹೊಳಲ್ಕೆರೆ ಎಪಿಎಂಸಿ'],
];

function toKannadaApmc(name: string): string {
  for (const [rx, kn] of APMC_KN_MAP) {
    if (rx.test(name)) return kn;
  }
  return name.replace(/APMC/i, 'ಎಪಿಎಂಸಿ');
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&ndash;|&#8211;/g, '–')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRupee(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const val = Number(cleaned);
  return Number.isFinite(val) ? Math.round(val) : 0;
}

export function parseDateToIso(text: string): string | null {
  const m = text.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})\b/i);
  if (m) {
    const day = m[1].padStart(2, '0');
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${day}`;
  }
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const dmy = text.match(/\b(\d{2})[-/](\d{2})[-/](20\d{2})\b/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return null;
}

function inferCropCode(rawName: string): { code: string; en: string; kn: string } {
  const low = rawName.toLowerCase();
  if (low.includes('ragi') || low.includes('finger millet')) return { code: 'ragi', ...CROP_META.ragi };
  if (low.includes('groundnut') || low.includes('ground nut') || low.includes('peanut')) return { code: 'groundnut', ...CROP_META.groundnut };
  if (low.includes('arhar') || low.includes('tur') || low.includes('pigeon pea') || low.includes('red gram')) return { code: 'red_gram', ...CROP_META.red_gram };
  if (low.includes('maize')) return { code: 'maize', ...CROP_META.maize };
  if (low.includes('paddy')) return { code: 'paddy', ...CROP_META.paddy };
  if (low.includes('onion')) return { code: 'onion', ...CROP_META.onion };
  if (low.includes('tomato')) return { code: 'tomato', ...CROP_META.tomato };
  if (low.includes('copra')) return { code: 'copra', ...CROP_META.copra };
  if (low.includes('coconut')) return { code: 'coconut', ...CROP_META.coconut };
  if (low.includes('horse gram') || low.includes('kulthi')) return { code: 'horse_gram', ...CROP_META.horse_gram };
  if (low.includes('jaggery')) return { code: 'jaggery', ...CROP_META.jaggery };
  if (low.includes('beans')) return { code: 'beans', ...CROP_META.beans };
  if (low.includes('potato')) return { code: 'potato', ...CROP_META.potato };
  if (low.includes('green gram') || low.includes('moong')) return { code: 'green_gram', ...CROP_META.green_gram };
  if (low.includes('black gram') || low.includes('urad')) return { code: 'black_gram', ...CROP_META.black_gram };
  if (low.includes('arecanut') || low.includes('supari')) return { code: 'arecanut', ...CROP_META.arecanut };
  const cleanCode = low.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'other';
  return { code: cleanCode, en: rawName, kn: rawName };
}

function inferTrendFromHtml(html: string): 'up' | 'down' | 'stable' {
  const m = html.match(/vs\s+7-day\s+avg[\s\S]{0,120}?([+-−]\d+(?:\.\d+)?)%/i);
  if (!m) return 'stable';
  const numStr = m[1].replace('−', '-');
  const val = Number(numStr);
  if (!Number.isFinite(val)) return 'stable';
  if (val >= 2) return 'up';
  if (val <= -2) return 'down';
  return 'stable';
}

interface FeedTarget {
  url: string;
  kind: 'commodity' | 'market';
  cropCode?: string;
  defaultDistrict?: string;
  defaultApmcName?: string;
}

const PUBLIC_FEED_TARGETS: FeedTarget[] = [
  // Core Karnataka crop feeds
  { url: 'https://www.maikisaan.com/mandi-bhav/ragi/karnataka/', kind: 'commodity', cropCode: 'ragi' },
  { url: 'https://www.maikisaan.com/mandi-bhav/groundnut-peanut/karnataka/', kind: 'commodity', cropCode: 'groundnut' },
  { url: 'https://www.maikisaan.com/mandi-bhav/pigeon-pea-arhartur/karnataka/', kind: 'commodity', cropCode: 'red_gram' },
  { url: 'https://www.maikisaan.com/mandi-bhav/maize/karnataka/', kind: 'commodity', cropCode: 'maize' },
  { url: 'https://www.maikisaan.com/mandi-bhav/paddy/karnataka/', kind: 'commodity', cropCode: 'paddy' },
  { url: 'https://www.maikisaan.com/mandi-bhav/onion/karnataka/', kind: 'commodity', cropCode: 'onion' },
  { url: 'https://www.maikisaan.com/mandi-bhav/tomato/karnataka/', kind: 'commodity', cropCode: 'tomato' },
  { url: 'https://www.maikisaan.com/mandi-bhav/copra/karnataka/', kind: 'commodity', cropCode: 'copra' },
  { url: 'https://www.maikisaan.com/mandi-bhav/coconut/karnataka/', kind: 'commodity', cropCode: 'coconut' },
  // Tumakuru, Bengaluru/Yeshwanthpur, Kolar, Mandya district & yard feeds
  { url: 'https://www.maikisaan.com/mandi-bhav/horse-gram-kulthi/karnataka/tumakuru/', kind: 'commodity', cropCode: 'horse_gram', defaultDistrict: 'Tumakuru' },
  { url: 'https://www.maikisaan.com/mandi-bhav/ragi/karnataka/tumakuru/', kind: 'commodity', cropCode: 'ragi', defaultDistrict: 'Tumakuru' },
  { url: 'https://www.maikisaan.com/mandi-bhav/copra/karnataka/tumakuru/', kind: 'commodity', cropCode: 'copra', defaultDistrict: 'Tumakuru' },
  { url: 'https://www.maikisaan.com/mandi-bhav/tomato/karnataka/tumakuru/', kind: 'commodity', cropCode: 'tomato', defaultDistrict: 'Tumakuru' },
  { url: 'https://www.maikisaan.com/mandi-bhav/ragi/karnataka/bengaluru/', kind: 'commodity', cropCode: 'ragi', defaultDistrict: 'Bengaluru' },
  { url: 'https://www.maikisaan.com/mandi-bhav/onion/karnataka/bengaluru/', kind: 'commodity', cropCode: 'onion', defaultDistrict: 'Bengaluru' },
  { url: 'https://www.maikisaan.com/mandi-bhav/tomato/karnataka/kolar/', kind: 'commodity', cropCode: 'tomato', defaultDistrict: 'Kolar' },
  { url: 'https://www.maikisaan.com/mandi-bhav/coconut/karnataka/mandya/', kind: 'commodity', cropCode: 'coconut', defaultDistrict: 'Mandya' },
  { url: 'https://www.maikisaan.com/mandi-bhav/market/karnataka/bengaluru/binny-mill-ff-v-bengaluru/', kind: 'market', defaultDistrict: 'Bengaluru', defaultApmcName: 'Binny Mill (FF&V) Bengaluru APMC' },
  { url: 'https://www.maikisaan.com/mandi-bhav/market/karnataka/kolar/bangarpet/', kind: 'market', defaultDistrict: 'Kolar', defaultApmcName: 'Bangarpet APMC' },
  { url: 'https://www.maikisaan.com/mandi-bhav/market/karnataka/kolar/malur/', kind: 'market', defaultDistrict: 'Kolar', defaultApmcName: 'Malur APMC' },
  { url: 'https://www.maikisaan.com/mandi-bhav/market/karnataka/mandya/pandavapura/', kind: 'market', defaultDistrict: 'Mandya', defaultApmcName: 'Pandavapura APMC' },
];

export function parseMaiKisaanHtml(html: string, target: FeedTarget): MarketPriceRecord[] {
  const tableMatch = html.match(/<table[^>]*class="[^"]*k-tbl[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return [];

  const tbodyMatch = tableMatch[1].match(/<tbody>([\s\S]*?)<\/tbody>/i);
  const bodyHtml = tbodyMatch ? tbodyMatch[1] : tableMatch[1];
  const trMatches = [...bodyHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (trMatches.length === 0) return [];

  const dateSources = [
    html.match(/All prices are for\s+([^<.<]+)/i)?.[1] || '',
    html.match(/Latest report\s+([^<.<]+)/i)?.[1] || '',
    html.match(/most recently on\s+([^<.<]+)/i)?.[1] || '',
    html.match(/reported[^<]{0,40}on\s+([^<.<]+)/i)?.[1] || '',
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '',
  ].join(' ');

  const reportedDate = parseDateToIso(stripTags(dateSources));
  if (!reportedDate) return [];

  const trend = inferTrendFromHtml(html);
  const results: MarketPriceRecord[] = [];

  for (let i = 0; i < trMatches.length; i++) {
    const tr = trMatches[i][1];
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);

    if (target.kind === 'commodity' && tds.length >= 6) {
      const mktRaw = tds[0].match(/class="k-mkt"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || tds[0];
      const smallRaw = tds[0].match(/class="k-small"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '';
      const apmcName = stripTags(mktRaw);
      if (!apmcName) continue;

      const smallText = stripTags(smallRaw);
      const districtFromSmall = smallText.includes(',') ? smallText.split(',')[0].trim() : '';
      const district = districtFromSmall || target.defaultDistrict || 'Karnataka';

      const variety = stripTags(tds[1]) || 'FAQ';
      const grade = stripTags(tds[2]);
      const minPrice = parseRupee(stripTags(tds[3]));
      const maxPrice = parseRupee(stripTags(tds[4]));
      const modalPrice = parseRupee(stripTags(tds[5]));
      if (modalPrice <= 0) continue;

      const cropKey = target.cropCode || 'other';
      const cropMeta = CROP_META[cropKey] || { en: cropKey, kn: cropKey };

      results.push({
        id: `live-${cropKey}-${apmcName.toLowerCase().replace(/[^a-z0-9]/g, '')}-${reportedDate}-${i}`,
        apmc_name: apmcName,
        apmc_name_kn: toKannadaApmc(apmcName),
        district,
        crop_code: cropKey,
        crop_name_en: cropMeta.en,
        crop_name_kn: cropMeta.kn,
        variety: grade && grade !== variety ? `${variety} (${grade})` : variety,
        min_price: minPrice || modalPrice,
        max_price: maxPrice || modalPrice,
        modal_price: modalPrice,
        unit: 'Quintal',
        reported_date: reportedDate,
        trend,
        source_name: 'Agmarknet via Mai Kisaan Public Feed',
        source_url: target.url,
        data_mode: 'live',
      });
    } else if (target.kind === 'market' && tds.length >= 4) {
      const cropName = stripTags(tds[0]);
      if (!cropName) continue;
      const inferred = inferCropCode(cropName);
      // Keep agriculturally relevant crops + local produce
      const modalPrice = parseRupee(stripTags(tds[1]));
      const rangeParts = stripTags(tds[3]).split(/[–-]/);
      const minPrice = parseRupee(rangeParts[0] || '') || modalPrice;
      const maxPrice = parseRupee(rangeParts[1] || '') || modalPrice;
      if (modalPrice <= 0) continue;

      const h1Text = stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
      const apmcMatch = h1Text.match(/^(.+?APMC)/i);
      const apmcName = apmcMatch?.[1] || target.defaultApmcName || 'Karnataka APMC';
      const district = target.defaultDistrict || 'Karnataka';

      results.push({
        id: `live-mkt-${inferred.code}-${apmcName.toLowerCase().replace(/[^a-z0-9]/g, '')}-${reportedDate}-${i}`,
        apmc_name: apmcName,
        apmc_name_kn: toKannadaApmc(apmcName),
        district,
        crop_code: inferred.code,
        crop_name_en: inferred.en,
        crop_name_kn: inferred.kn,
        variety: 'Market Lot / FAQ',
        min_price: minPrice,
        max_price: maxPrice,
        modal_price: modalPrice,
        unit: 'Quintal',
        reported_date: reportedDate,
        trend: 'stable',
        source_name: 'Agmarknet via Mai Kisaan Public Feed',
        source_url: target.url,
        data_mode: 'live',
      });
    }
  }

  return results;
}

async function fetchFromOptionalDataGov(
  apiKey: string,
  fetchImpl: typeof fetch
): Promise<MarketPriceRecord[]> {
  const url = `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?api-key=${encodeURIComponent(apiKey)}&format=json&limit=100&filters[state.keyword]=Karnataka`;
  const resp = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
  if (!resp.ok) throw new Error(`data.gov.in HTTP ${resp.status}`);
  const json = (await resp.json()) as {
    records?: Array<{
      market?: string;
      district?: string;
      commodity?: string;
      variety?: string;
      min_price?: string | number;
      max_price?: string | number;
      modal_price?: string | number;
      arrival_date?: string;
    }>;
  };
  const records = json.records || [];
  return records
    .map((r, idx): MarketPriceRecord | null => {
      const market = String(r.market || '').trim();
      const commodity = String(r.commodity || '').trim();
      const modal = Number(r.modal_price || 0);
      if (!market || !commodity || modal <= 0) return null;
      const apmcName = /apmc/i.test(market) ? market : `${market} APMC`;
      const inferred = inferCropCode(commodity);
      const isoDate = parseDateToIso(String(r.arrival_date || '')) || new Date().toISOString().slice(0, 10);
      return {
        id: `dgov-${inferred.code}-${market.toLowerCase().replace(/[^a-z0-9]/g, '')}-${idx}`,
        apmc_name: apmcName,
        apmc_name_kn: toKannadaApmc(apmcName),
        district: String(r.district || 'Karnataka'),
        crop_code: inferred.code,
        crop_name_en: inferred.en,
        crop_name_kn: inferred.kn,
        variety: String(r.variety || 'FAQ'),
        min_price: Number(r.min_price || modal) || modal,
        max_price: Number(r.max_price || modal) || modal,
        modal_price: modal,
        unit: 'Quintal',
        reported_date: isoDate,
        trend: 'stable',
        source_name: 'Agmarknet (data.gov.in Open Government Data)',
        source_url: 'https://data.gov.in/catalog/current-daily-price-various-commodities-various-markets-mandi',
        data_mode: 'live',
      };
    })
    .filter((x): x is MarketPriceRecord => x !== null);
}

async function fetchFromPublicFeed(fetchImpl: typeof fetch): Promise<{
  records: MarketPriceRecord[];
  failedCount: number;
  lastError?: string;
}> {
  const settled = await Promise.allSettled(
    PUBLIC_FEED_TARGETS.map(async (target) => {
      const resp = await fetchImpl(target.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; KrishiMitra/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(6500),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${target.url}`);
      const html = await resp.text();
      return parseMaiKisaanHtml(html, target);
    })
  );

  const deduped = new Map<string, MarketPriceRecord>();
  let failedCount = 0;
  let lastError: string | undefined;

  for (const res of settled) {
    if (res.status === 'fulfilled') {
      for (const row of res.value) {
        const key = `${row.apmc_name.toLowerCase()}|${row.crop_code}|${row.variety.toLowerCase()}|${row.reported_date}`;
        if (!deduped.has(key)) {
          deduped.set(key, row);
        }
      }
    } else {
      failedCount++;
      lastError = res.reason instanceof Error ? res.reason.message : String(res.reason);
    }
  }

  return {
    records: Array.from(deduped.values()),
    failedCount,
    lastError,
  };
}

function getStoredDbRows(): MarketPriceRecord[] {
  const rows = db
    .prepare('SELECT * FROM market_prices ORDER BY reported_date DESC, modal_price DESC')
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => {
    const rawMode = String(r.data_mode || 'published_reference');
    const data_mode: MarketPriceRecord['data_mode'] =
      rawMode === 'admin_verified' ? 'admin_verified' : 'fallback';
    return {
      id: Number(r.id),
      apmc_name: String(r.apmc_name),
      apmc_name_kn: String(r.apmc_name_kn),
      district: String(r.district),
      crop_code: String(r.crop_code),
      crop_name_en: String(r.crop_name_en),
      crop_name_kn: String(r.crop_name_kn),
      variety: String(r.variety),
      min_price: Number(r.min_price),
      max_price: Number(r.max_price),
      modal_price: Number(r.modal_price),
      unit: String(r.unit || 'Quintal'),
      reported_date: String(r.reported_date),
      trend: (String(r.trend || 'stable') as 'up' | 'down' | 'stable'),
      source_name:
        data_mode === 'admin_verified'
          ? String(r.source_name)
          : `${String(r.source_name).replace(/\s*\(Reference Snapshot\)/i, '')} (Stored Fallback Snapshot)`,
      source_url: 'https://agmarknet.gov.in/',
      data_mode,
    };
  });
}

function matchesTargetMarket(apmcName: string, district: string, target: string): boolean {
  const a = apmcName.toLowerCase();
  const d = district.toLowerCase();
  if (target === 'Sira APMC') return a.includes('sira');
  if (target === 'Tumakuru APMC') return a.includes('tumakuru') || a.includes('tumkur') || a.includes('gubbi') || d === 'tumakuru';
  if (target === 'Tiptur APMC') return a.includes('tiptur');
  if (target === 'Yeshwanthpur APMC') return a.includes('yeshwanthpur') || a.includes('bengaluru') || a.includes('bangalore') || d === 'bengaluru';
  if (target === 'Kolar APMC') return a.includes('kolar') || a.includes('bangarpet') || a.includes('malur') || d === 'kolar';
  if (target === 'Mandya APMC') return a.includes('mandya') || a.includes('pandavapura') || d === 'mandya';
  return false;
}

function mergeLiveWithAdminAndMissingTargets(
  liveRows: MarketPriceRecord[],
  feedStatus: 'live' | 'cached',
  provider: string,
  sourceUrl: string,
  lastUpdated: string,
  errorMessage?: string
): MarketPricesPayload {
  const dbRows = getStoredDbRows();
  const adminRows = dbRows.filter((r) => r.data_mode === 'admin_verified');

  const markedLiveRows: MarketPriceRecord[] = liveRows.map((r) => ({
    ...r,
    data_mode: feedStatus === 'cached' ? 'cached' : 'live',
  }));

  const combined: MarketPriceRecord[] = [...adminRows, ...markedLiveRows];

  // Check exact yard presence for the 6 target markets
  const missingLiveTargets: string[] = [];
  const exactTargetMatchers: Array<[string, RegExp]> = [
    ['Sira APMC', /\bsira\b/i],
    ['Tumakuru APMC', /\btumakuru\b|\btumkur\b/i],
    ['Tiptur APMC', /\btiptur\b/i],
    ['Yeshwanthpur APMC', /\byeshwanthpur\b/i],
    ['Kolar APMC', /\bkolar\b|\bbangarpet\b|\bmalur\b/i],
    ['Mandya APMC', /\bmandya\b|\bpandavapura\b/i],
  ];

  for (const [targetName, rx] of exactTargetMatchers) {
    const hasExactLive = combined.some(
      (r) => (r.data_mode === 'live' || r.data_mode === 'cached') && rx.test(r.apmc_name)
    );
    if (!hasExactLive) {
      missingLiveTargets.push(targetName);
      // Include stored fallback rows ONLY for targets missing from today's live feed, clearly labeled fallback
      const targetFallbacks = dbRows.filter(
        (r) =>
          r.data_mode === 'fallback' &&
          (rx.test(r.apmc_name) || (targetName === 'Yeshwanthpur APMC' && r.apmc_name.toLowerCase().includes('yeshwanthpur')))
      );
      for (const fb of targetFallbacks) {
        const exists = combined.some(
          (c) => c.apmc_name === fb.apmc_name && c.crop_code === fb.crop_code && c.reported_date === fb.reported_date
        );
        if (!exists) {
          combined.push({
            ...fb,
            source_name: `${fb.source_name.replace(' (Stored Fallback Snapshot)', '')} (Stored Fallback — No trade reported today for ${targetName})`,
            data_mode: 'fallback',
          });
        }
      }
    }
  }

  // Sort: target districts/markets & latest dates first
  combined.sort((a, b) => {
    const aLive = a.data_mode === 'live' || a.data_mode === 'cached' ? 0 : a.data_mode === 'admin_verified' ? 1 : 2;
    const bLive = b.data_mode === 'live' || b.data_mode === 'cached' ? 0 : b.data_mode === 'admin_verified' ? 1 : 2;
    if (aLive !== bLive) return aLive - bLive;
    const aTarget = TARGET_KARNATAKA_MARKETS.some((t) => matchesTargetMarket(a.apmc_name, a.district, t)) ? 0 : 1;
    const bTarget = TARGET_KARNATAKA_MARKETS.some((t) => matchesTargetMarket(b.apmc_name, b.district, t)) ? 0 : 1;
    if (aTarget !== bTarget) return aTarget - bTarget;
    if (a.reported_date !== b.reported_date) return b.reported_date.localeCompare(a.reported_date);
    return b.modal_price - a.modal_price;
  });

  const liveCount = combined.filter((r) => r.data_mode === 'live').length;
  const cachedCount = combined.filter((r) => r.data_mode === 'cached').length;
  const fallbackCount = combined.filter((r) => r.data_mode === 'fallback').length;

  const missingTextEn =
    missingLiveTargets.length > 0
      ? ` Yards without a trade in today's public feed (${missingLiveTargets.join(', ')}) retain clearly marked stored fallback snapshots with their original reporting dates.`
      : '';
  const missingTextKn =
    missingLiveTargets.length > 0
      ? ` ಇಂದಿನ ಲೈವ್ ವರದಿಯಲ್ಲಿ ವಹಿವಾಟು ದಾಖಲಾಗದ ಮಾರುಕಟ್ಟೆಗಳಿಗೆ (${missingLiveTargets.join(', ')}) ಮೂಲ ದಿನಾಂಕದೊಂದಿಗೆ ಸಂಗ್ರಹಿತ ಫಾಲ್‌ಬ್ಯಾಕ್ ಉಲ್ಲೇಖ ದರಗಳನ್ನು ಸ್ಪಷ್ಟವಾಗಿ ತೋರಿಸಲಾಗಿದೆ.`
      : '';

  return {
    prices: combined,
    feed_status: feedStatus,
    provider,
    source_url: sourceUrl,
    last_updated: lastUpdated,
    live_count: liveCount,
    cached_count: cachedCount,
    fallback_count: fallbackCount,
    target_markets: TARGET_KARNATAKA_MARKETS,
    missing_live_targets: missingLiveTargets,
    api_configured: true,
    error_message: errorMessage,
    source_note_en:
      feedStatus === 'live'
        ? `Live Karnataka APMC prices fetched from ${provider} (no API key required).${missingTextEn}`
        : `Showing cached Karnataka APMC feed from ${provider} (fetched ${lastUpdated.slice(0, 16).replace('T', ' ')} UTC).${missingTextEn}`,
    source_note_kn:
      feedStatus === 'live'
        ? `${provider} ಸಾರ್ವಜನಿಕ ಫೀಡ್‌ನಿಂದ ಲೈವ್ ಕರ್ನಾಟಕ APMC ದರಗಳನ್ನು ಪಡೆಯಲಾಗಿದೆ (API ಕೀ ಅಗತ್ಯವಿಲ್ಲ).${missingTextKn}`
        : `${provider} ನಲ್ಲಿ ಸಂಗ್ರಹಿಸಿದ (Cached) ಕರ್ನಾಟಕ APMC ದರಗಳನ್ನು ತೋರಿಸಲಾಗುತ್ತಿದೆ.${missingTextKn}`,
  };
}

export function invalidateMarketCache() {
  try {
    db.prepare('DELETE FROM market_cache WHERE cache_key = ?').run(CACHE_KEY);
  } catch {
    // ignore if table not ready
  }
}

export async function getKarnatakaMarketPrices(options?: {
  forceRefresh?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<MarketPricesPayload> {
  const forceRefresh = Boolean(options?.forceRefresh);
  const fetchImpl = options?.fetchImpl ?? fetch;

  const cachedRow = db
    .prepare('SELECT payload, fetched_at FROM market_cache WHERE cache_key = ?')
    .get(CACHE_KEY) as { payload: string; fetched_at: string } | undefined;

  if (!forceRefresh && cachedRow) {
    const ageMs = Date.now() - new Date(cachedRow.fetched_at).getTime();
    if (Number.isFinite(ageMs) && ageMs < CACHE_TTL_MS) {
      const parsed = JSON.parse(cachedRow.payload) as {
        records: MarketPriceRecord[];
        provider: string;
        source_url: string;
      };
      return mergeLiveWithAdminAndMissingTargets(
        parsed.records,
        'cached',
        parsed.provider,
        parsed.source_url,
        cachedRow.fetched_at
      );
    }
  }

  // Optional DATA_GOV_API_KEY if configured, otherwise primary keyless public feed
  const dataGovKey = process.env.DATA_GOV_API_KEY;
  let records: MarketPriceRecord[] = [];
  let provider = 'Agmarknet via Mai Kisaan Public Feed';
  let sourceUrl = 'https://www.maikisaan.com/mandi-bhav/market/karnataka/';
  let fetchError: string | undefined;

  if (dataGovKey) {
    try {
      const dgRecords = await fetchFromOptionalDataGov(dataGovKey, fetchImpl);
      if (dgRecords.length > 0) {
        records = dgRecords;
        provider = 'Agmarknet (data.gov.in Open Government Data)';
        sourceUrl = 'https://data.gov.in/catalog/current-daily-price-various-commodities-various-markets-mandi';
      }
    } catch (err) {
      fetchError = err instanceof Error ? err.message : 'data.gov.in unreachable';
    }
  }

  if (records.length === 0) {
    const pub = await fetchFromPublicFeed(fetchImpl);
    records = pub.records;
    if (pub.lastError && records.length === 0) {
      fetchError = pub.lastError;
    }
  }

  if (records.length > 0) {
    const nowIso = new Date().toISOString();
    db.prepare(
      'INSERT INTO market_cache (cache_key, payload, fetched_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at'
    ).run(CACHE_KEY, JSON.stringify({ records, provider, source_url: sourceUrl }), nowIso);

    return mergeLiveWithAdminAndMissingTargets(records, 'live', provider, sourceUrl, nowIso, fetchError);
  }

  // External feed completely unreachable -> serve cached live snapshot if one exists
  if (cachedRow) {
    const parsed = JSON.parse(cachedRow.payload) as {
      records: MarketPriceRecord[];
      provider: string;
      source_url: string;
    };
    return mergeLiveWithAdminAndMissingTargets(
      parsed.records,
      'cached',
      parsed.provider,
      parsed.source_url,
      cachedRow.fetched_at,
      fetchError || 'External market feed unreachable; showing last cached live prices.'
    );
  }

  // No cache at all & external feed unreachable -> honest fallback from stored SQLite rows
  const fallbackRows = getStoredDbRows();
  return {
    prices: fallbackRows,
    feed_status: 'fallback',
    provider: 'Stored SQLite Fallback Reference',
    source_url: 'https://agmarknet.gov.in/',
    last_updated: new Date().toISOString(),
    live_count: 0,
    cached_count: 0,
    fallback_count: fallbackRows.filter((r) => r.data_mode === 'fallback').length,
    target_markets: TARGET_KARNATAKA_MARKETS,
    missing_live_targets: TARGET_KARNATAKA_MARKETS,
    api_configured: false,
    error_message: fetchError || 'External public mandi feed unreachable',
    source_note_en:
      'External market feed is currently unreachable. Showing stored fallback reference snapshots (not live prices) with original reporting dates.',
    source_note_kn:
      'ಹೊರಗಿನ ಮಾರುಕಟ್ಟೆ ಫೀಡ್ ಪ್ರಸ್ತುತ ಸಂಪರ್ಕಕ್ಕೆ ಸಿಗುತ್ತಿಲ್ಲ. ಮೂಲ ವರದಿ ದಿನಾಂಕದೊಂದಿಗೆ ಸಂಗ್ರಹಿತ ಫಾಲ್‌ಬ್ಯಾಕ್ ಉಲ್ಲೇಖ ದರಗಳನ್ನು ತೋರಿಸಲಾಗುತ್ತಿದೆ (ಇವು ಲೈವ್ ದರಗಳಲ್ಲ).',
  };
}
