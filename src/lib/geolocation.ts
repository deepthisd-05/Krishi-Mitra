import type { Lang } from '../i18n/translations';
import { isEmbeddedIframe } from './camera';

export interface GeolocationErrorInfo {
  code: 'permission_denied' | 'position_unavailable' | 'timeout' | 'unsupported' | 'unknown';
  title: string;
  message: string;
  suggestOpenTab: boolean;
}

export function buildGoogleMapsSearchUrl(
  lat: number | null | undefined,
  lng: number | null | undefined,
  fallbackQuery?: string
): string {
  const hasCoords =
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;

  const query = hasCoords ? `${lat},${lng}` : (fallbackQuery || 'Sira, Tumakuru, Karnataka');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function describeGeolocationError(
  err: unknown,
  lang: Lang,
  fallbackPlaceLabel: string,
  inIframe = isEmbeddedIframe()
): GeolocationErrorInfo {
  const isKn = lang === 'kn';
  const errObj = err && typeof err === 'object' ? (err as { code?: number; message?: string; name?: string }) : null;
  const numericCode = typeof errObj?.code === 'number' ? errObj.code : null;
  const msg = (typeof err === 'string' ? err : errObj?.message || errObj?.name || '').toLowerCase();

  if (msg.includes('unsupported') || msg.includes('unavailable_api')) {
    return {
      code: 'unsupported',
      title: isKn ? 'ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಸ್ಥಳ ಸೇವೆ ಲಭ್ಯವಿಲ್ಲ' : 'Location service unavailable in this browser',
      message: isKn
        ? `ಈ ಸಾಧನ ಅಥವಾ ಬ್ರೌಸರ್ GPS ಸ್ಥಳ ಸೇವೆಯನ್ನು ಬೆಂಬಲಿಸುವುದಿಲ್ಲ. ನಕ್ಷೆಯನ್ನು ${fallbackPlaceLabel} ಕೇಂದ್ರಕ್ಕೆ ಹೊಂದಿಸಲಾಗಿದೆ.`
        : `Geolocation is not supported by this browser context. Centered the map on ${fallbackPlaceLabel} instead.`,
      suggestOpenTab: inIframe,
    };
  }

  // GeolocationPositionError.PERMISSION_DENIED === 1
  if (numericCode === 1 || msg.includes('denied') || msg.includes('permission') || msg.includes('policy')) {
    return {
      code: 'permission_denied',
      title: isKn
        ? inIframe
          ? 'ಎಂಬೆಡೆಡ್ ಪೂರ್ವವೀಕ್ಷಣೆಯಲ್ಲಿ ಸ್ಥಳ ಅನುಮತಿ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ'
          : 'ಸ್ಥಳ ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ'
        : inIframe
        ? 'Location access is blocked in embedded preview'
        : 'Location permission was denied',
      message: isKn
        ? inIframe
          ? `ಈ ಎಂಬೆಡೆಡ್ ಪೂರ್ವವೀಕ್ಷಣೆ ಫ್ರೇಮ್‌ನಲ್ಲಿ GPS ಸ್ಥಳ ಅನುಮತಿ ನಿರ್ಬಂಧಿತವಾಗಿದೆ. ನಕ್ಷೆಯನ್ನು ${fallbackPlaceLabel} ಕೇಂದ್ರಕ್ಕೆ ಹೊಂದಿಸಲಾಗಿದೆ — ನಿಖರ GPS ಗಾಗಿ ಪ್ರತ್ಯೇಕ ಟ್ಯಾಬ್‌ನಲ್ಲಿ ತೆರೆಯಿರಿ.`
          : `ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಸ್ಥಳ ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ. ನಕ್ಷೆಯನ್ನು ${fallbackPlaceLabel} ಕೇಂದ್ರಕ್ಕೆ ಹೊಂದಿಸಲಾಗಿದೆ; ಬ್ರೌಸರ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಸ್ಥಳ ಅನುಮತಿ ನೀಡಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಬಹುದು.`
        : inIframe
        ? `Browser location permission is blocked inside this embedded preview iframe. Centered on ${fallbackPlaceLabel} instead — open in a standalone tab for live GPS.`
        : `Location access was denied. Centered on ${fallbackPlaceLabel} instead — allow location access in browser settings to retry.`,
      suggestOpenTab: inIframe,
    };
  }

  // GeolocationPositionError.POSITION_UNAVAILABLE === 2
  if (numericCode === 2 || msg.includes('position unavailable')) {
    return {
      code: 'position_unavailable',
      title: isKn ? 'ಪ್ರಸ್ತುತ GPS ಸಿಗ್ನಲ್ ಲಭ್ಯವಿಲ್ಲ' : 'Current GPS position unavailable',
      message: isKn
        ? `ನಿಮ್ಮ ಸಾಧನದಿಂದ ಪ್ರಸ್ತುತ ಸ್ಥಳ ಪಡೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ನಕ್ಷೆಯನ್ನು ${fallbackPlaceLabel} ಕೇಂದ್ರಕ್ಕೆ ಹೊಂದಿಸಲಾಗಿದೆ.`
        : `Your device could not determine a GPS fix right now. Centered the map on ${fallbackPlaceLabel} instead.`,
      suggestOpenTab: false,
    };
  }

  // GeolocationPositionError.TIMEOUT === 3
  if (numericCode === 3 || msg.includes('timeout')) {
    return {
      code: 'timeout',
      title: isKn ? 'ಸ್ಥಳ ಹುಡುಕಾಟ ಸಮಯ ಮೀರಿದೆ' : 'Location request timed out',
      message: isKn
        ? `GPS ಸ್ಥಳ ಪಡೆಯಲು ಹೆಚ್ಚು ಸಮಯ ತಗುಲಿತು. ನಕ್ಷೆಯನ್ನು ${fallbackPlaceLabel} ಕೇಂದ್ರಕ್ಕೆ ಹೊಂದಿಸಲಾಗಿದೆ; ತೆರೆದ ಪ್ರದೇಶದಲ್ಲಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.`
        : `Timed out waiting for a high-accuracy GPS fix. Centered the map on ${fallbackPlaceLabel}; retry outdoors or with Wi-Fi enabled.`,
      suggestOpenTab: false,
    };
  }

  return {
    code: 'unknown',
    title: isKn ? 'ಪ್ರಸ್ತುತ ಸ್ಥಳ ಪಡೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ' : 'Could not detect current location',
    message: isKn
      ? `ಸ್ಥಳ ಪತ್ತೆ ವಿಫಲವಾಗಿದೆ. ನಕ್ಷೆಯನ್ನು ${fallbackPlaceLabel} ಕೇಂದ್ರಕ್ಕೆ ಹೊಂದಿಸಲಾಗಿದೆ.`
      : `Could not detect GPS coordinates right now. Centered the map on ${fallbackPlaceLabel} instead.`,
    suggestOpenTab: inIframe,
  };
}

export interface PopupMarkerInput {
  id: string | number;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  address?: string;
  phone?: string;
  hours?: string;
  distanceKm?: number;
  mapsUrl?: string;
}

export function buildMapPopupHtml(marker: PopupMarkerInput, lang: Lang = 'en'): string {
  const isKn = lang === 'kn';
  const title = escapeHtml(marker.title);
  const addressText = marker.address ? escapeHtml(marker.address) : marker.subtitle ? escapeHtml(marker.subtitle) : '';
  const hoursText = marker.hours ? escapeHtml(marker.hours) : '';
  const phoneRaw = (marker.phone || '').trim();
  const phoneSafe = escapeHtml(phoneRaw);
  const telHref = `tel:${encodeURIComponent(phoneRaw.replace(/[^\d+]/g, '') || phoneRaw)}`;
  const mapsHref = marker.mapsUrl || buildGoogleMapsSearchUrl(marker.lat, marker.lng, marker.title);
  const distanceLabel =
    typeof marker.distanceKm === 'number' && Number.isFinite(marker.distanceKm)
      ? `${marker.distanceKm} km ${isKn ? 'ದೂರ' : 'away'}`
      : '';
  const mapsLabel = isKn ? 'Google Maps ನಲ್ಲಿ ತೆರೆಯಿರಿ' : 'Open in Google Maps';

  return [
    `<div style="min-width:205px;max-width:255px;font-family:inherit;line-height:1.4">`,
    `<div style="font-weight:700;font-size:13px;color:#0f172a">${title}</div>`,
    addressText
      ? `<div style="margin-top:4px;font-size:12px;color:#475569">${addressText}</div>`
      : '',
    distanceLabel
      ? `<div style="margin-top:4px;font-size:11px;font-weight:600;color:#155e34">${escapeHtml(distanceLabel)}</div>`
      : '',
    hoursText
      ? `<div style="margin-top:3px;font-size:11px;color:#475569">${isKn ? 'ಸಮಯ:' : 'Hours:'} ${hoursText}</div>`
      : '',
    phoneSafe
      ? `<div style="margin-top:5px;font-size:12px"><a href="${telHref}" style="color:#155e34;font-weight:700;text-decoration:none">${isKn ? 'ಕರೆ ಮಾಡಿ:' : 'Call:'} ${phoneSafe}</a></div>`
      : '',
    `<div style="margin-top:8px;padding-top:6px;border-top:1px solid #e2e8f0">`,
    `<a href="${escapeHtml(mapsHref)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;justify-content:center;width:100%;padding:6px 10px;border-radius:8px;background:#155e34;color:#ffffff;font-size:11px;font-weight:600;text-decoration:none">${mapsLabel}</a>`,
    `</div>`,
    `</div>`,
  ].join('');
}

export function formatShopCopyText(
  shop: {
    name: string;
    name_kn?: string;
    address: string;
    taluk: string;
    district: string;
    phone?: string;
    operating_hours?: string;
    products?: string;
    latitude: number;
    longitude: number;
  },
  lang: Lang
): string {
  const isKn = lang === 'kn';
  const shopName = isKn && shop.name_kn ? shop.name_kn : shop.name;
  const mapsUrl = buildGoogleMapsSearchUrl(shop.latitude, shop.longitude, `${shop.name}, ${shop.address}`);
  return [
    shopName,
    `${shop.address} (${shop.taluk}, ${shop.district})`,
    shop.phone ? `${isKn ? 'ದೂರವಾಣಿ:' : 'Phone:'} ${shop.phone}` : '',
    shop.operating_hours ? `${isKn ? 'ಸಮಯ:' : 'Hours:'} ${shop.operating_hours}` : '',
    shop.products ? `${isKn ? 'ಪರಿಕರಗಳು:' : 'Products:'} ${shop.products}` : '',
    `${isKn ? 'Google Maps:' : 'Google Maps:'} ${mapsUrl}`,
  ]
    .filter(Boolean)
    .join('\n');
}
