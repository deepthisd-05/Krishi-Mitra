import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crosshair,
  ExternalLink,
  Loader2,
  LocateFixed,
  MapPin,
  Phone,
  Plus,
  Store,
  Tractor,
} from 'lucide-react';
import {
  LeafletMap,
  type MapMarker,
  type MapUserLocation,
  type MapViewportCommand,
} from '../components/LeafletMap';
import { useT, type Lang } from '../i18n/translations';
import { apiFetch } from '../lib/api';
import { isEmbeddedIframe } from '../lib/camera';
import {
  buildGoogleMapsSearchUrl,
  describeGeolocationError,
  formatShopCopyText,
  haversineDistanceKm,
  type GeolocationErrorInfo,
} from '../lib/geolocation';
import type { AgroShop, EquipmentRental, UserProfile } from '../types';

interface ServicesPageProps {
  mode: 'shops' | 'rentals';
  lang: Lang;
  user: UserProfile;
  shops: AgroShop[];
  rentals: EquipmentRental[];
  onRefresh: () => void;
}

export const ServicesPage: React.FC<ServicesPageProps> = ({
  mode,
  lang,
  user,
  shops,
  rentals,
  onRefresh,
}) => {
  const t = useT(lang);
  const fallbackLat = user.latitude ?? 13.741;
  const fallbackLng = user.longitude ?? 76.904;
  const fallbackPlaceLabel = [user.taluk || 'Sira', user.district || 'Tumakuru'].filter(Boolean).join(', ');
  const talukShortLabel = user.taluk || (lang === 'kn' ? 'ಸಿರಾ' : 'Sira');

  // Geolocation & Map Synchronization State
  const [myLocation, setMyLocation] = useState<MapUserLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<GeolocationErrorInfo | null>(null);
  const [geoSuccessMsg, setGeoSuccessMsg] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [viewportCmd, setViewportCmd] = useState<MapViewportCommand | null>(null);
  const [copiedShopId, setCopiedShopId] = useState<number | null>(null);
  const seqRef = useRef(0);
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const mapSectionRef = useRef<HTMLDivElement | null>(null);

  // Shop submission state
  const [showShopForm, setShowShopForm] = useState(false);
  const [shopName, setShopName] = useState('');
  const [shopCat, setShopCat] = useState('Fertilizer & Seed Shop');
  const [shopAddr, setShopAddr] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopProducts, setShopProducts] = useState('');

  // Rental submission state
  const [showRentalForm, setShowRentalForm] = useState(false);
  const [eqName, setEqName] = useState('');
  const [eqCat, setEqCat] = useState('Tractor & Tillage');
  const [eqOwner, setEqOwner] = useState(user.name);
  const [eqRate, setEqRate] = useState('');
  const [eqPhone, setEqPhone] = useState('');
  const [eqConfirmed, setEqConfirmed] = useState(false);

  // Enquiry modal state
  const [enquireTarget, setEnquireTarget] = useState<EquipmentRental | null>(null);
  const [reqDate, setReqDate] = useState(new Date().toISOString().slice(0, 10));
  const [reqHours, setReqHours] = useState('4');
  const [reqContact, setReqContact] = useState('');
  const [reqNotes, setReqNotes] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    setSelectedId(null);
  }, [mode]);

  const nextSeq = () => {
    seqRef.current += 1;
    return seqRef.current;
  };

  const centerOnTalukFallback = () => {
    setSelectedId(null);
    setViewportCmd({
      lat: fallbackLat,
      lng: fallbackLng,
      zoom: 12,
      seq: nextSeq(),
      openMarkerId: null,
    });
  };

  const handleLocateMe = () => {
    setGeoError(null);
    setGeoSuccessMsg('');

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError(describeGeolocationError('unsupported', lang, fallbackPlaceLabel, isEmbeddedIframe()));
      centerOnTalukFallback();
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: MapUserLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy,
          label: t.currentLocationLabel,
        };
        setLocating(false);
        setMyLocation(coords);
        setSelectedId(null);
        setViewportCmd({
          lat: coords.lat,
          lng: coords.lng,
          zoom: 14,
          seq: nextSeq(),
          openUserPopup: true,
        });
        const acc = Math.round(pos.coords.accuracy || 0);
        setGeoSuccessMsg(
          lang === 'kn'
            ? `ಪ್ರಸ್ತುತ GPS ಸ್ಥಳ ಪತ್ತೆಯಾಗಿದೆ${acc > 0 ? ` (±${acc} ಮೀ)` : ''} — ಹತ್ತಿರದ ಅಂಗಡಿಗಳ ದೂರ ನವೀಕರಿಸಲಾಗಿದೆ.`
            : `Centered on your live GPS location${acc > 0 ? ` (±${acc} m accuracy)` : ''} — shop distances updated.`
        );
      },
      (err) => {
        setLocating(false);
        setGeoError(describeGeolocationError(err, lang, fallbackPlaceLabel, isEmbeddedIframe()));
        centerOnTalukFallback();
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  };

  // Compute live distances when GPS location is active, otherwise preserve server taluk distance
  const shopsWithDistance = useMemo(() => {
    if (!myLocation) return shops;
    return shops
      .map((s) => ({
        ...s,
        distance_km: haversineDistanceKm(myLocation.lat, myLocation.lng, s.latitude, s.longitude),
      }))
      .sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
  }, [shops, myLocation]);

  const rentalsWithDistance = useMemo(() => {
    if (!myLocation) return rentals;
    return rentals
      .map((r) => ({
        ...r,
        distance_km: haversineDistanceKm(myLocation.lat, myLocation.lng, r.latitude, r.longitude),
      }))
      .sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
  }, [rentals, myLocation]);

  const handleSelectShopCard = (shop: AgroShop) => {
    setSelectedId(shop.id);
    setViewportCmd({
      lat: shop.latitude,
      lng: shop.longitude,
      zoom: 15,
      seq: nextSeq(),
      openMarkerId: shop.id,
    });
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const handleSelectRentalCard = (rental: EquipmentRental) => {
    setSelectedId(rental.id);
    setViewportCmd({
      lat: rental.latitude,
      lng: rental.longitude,
      zoom: 14,
      seq: nextSeq(),
      openMarkerId: rental.id,
    });
  };

  const handleSelectMarker = (markerId: string | number) => {
    const numId = Number(markerId);
    setSelectedId(numId);
    const el = cardRefs.current.get(numId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const handleCopyShop = async (shop: AgroShop) => {
    const details = formatShopCopyText(shop, lang);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(details);
      } else {
        const ta = document.createElement('textarea');
        ta.value = details;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedShopId(shop.id);
      window.setTimeout(() => {
        setCopiedShopId((cur) => (cur === shop.id ? null : cur));
      }, 2200);
    } catch {
      // Ignore restricted clipboard environments
    }
  };

  const handleAddShop = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/shops', {
      method: 'POST',
      body: JSON.stringify({
        name: shopName,
        category: shopCat,
        address: shopAddr,
        district: user.district,
        taluk: user.taluk,
        phone: shopPhone,
        products: shopProducts,
      }),
    });
    setShopName('');
    setShopAddr('');
    setShopPhone('');
    setShopProducts('');
    setShowShopForm(false);
    setFeedback(
      lang === 'kn'
        ? 'ನಿಮ್ಮ ಅಂಗಡಿ ವಿವರವನ್ನು ದಾಖಲಿಸಲಾಗಿದೆ.'
        : 'Your shop listing has been saved to your directory submissions.'
    );
    onRefresh();
  };

  const handleAddRental = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/rentals', {
      method: 'POST',
      body: JSON.stringify({
        equipment_name: eqName,
        category: eqCat,
        owner_name: eqOwner,
        district: user.district,
        taluk: user.taluk,
        village: user.village,
        rate_info: eqRate,
        phone: eqPhone,
        availability_confirmed: eqConfirmed,
      }),
    });
    setEqName('');
    setEqRate('');
    setEqPhone('');
    setShowRentalForm(false);
    setFeedback(
      lang === 'kn'
        ? 'ಯಂತ್ರ ಬಾಡಿಗೆ ವಿವರ ಸಲ್ಲಿಸಲಾಗಿದೆ — ನಿರ್ವಾಹಕರ ಪರಿಶೀಲನೆ ಬಾಕಿ ಇದೆ.'
        : 'Equipment listing submitted for review.'
    );
    onRefresh();
  };

  const handleEnquire = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enquireTarget) return;
    await apiFetch(`/api/rentals/${enquireTarget.id}/enquire`, {
      method: 'POST',
      body: JSON.stringify({
        requested_date: reqDate,
        duration_hours: Number(reqHours) || 4,
        farmer_contact: reqContact,
        notes: reqNotes,
      }),
    });
    setEnquireTarget(null);
    setReqContact('');
    setReqNotes('');
    setFeedback(
      lang === 'kn'
        ? 'ಬಾಡಿಗೆ ವಿಚಾರಣೆ ಕಳುಹಿಸಲಾಗಿದೆ. ಮಾಲೀಕರಿಂದ ದೃಢೀಕರಣಕ್ಕಾಗಿ ಕಾಯಿರಿ.'
        : 'Booking enquiry sent. Wait for provider confirmation before assuming availability.'
    );
  };

  const markers: MapMarker[] =
    mode === 'shops'
      ? shopsWithDistance.map((s) => ({
          id: s.id,
          lat: s.latitude,
          lng: s.longitude,
          title: lang === 'kn' ? s.name_kn : s.name,
          address: s.address,
          phone: s.phone,
          hours: s.operating_hours,
          distanceKm: s.distance_km,
          mapsUrl: buildGoogleMapsSearchUrl(s.latitude, s.longitude, `${s.name}, ${s.address}`),
          verified: s.verification_status === 'verified',
        }))
      : rentalsWithDistance.map((r) => ({
          id: r.id,
          lat: r.latitude,
          lng: r.longitude,
          title: lang === 'kn' ? r.equipment_name_kn : r.equipment_name,
          address: `${r.owner_name} · ${r.village}, ${r.taluk}`,
          phone: r.phone,
          hours: r.rate_info,
          distanceKm: r.distance_km,
          mapsUrl: buildGoogleMapsSearchUrl(r.latitude, r.longitude, `${r.village}, ${r.taluk}`),
          verified: r.verification_status === 'verified',
        }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {mode === 'shops' ? t.navShops : t.navRentals}
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {mode === 'shops'
              ? lang === 'kn'
                ? `${fallbackPlaceLabel} ಸುತ್ತಮುತ್ತಲಿನ ರಸಗೊಬ್ಬರ, ಬೀಜ ಮತ್ತು RSK ಕೇಂದ್ರಗಳು`
                : `Verified RSK centers & local agro input shops near ${fallbackPlaceLabel}`
              : lang === 'kn'
              ? `${fallbackPlaceLabel} ಸುತ್ತಮುತ್ತಲಿನ ಟ್ರ್ಯಾಕ್ಟರ್, ರೋಟಾವೇಟರ್ ಮತ್ತು ಕೃಷಿ ಯಂತ್ರಗಳು`
              : `Tractors, rotavators, seed drills, sprayers, and harvesters near ${fallbackPlaceLabel}`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => (mode === 'shops' ? setShowShopForm(!showShopForm) : setShowRentalForm(!showRentalForm))}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#155E34] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#114B29] min-h-[44px] whitespace-nowrap self-start"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>{mode === 'shops' ? t.submitShop : t.submitEquipment}</span>
        </button>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {feedback}
        </div>
      )}

      {/* Submission Forms */}
      {mode === 'shops' && showShopForm && (
        <form onSubmit={handleAddShop} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900">{t.submitShop}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              required
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder={lang === 'kn' ? 'ಅಂಗಡಿ ಹೆಸರು' : 'Shop Name'}
              className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm min-h-[44px]"
            />
            <select
              value={shopCat}
              onChange={(e) => setShopCat(e.target.value)}
              className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm bg-white min-h-[44px]"
            >
              <option value="Fertilizer & Seed Shop">Fertilizer & Seed Shop</option>
              <option value="Pesticide Shop">Pesticide Shop</option>
              <option value="Nursery Service">Nursery Service</option>
              <option value="Agricultural Equipment Store">Equipment Store</option>
            </select>
            <input
              required
              value={shopAddr}
              onChange={(e) => setShopAddr(e.target.value)}
              placeholder={lang === 'kn' ? 'ಪೂರ್ಣ ವಿಳಾಸ' : 'Full Street / Village Address'}
              className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm sm:col-span-2 min-h-[44px]"
            />
            <input
              value={shopPhone}
              onChange={(e) => setShopPhone(e.target.value)}
              placeholder={lang === 'kn' ? 'ದೂರವಾಣಿ ಸಂಖ್ಯೆ (ಐಚ್ಛಿಕ)' : 'Phone Number (optional)'}
              className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm min-h-[44px]"
            />
            <input
              required
              value={shopProducts}
              onChange={(e) => setShopProducts(e.target.value)}
              placeholder={lang === 'kn' ? 'ಲಭ್ಯವಿರುವ ವಸ್ತುಗಳು (ಬೀಜ, ಗೊಬ್ಬರ...)' : 'Products / Services offered'}
              className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm min-h-[44px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowShopForm(false)} className="px-4 py-2 text-sm text-slate-600 min-h-[42px]">
              {lang === 'kn' ? 'ರದ್ದು' : 'Cancel'}
            </button>
            <button type="submit" className="rounded-xl bg-[#155E34] px-4 py-2 text-sm font-semibold text-white min-h-[42px]">
              {lang === 'kn' ? 'ಸಲ್ಲಿಸಿ' : 'Submit for Review'}
            </button>
          </div>
        </form>
      )}

      {mode === 'rentals' && showRentalForm && (
        <form onSubmit={handleAddRental} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900">{t.submitEquipment}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              required
              value={eqName}
              onChange={(e) => setEqName(e.target.value)}
              placeholder={lang === 'kn' ? 'ಯಂತ್ರದ ಹೆಸರು (ಉದಾ: 45 HP ಟ್ರ್ಯಾಕ್ಟರ್)' : 'Equipment Name (e.g. 45 HP Tractor + Rotavator)'}
              className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm min-h-[44px]"
            />
            <select
              value={eqCat}
              onChange={(e) => setEqCat(e.target.value)}
              className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm bg-white min-h-[44px]"
            >
              <option value="Tractor & Tillage">Tractor & Rotavator</option>
              <option value="Seed Drill">Seed Drill</option>
              <option value="Harvester & Thresher">Harvester & Thresher</option>
              <option value="Sprayer">Sprayer</option>
            </select>
            <input
              required
              value={eqOwner}
              onChange={(e) => setEqOwner(e.target.value)}
              placeholder={lang === 'kn' ? 'ಮಾಲೀಕರ ಹೆಸರು' : 'Owner / CHSC Name'}
              className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm min-h-[44px]"
            />
            <input
              value={eqRate}
              onChange={(e) => setEqRate(e.target.value)}
              placeholder={lang === 'kn' ? 'ಬಾಡಿಗೆ ದರ (ಉದಾ: ₹800/ಗಂಟೆ)' : 'Rental Rate (e.g. ₹800/hour)'}
              className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm min-h-[44px]"
            />
            <input
              value={eqPhone}
              onChange={(e) => setEqPhone(e.target.value)}
              placeholder={lang === 'kn' ? 'ಸಂಪರ್ಕ ಸಂಖ್ಯೆ' : 'Contact Phone'}
              className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm min-h-[44px]"
            />
            <label className="flex items-center gap-2 text-sm text-slate-700 px-1 min-h-[44px]">
              <input
                type="checkbox"
                checked={eqConfirmed}
                onChange={(e) => setEqConfirmed(e.target.checked)}
                className="w-4 h-4 accent-[#155E34]"
              />
              <span>{lang === 'kn' ? 'ಪ್ರಸ್ತುತ ಲಭ್ಯವಿದೆ ಎಂದು ದೃಢಪಡಿಸಿ' : 'Confirm equipment is currently available'}</span>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowRentalForm(false)} className="px-4 py-2 text-sm text-slate-600 min-h-[42px]">
              {lang === 'kn' ? 'ರದ್ದು' : 'Cancel'}
            </button>
            <button type="submit" className="rounded-xl bg-[#155E34] px-4 py-2 text-sm font-semibold text-white min-h-[42px]">
              {lang === 'kn' ? 'ನೋಂದಾಯಿಸಿ' : 'Submit Listing'}
            </button>
          </div>
        </form>
      )}

      {/* Interactive OpenStreetMap Discovery Section */}
      <section ref={mapSectionRef} className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              {lang === 'kn' ? 'ಸಂವಾದಾತ್ಮಕ ನಕ್ಷೆ ವೀಕ್ಷಣೆ' : 'Interactive Local Map'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {lang === 'kn'
                ? 'ವಿವರಗಳು ಮತ್ತು Google Maps ದಿಕ್ಕುಗಳಿಗಾಗಿ ಪಿನ್ ಅಥವಾ ಕೆಳಗಿನ ಕಾರ್ಡ್ ಒತ್ತಿ.'
                : 'Tap any map pin or listing card below to center, view hours & phone, or launch directions.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleLocateMe}
              disabled={locating}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 min-h-[44px] whitespace-nowrap"
            >
              {locating ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <LocateFixed className="w-4 h-4 shrink-0" />
              )}
              <span>{locating ? t.locatingBtn : t.myLocationBtn}</span>
            </button>

            <button
              type="button"
              onClick={centerOnTalukFallback}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[44px] whitespace-nowrap"
            >
              <Crosshair className="w-4 h-4 text-[#155E34] shrink-0" />
              <span>
                {lang === 'kn' ? `${talukShortLabel} ಕೇಂದ್ರ` : `Center on ${talukShortLabel}`}
              </span>
            </button>
          </div>
        </div>

        {geoSuccessMsg && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs text-blue-950 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
            <span>{geoSuccessMsg}</span>
          </div>
        )}

        {geoError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold">{geoError.title}</p>
                <p className="leading-relaxed text-amber-900">{geoError.message}</p>
              </div>
            </div>
            {geoError.suggestOpenTab && typeof window !== 'undefined' && (
              <div>
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-950 hover:bg-amber-100/60 min-h-[38px] whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.openStandaloneTab}</span>
                </a>
              </div>
            )}
          </div>
        )}

        <LeafletMap
          centerLat={fallbackLat}
          centerLng={fallbackLng}
          farmerLabel={`${user.village || talukShortLabel}, ${user.taluk || talukShortLabel}`}
          markers={markers}
          selectedMarkerId={selectedId}
          onSelectMarker={handleSelectMarker}
          userLocation={myLocation}
          viewportCommand={viewportCmd}
          lang={lang}
          heightClass="h-72 sm:h-80"
        />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-2 ring-blue-200 inline-block" aria-hidden="true" />
            <span>{lang === 'kn' ? 'ನೀಲಿ ಗುರುತು: ನಿಮ್ಮ GPS ಸ್ಥಳ' : 'Blue dot: Your GPS location'}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A] inline-block" aria-hidden="true" />
            <span>{lang === 'kn' ? 'ಹಸಿರು ಗುರುತು: ದೃಢೀಕೃತ ಕೇಂದ್ರಗಳು' : 'Green: Verified RSK & dealers'}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] inline-block" aria-hidden="true" />
            <span>{lang === 'kn' ? 'ಕಿತ್ತಳೆ: ಸ್ಥಳೀಯ ರೈತ ಸಲ್ಲಿಕೆಗಳು' : 'Amber: Farmer listings'}</span>
          </span>
        </div>
      </section>

      {/* Listings Grid */}
      {mode === 'shops' ? (
        <div className="grid md:grid-cols-2 gap-4">
          {shopsWithDistance.map((s) => {
            const isSelected = selectedId === s.id;
            const isCopied = copiedShopId === s.id;
            const mapsUrl = buildGoogleMapsSearchUrl(s.latitude, s.longitude, `${s.name}, ${s.address}`);

            return (
              <div
                key={s.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(s.id, el);
                  else cardRefs.current.delete(s.id);
                }}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectShopCard(s)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectShopCard(s);
                  }
                }}
                aria-pressed={isSelected}
                className={`rounded-2xl border p-5 flex flex-col justify-between transition-all cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155E34] ${
                  isSelected
                    ? 'border-[#155E34] ring-2 ring-[#155E34]/20 bg-[#F1F7F3]/75'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">
                      {s.category} <span aria-hidden="true">·</span> {s.taluk}, {s.district}
                    </span>
                    <span className="tabular-nums font-mono font-semibold text-slate-800">
                      {s.distance_km ?? '–'} km
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 mt-1.5 flex items-start gap-2">
                    <Store className="w-4 h-4 text-[#155E34] shrink-0 mt-1" />
                    <span>{lang === 'kn' ? s.name_kn : s.name}</span>
                  </h3>

                  <p className="text-xs text-slate-600 mt-1.5 flex items-start gap-1.5 leading-relaxed">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>{s.address}</span>
                  </p>

                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    <strong className="text-slate-800">{lang === 'kn' ? 'ಪರಿಕರಗಳು:' : 'Products:'}</strong>{' '}
                    {s.products}
                  </p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    {s.operating_hours && (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>{s.operating_hours}</span>
                      </span>
                    )}
                    {s.phone && (
                      <span className="inline-flex items-center gap-1 font-mono font-semibold text-slate-800">
                        <Phone className="w-3.5 h-3.5 text-[#155E34] shrink-0" />
                        <span>{s.phone}</span>
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                    <span
                      className={
                        s.verification_status === 'verified'
                          ? 'font-semibold text-emerald-700'
                          : 'font-semibold text-slate-600'
                      }
                    >
                      {s.verification_status === 'verified' ? t.verifiedBadge : t.unverifiedBadge}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span className="text-[#155E34] font-medium">
                      {isSelected
                        ? lang === 'kn'
                          ? 'ನಕ್ಷೆಯಲ್ಲಿ ಆಯ್ಕೆಯಾಗಿದೆ'
                          : 'Selected on map'
                        : t.showOnMap}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/80 flex flex-wrap items-center gap-2 text-xs">
                  {s.phone ? (
                    <a
                      href={`tel:${s.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-700/25 bg-emerald-50 px-3 py-2 font-semibold text-[#155E34] hover:bg-emerald-100/70 min-h-[44px] whitespace-nowrap"
                    >
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>{t.callShopBtn}</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      onClick={(e) => e.stopPropagation()}
                      title={lang === 'kn' ? 'ದೂರವಾಣಿ ಸಂಖ್ಯೆ ಲಭ್ಯವಿಲ್ಲ' : 'Phone number not listed'}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-400 cursor-not-allowed min-h-[44px] whitespace-nowrap"
                    >
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>{lang === 'kn' ? 'ದೂರವಾಣಿ ಇಲ್ಲ' : 'No Phone'}</span>
                    </button>
                  )}

                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#155E34] px-3.5 py-2 font-semibold text-white hover:bg-[#114B29] min-h-[44px] whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span>{t.openInGoogleMaps}</span>
                  </a>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyShop(s);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-800 hover:bg-slate-50 min-h-[44px] whitespace-nowrap"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span className="text-emerald-700">{t.copiedShopMsg}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[#155E34] shrink-0" />
                        <span>{t.copyShopBtn}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {rentalsWithDistance.map((r) => {
            const isSelected = selectedId === r.id;
            const mapsUrl = buildGoogleMapsSearchUrl(r.latitude, r.longitude, `${r.village}, ${r.taluk}`);

            return (
              <div
                key={r.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(r.id, el);
                  else cardRefs.current.delete(r.id);
                }}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectRentalCard(r)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectRentalCard(r);
                  }
                }}
                aria-pressed={isSelected}
                className={`rounded-2xl border p-5 flex flex-col justify-between transition-all cursor-pointer text-left ${
                  isSelected
                    ? 'border-[#155E34] ring-2 ring-[#155E34]/20 bg-[#F1F7F3]/75'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>{r.category}</span>
                    <span className="tabular-nums font-mono">{r.distance_km ?? '–'} km</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mt-1 flex items-start gap-2">
                    <Tractor className="w-4 h-4 text-[#155E34] shrink-0 mt-1" />
                    <span>{lang === 'kn' ? r.equipment_name_kn : r.equipment_name}</span>
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    {r.owner_name} · {r.village}, {r.taluk}
                  </p>
                  <p className="text-xs text-slate-700 mt-2 font-medium">{r.rate_info}</p>
                  <p
                    className={`text-xs mt-2 font-semibold flex items-center gap-1 ${
                      r.availability_status === 'confirmed' ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{r.availability_status === 'confirmed' ? t.confirmedAvail : t.unconfirmedAvail}</span>
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">
                      {r.verification_status === 'verified' ? t.verifiedBadge : t.unverifiedBadge}
                    </span>
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 font-semibold text-[#155E34] hover:underline whitespace-nowrap"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span>{t.openInGoogleMaps}</span>
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEnquireTarget(r);
                    }}
                    className="rounded-xl bg-[#155E34] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#114B29] min-h-[44px] whitespace-nowrap"
                  >
                    {t.enquireNow}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Booking Enquiry Modal */}
      {enquireTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleEnquire} className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">{t.enquireNow}</h3>
            <p className="text-xs text-slate-600">
              {lang === 'kn' ? enquireTarget.equipment_name_kn : enquireTarget.equipment_name} — {enquireTarget.owner_name}
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {lang === 'kn' ? 'ಅಗತ್ಯವಿರುವ ದಿನಾಂಕ' : 'Preferred Date'}
              </label>
              <input
                type="date"
                required
                value={reqDate}
                onChange={(e) => setReqDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm tabular-nums min-h-[44px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {lang === 'kn' ? 'ಅಂದಾಜು ಗಂಟೆಗಳು' : 'Duration (Hours)'}
                </label>
                <input
                  type="number"
                  min="1"
                  value={reqHours}
                  onChange={(e) => setReqHours(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm tabular-nums min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {lang === 'kn' ? 'ನಿಮ್ಮ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ' : 'Your Contact Number'}
                </label>
                <input
                  type="tel"
                  required
                  value={reqContact}
                  onChange={(e) => setReqContact(e.target.value)}
                  placeholder="98XXXXXXXX"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm min-h-[44px]"
                />
              </div>
            </div>
            <textarea
              rows={2}
              value={reqNotes}
              onChange={(e) => setReqNotes(e.target.value)}
              placeholder={lang === 'kn' ? 'ಹೆಚ್ಚುವರಿ ವಿವರಗಳು (ಗ್ರಾಮ, ಎಕರೆ...)' : 'Plot location / acreage notes...'}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEnquireTarget(null)}
                className="px-4 py-2 text-sm text-slate-600 min-h-[44px]"
              >
                {lang === 'kn' ? 'ರದ್ದು' : 'Cancel'}
              </button>
              <button type="submit" className="rounded-xl bg-[#155E34] px-4 py-2 text-sm font-semibold text-white min-h-[44px]">
                {t.enquireNow}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
