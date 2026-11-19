import React, { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Compass,
  MapPin,
  Plus,
  RefreshCw,
  ShieldCheck,
  StickyNote,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { VerificationStatusPanel } from '../components/VerificationStatusPanel';
import { useT, type Lang } from '../i18n/translations';
import { apiFetch, setStoredToken } from '../lib/api';
import type {
  AppNotification,
  FarmPlot,
  FieldNote,
  KarnatakaLocation,
  UserProfile,
} from '../types';

interface ProfileLocationProps {
  mode: 'location' | 'profile' | 'notifications';
  lang: Lang;
  user: UserProfile;
  locations: KarnatakaLocation[];
  plots: FarmPlot[];
  notifications: AppNotification[];
  notes: FieldNote[];
  isOnline: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  onSyncNow: () => Promise<void>;
  onUserUpdate: (u: UserProfile) => void;
  onRefreshAll: () => void;
  onAddOfflineNote: (title: string, content: string) => Promise<void>;
}

export const ProfileLocationPage: React.FC<ProfileLocationProps> = ({
  mode,
  lang,
  user,
  locations,
  plots,
  notifications,
  notes,
  isOnline,
  pendingCount,
  lastSyncedAt,
  onSyncNow,
  onUserUpdate,
  onRefreshAll,
  onAddOfflineNote,
}) => {
  const t = useT(lang);

  // Location & Profile form state
  const [name, setName] = useState(user.name);
  const [district, setDistrict] = useState(user.district);
  const [taluk, setTaluk] = useState(user.taluk);
  const [hobli, setHobli] = useState(user.hobli);
  const [village, setVillage] = useState(user.village);
  const [farmSize, setFarmSize] = useState(String(user.farm_size_acres));
  const [soilType, setSoilType] = useState(user.soil_type);
  const [irrigationType, setIrrigationType] = useState(user.irrigation_type);
  const [lat, setLat] = useState<number | null>(user.latitude);
  const [lng, setLng] = useState<number | null>(user.longitude);
  const [statusMsg, setStatusMsg] = useState('');

  // Plot creation
  const [plotName, setPlotName] = useState('');
  const [plotArea, setPlotArea] = useState('1.5');

  // Offline field note
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');

  const districts = Array.from(new Set(locations.map((l) => l.district)));
  const taluks = Array.from(new Set(locations.filter((l) => l.district === district).map((l) => l.taluk)));
  const hoblis = Array.from(new Set(locations.filter((l) => l.district === district && l.taluk === taluk).map((l) => l.hobli)));
  const villages = locations.filter((l) => l.district === district && l.taluk === taluk && l.hobli === hobli);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const matched = locations.find(
      (l) => l.district === district && l.taluk === taluk && l.hobli === hobli && l.village === village
    ) || locations.find((l) => l.district === district && l.taluk === taluk);

    const res = await apiFetch<{ user: UserProfile }>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({
        name,
        district,
        taluk,
        hobli,
        village,
        farm_size_acres: Number(farmSize) || 1,
        soil_type: soilType,
        irrigation_type: irrigationType,
        latitude: lat ?? matched?.latitude ?? 13.741,
        longitude: lng ?? matched?.longitude ?? 76.904,
        onboarding_completed: true,
      }),
    });
    onUserUpdate(res.user);
    setStatusMsg(lang === 'kn' ? 'ಸ್ಥಳ ಮತ್ತು ಪ್ರೊಫೈಲ್ ಉಳಿಸಲಾಗಿದೆ.' : 'Location and farm profile saved.');
  };

  const handleDetectGps = () => {
    if (!navigator.geolocation) {
      setStatusMsg(t.gpsError);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Number(pos.coords.latitude.toFixed(5)));
        setLng(Number(pos.coords.longitude.toFixed(5)));
        setStatusMsg(`${t.gpsSuccess} (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`);
      },
      () => {
        setStatusMsg(t.gpsError);
      },
      { timeout: 6000 }
    );
  };

  const handleAddPlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plotName.trim()) return;
    await apiFetch('/api/plots', {
      method: 'POST',
      body: JSON.stringify({
        name: plotName.trim(),
        district,
        taluk,
        hobli,
        village,
        area_acres: Number(plotArea) || 1,
        soil_type: soilType,
        irrigation_type: irrigationType,
        latitude: lat,
        longitude: lng,
      }),
    });
    setPlotName('');
    onRefreshAll();
  };

  const handleDeletePlot = async (id: number) => {
    await apiFetch(`/api/plots/${id}`, { method: 'DELETE' });
    onRefreshAll();
  };

  const handleMarkNotifRead = async (id: number) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
    onRefreshAll();
  };

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteBody.trim()) return;
    await onAddOfflineNote(noteTitle.trim(), noteBody.trim());
    setNoteTitle('');
    setNoteBody('');
  };

  if (mode === 'notifications') {
    return (
      <div className="space-y-6 max-w-3xl">
        <h1 className="text-2xl font-bold text-slate-900">{t.navNotifications}</h1>
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {notifications.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              {lang === 'kn' ? 'ಯಾವುದೇ ಹೊಸ ಸೂಚನೆಗಳಿಲ್ಲ.' : 'No notifications yet.'}
            </p>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className="p-4 sm:p-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-500 tabular-nums">{n.created_at}</p>
                  <p className={`text-sm font-bold mt-0.5 ${n.is_read ? 'text-slate-600' : 'text-slate-900'}`}>
                    {lang === 'kn' ? n.title_kn : n.title_en}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">{lang === 'kn' ? n.body_kn : n.body_en}</p>
                </div>
                {!n.is_read && (
                  <button
                    onClick={() => handleMarkNotifRead(n.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shrink-0"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#155E34]" />
                    <span>{lang === 'kn' ? 'ಓದಿದ್ದೇನೆ' : 'Read'}</span>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {mode === 'location' ? t.locationHierarchyTitle : t.navProfile}
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          {lang === 'kn'
            ? 'ದೇಶ → ರಾಜ್ಯ → ಜಿಲ್ಲೆ → ತಾಲ್ಲೂಕು → ಹೋಬಳಿ → ಗ್ರಾಮ ಮತ್ತು ಆಫ್‌ಲೈನ್ ಸಿಂಕ್'
            : 'Country → State → District → Taluk → Hobli → Village hierarchy, plots, and offline synchronization'}
        </p>
      </div>

      {statusMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {statusMsg}
        </div>
      )}

      {/* Offline Sync Status Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
            {isOnline ? <Wifi className="w-4 h-4 text-emerald-700" /> : <WifiOff className="w-4 h-4 text-amber-700" />}
            <span>{isOnline ? t.onlineStatus : t.offlineStatus}</span>
          </p>
          <p className="text-xs text-slate-600 tabular-nums">
            {t.pendingQueue}: <strong>{pendingCount}</strong> · {t.lastSynced}:{' '}
            {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : lang === 'kn' ? 'ಇನ್ನೂ ಸಿಂಕ್ ಆಗಿಲ್ಲ' : 'Not yet synced'}
          </p>
          <p className="text-[11px] text-slate-500">
            {lang === 'kn'
              ? 'ಬೆಳೆ ವೇಳಾಪಟ್ಟಿ, ಯೋಜನೆಗಳು ಮತ್ತು ಟಿಪ್ಪಣಿಗಳು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿ ಲಭ್ಯ; ಲೈವ್ ಹವಾಮಾನ ಮತ್ತು ಹೊಸ ಬಾಡಿಗೆ ವಿಚಾರಣೆಗೆ ಇಂಟರ್ನೆಟ್ ಅಗತ್ಯ.'
              : 'Saved crop calendars, schemes, and field notes work offline. Live weather refresh and rental enquiries require connectivity.'}
          </p>
        </div>

        <button
          onClick={onSyncNow}
          disabled={!isOnline}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 min-h-[44px] shrink-0"
        >
          <RefreshCw className="w-4 h-4 text-[#155E34]" />
          <span>{t.syncNow}</span>
        </button>
      </div>

      {mode === 'profile' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#155E34]" />
                <span>{lang === 'kn' ? 'ಖಾತೆ ಮತ್ತು ದೃಢೀಕರಣ ಸ್ಥಿತಿ' : 'Account & Verification Status'}</span>
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                {user.identifier}
                {' · '}
                {user.auth_provider === 'google'
                  ? 'Google Sign-In'
                  : user.auth_provider === 'password+google'
                  ? 'Email / Password + Google'
                  : lang === 'kn'
                  ? 'SQLite ಪಾಸ್‌ವರ್ಡ್ ಖಾತೆ'
                  : 'SQLite Account'}
              </p>
            </div>
          </div>

          <VerificationStatusPanel
            lang={lang}
            identifier={user.identifier}
            purpose="account_verify"
            issueSession={false}
            onVerified={({ user: verifiedUser, token }) => {
              if (token) setStoredToken(token);
              if (verifiedUser) {
                onUserUpdate(verifiedUser);
              }
            }}
          />
        </div>
      )}

      {/* Location & Profile Form */}
      <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#155E34]" />
            <span>{t.locationHierarchyTitle}</span>
          </h2>
          <button
            type="button"
            onClick={handleDetectGps}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Compass className="w-4 h-4 text-[#155E34]" />
            <span>{t.useGps}</span>
          </button>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 text-xs text-slate-600 bg-slate-50 rounded-xl p-3">
          <div>{t.countryLabel}: <strong className="text-slate-900">India</strong></div>
          <div>{t.stateLabel}: <strong className="text-slate-900">Karnataka (ಕರ್ನಾಟಕ)</strong></div>
          <div className="tabular-nums">GPS: <strong className="text-slate-900">{lat ? `${lat}, ${lng}` : 'Taluk centroid'}</strong></div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.districtLabel}</label>
            <select
              value={district}
              onChange={(e) => {
                const d = e.target.value;
                setDistrict(d);
                const first = locations.find((l) => l.district === d);
                if (first) {
                  setTaluk(first.taluk);
                  setHobli(first.hobli);
                  setVillage(first.village);
                  setLat(first.latitude);
                  setLng(first.longitude);
                }
              }}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
            >
              {districts.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.talukLabel}</label>
            <select
              value={taluk}
              onChange={(e) => {
                const tk = e.target.value;
                setTaluk(tk);
                const first = locations.find((l) => l.district === district && l.taluk === tk);
                if (first) {
                  setHobli(first.hobli);
                  setVillage(first.village);
                  setLat(first.latitude);
                  setLng(first.longitude);
                }
              }}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
            >
              {taluks.map((tk) => (
                <option key={tk} value={tk}>{tk}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.hobliLabel}</label>
            <select
              value={hobli}
              onChange={(e) => {
                const hb = e.target.value;
                setHobli(hb);
                const first = locations.find((l) => l.district === district && l.taluk === taluk && l.hobli === hb);
                if (first) {
                  setVillage(first.village);
                  setLat(first.latitude);
                  setLng(first.longitude);
                }
              }}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
            >
              {hoblis.map((hb) => (
                <option key={hb} value={hb}>{hb}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.villageLabel}</label>
            <select
              value={village}
              onChange={(e) => {
                const v = e.target.value;
                setVillage(v);
                const found = villages.find((item) => item.village === v);
                if (found) {
                  setLat(found.latitude);
                  setLng(found.longitude);
                }
              }}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
            >
              {villages.map((v) => (
                <option key={v.id} value={v.village}>{lang === 'kn' ? v.village_kn : v.village}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.nameLabel}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.farmSizeLabel}</label>
            <input
              type="number"
              step="0.25"
              value={farmSize}
              onChange={(e) => setFarmSize(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.soilTypeLabel}</label>
            <select
              value={soilType}
              onChange={(e) => setSoilType(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
            >
              <option value="Red Sandy Loam">Red Sandy Loam</option>
              <option value="Red Clay Loam">Red Clay Loam</option>
              <option value="Black Cotton Soil">Black Cotton Soil</option>
              <option value="Alluvial Loam">Alluvial Loam</option>
              <option value="Unknown">Unknown</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.irrigationLabel}</label>
            <select
              value={irrigationType}
              onChange={(e) => setIrrigationType(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
            >
              <option value="Rainfed">Rainfed</option>
              <option value="Borewell + Rainfed">Borewell + Rainfed</option>
              <option value="Drip / Borewell">Drip Irrigation</option>
              <option value="Canal / Tank">Canal / Tank</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          className="rounded-xl bg-[#155E34] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#114B29] min-h-[44px]"
        >
          {t.saveLocation}
        </button>
      </form>

      {/* Multiple Plots Manager */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900">{t.myPlots}</h2>
        <div className="divide-y divide-slate-100">
          {plots.map((p) => (
            <div key={p.id} className="py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                <p className="text-xs text-slate-500 tabular-nums">
                  {p.village}, {p.taluk} · {p.area_acres} {lang === 'kn' ? 'ಎಕರೆ' : 'acres'} · {p.soil_type} · {p.irrigation_type}
                </p>
              </div>
              <button
                onClick={() => handleDeletePlot(p.id)}
                className="p-2 text-slate-400 hover:text-red-600"
                title="Remove plot"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={handleAddPlot} className="pt-3 border-t border-slate-200 grid sm:grid-cols-4 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.addPlot}</label>
            <input
              type="text"
              value={plotName}
              onChange={(e) => setPlotName(e.target.value)}
              placeholder={lang === 'kn' ? 'ಉದಾ: ಸರ್ವೆ ನಂ. 18 (ಹಳ್ಳದ ಹತ್ತಿರ)' : 'e.g. Survey No. 18 (Near Tank)'}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.farmSizeLabel}</label>
            <input
              type="number"
              step="0.25"
              value={plotArea}
              onChange={(e) => setPlotArea(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#155E34] px-4 py-2 text-sm font-semibold text-white hover:bg-[#114B29] min-h-[38px]"
          >
            <Plus className="w-4 h-4" />
            <span>{lang === 'kn' ? 'ಸೇರಿಸಿ' : 'Add'}</span>
          </button>
        </form>
      </div>

      {/* Offline Field Notes */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-[#155E34]" />
          <span>{t.fieldNotesTitle}</span>
        </h2>

        <form onSubmit={handleNoteSubmit} className="space-y-3">
          <input
            type="text"
            required
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            placeholder={lang === 'kn' ? 'ಟಿಪ್ಪಣಿ ಶೀರ್ಷಿಕೆ (ಉದಾ: ಗೊಬ್ಬರ ಖರೀದಿ)' : 'Note title (e.g. Urea bag purchase)'}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
          />
          <textarea
            rows={2}
            required
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder={lang === 'kn' ? 'ಇಂಟರ್ನೆಟ್ ಇಲ್ಲದಿದ್ದರೂ ಟಿಪ್ಪಣಿ ಉಳಿಸಬಹುದು...' : 'Works offline — synced automatically when internet returns...'}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
          />
          <button type="submit" className="rounded-xl bg-[#155E34] px-4 py-2 text-sm font-semibold text-white">
            {t.saveNote}
          </button>
        </form>

        <div className="divide-y divide-slate-100">
          {notes.map((n) => (
            <div key={n.id} className="py-3">
              <p className="text-sm font-semibold text-slate-900">{n.title}</p>
              <p className="text-xs text-slate-600 mt-0.5">{n.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
