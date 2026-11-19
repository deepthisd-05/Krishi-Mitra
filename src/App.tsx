import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CalendarDays,
  CloudRain,
  FlaskConical,
  Home,
  Landmark,
  Languages,
  Leaf,
  LogOut,
  MapPin,
  Menu,
  Mic,
  RefreshCw,
  Shield,
  Store,
  Tractor,
  TrendingUp,
  User,
  WifiOff,
  X,
} from 'lucide-react';
import { PWAInstallButton } from './components/PWAInstallButton';
import { useOnlineStatus } from './hooks/usePWAInstall';
import { useT, type Lang } from './i18n/translations';
import {
  apiFetch,
  enqueueOfflineAction,
  getPendingQueue,
  getStoredToken,
  setStoredToken,
  syncPendingOfflineActions,
} from './lib/api';
import { cacheDelete, cacheGet, cacheSet, getLastSyncTimestamp } from './lib/offlineDb';
import { AdminPage } from './pages/AdminPage';
import { CropCalendarPage } from './pages/CropCalendarPage';
import { DashboardPage, type NavTab } from './pages/DashboardPage';
import { LandingAndAuth, OnboardingWizard } from './pages/LandingAndAuth';
import { LeafScanPage } from './pages/LeafScanPage';
import { ProfileLocationPage } from './pages/ProfileLocationPage';
import { MarketPricesPage, SchemesPage } from './pages/SchemesAndMarketPage';
import { ServicesPage } from './pages/ServicesPage';
import { SoilHealthPage } from './pages/SoilHealthPage';
import { VoiceAssistantPage } from './pages/VoiceAssistantPage';
import { WeatherPage } from './pages/WeatherPage';
import type {
  AgroShop,
  AppNotification,
  CalendarTask,
  CropCalendar,
  CropInfo,
  EquipmentRental,
  FarmPlot,
  FieldNote,
  GovScheme,
  KarnatakaLocation,
  LeafScan,
  LeafScansResponse,
  MarketPrice,
  MarketPricesResponse,
  NutrientStatus,
  SoilInputItem,
  SoilPlan,
  SoilPlansResponse,
  UserProfile,
  WeatherData,
} from './types';

export default function App() {
  const isOnline = useOnlineStatus();
  const [lang, setLang] = useState<Lang>('kn');
  const t = useT(lang);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [publicView, setPublicView] = useState<'weather' | 'schemes' | 'market' | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Domain Datasets
  const [locations, setLocations] = useState<KarnatakaLocation[]>([]);
  const [crops, setCrops] = useState<CropInfo[]>([]);
  const [calendars, setCalendars] = useState<CropCalendar[]>([]);
  const [plots, setPlots] = useState<FarmPlot[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [shops, setShops] = useState<AgroShop[]>([]);
  const [rentals, setRentals] = useState<EquipmentRental[]>([]);
  const [schemes, setSchemes] = useState<GovScheme[]>([]);
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [marketData, setMarketData] = useState<MarketPricesResponse | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [leafScans, setLeafScans] = useState<LeafScan[]>([]);
  const [leafScansMeta, setLeafScansMeta] = useState<Pick<
    LeafScansResponse,
    'aiConfigured' | 'fetched_at' | '_fromOfflineCache' | '_cachedAt'
  > | null>(null);
  const [leafScansLoading, setLeafScansLoading] = useState(false);
  const [soilPlans, setSoilPlans] = useState<SoilPlan[]>([]);
  const [soilPlansMeta, setSoilPlansMeta] = useState<Pick<
    SoilPlansResponse,
    'fetched_at' | '_fromOfflineCache' | '_cachedAt'
  > | null>(null);
  const [soilPlansLoading, setSoilPlansLoading] = useState(false);

  // Offline queue tracking
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncingNow, setSyncingNow] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState('');

  const refreshQueueMeta = useCallback(async () => {
    const q = await getPendingQueue();
    setPendingCount(q.length);
    const ts = await getLastSyncTimestamp();
    setLastSyncedAt(ts);
  }, []);

  const fetchMarketPrices = useCallback(async (refresh = false) => {
    setMarketLoading(true);
    try {
      const marketRes = await apiFetch<MarketPricesResponse>(
        `/api/market-prices${refresh ? '?refresh=1' : ''}`,
        {},
        'market_prices'
      );
      setMarketData(marketRes);
      setPrices(marketRes.prices || []);
    } catch {
      // Offline cache handled inside apiFetch
    } finally {
      setMarketLoading(false);
    }
  }, []);

  const fetchPublicDatasets = useCallback(async (lat = 13.741, lng = 76.904, _label = 'Sira, Tumakuru') => {
    try {
      const [locRes, cropRes, schemeRes, shopRes, rentalRes] = await Promise.all([
        apiFetch<{ locations: KarnatakaLocation[] }>('/api/locations', {}, 'locations'),
        apiFetch<{ crops: CropInfo[] }>('/api/crops', {}, 'crops'),
        apiFetch<{ schemes: GovScheme[] }>('/api/schemes', {}, 'schemes'),
        apiFetch<{ shops: AgroShop[] }>(`/api/shops?lat=${lat}&lng=${lng}`, {}, 'shops'),
        apiFetch<{ rentals: EquipmentRental[] }>(`/api/rentals?lat=${lat}&lng=${lng}`, {}, 'rentals'),
        fetchMarketPrices(false),
      ]);
      setLocations(locRes.locations || []);
      setCrops(cropRes.crops || []);
      setSchemes(schemeRes.schemes || []);
      setShops(shopRes.shops || []);
      setRentals(rentalRes.rentals || []);
    } catch {
      // Offline cache handled inside apiFetch
    }
  }, [fetchMarketPrices]);

  const fetchWeather = useCallback(async (lat = 13.741, lng = 76.904, label = 'Sira, Tumakuru', refresh = false) => {
    setWeatherLoading(true);
    try {
      const w = await apiFetch<WeatherData>(
        `/api/weather?lat=${lat}&lng=${lng}&label=${encodeURIComponent(label)}${refresh ? '&refresh=1' : ''}`,
        {},
        `weather_${lat.toFixed(2)}_${lng.toFixed(2)}`
      );
      setWeather(w);
    } catch {
      // keep cached weather if present
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  const fetchLeafScans = useCallback(async () => {
    setLeafScansLoading(true);
    try {
      const res = await apiFetch<LeafScansResponse>('/api/leaf-scans', {}, 'leaf_scans');
      setLeafScans(res.scans || []);
      setLeafScansMeta({
        aiConfigured: res.aiConfigured ?? true,
        fetched_at: res.fetched_at,
        _fromOfflineCache: res._fromOfflineCache,
        _cachedAt: res._cachedAt ?? res.fetched_at,
      });
    } catch {
      // Offline cache handled inside apiFetch
    } finally {
      setLeafScansLoading(false);
    }
  }, []);

  const fetchSoilPlans = useCallback(async () => {
    setSoilPlansLoading(true);
    try {
      const res = await apiFetch<SoilPlansResponse>('/api/soil-plans', {}, 'soil_plans');
      setSoilPlans(res.plans || []);
      setSoilPlansMeta({
        fetched_at: res.fetched_at,
        _fromOfflineCache: res._fromOfflineCache,
        _cachedAt: res._cachedAt ?? res.fetched_at,
      });
    } catch {
      // Offline cache handled inside apiFetch
    } finally {
      setSoilPlansLoading(false);
    }
  }, []);

  const fetchFarmerDatasets = useCallback(async (currentUser: UserProfile) => {
    const lat = currentUser.latitude ?? 13.741;
    const lng = currentUser.longitude ?? 76.904;
    const label = `${currentUser.taluk}, ${currentUser.district}`;

    await Promise.all([
      fetchPublicDatasets(lat, lng, label),
      fetchWeather(lat, lng, label),
      fetchLeafScans(),
      fetchSoilPlans(),
      apiFetch<{ calendars: CropCalendar[] }>('/api/calendars', {}, 'calendars')
        .then((r) => setCalendars(r.calendars || []))
        .catch(() => {}),
      apiFetch<{ plots: FarmPlot[] }>('/api/plots', {}, 'plots')
        .then((r) => setPlots(r.plots || []))
        .catch(() => {}),
      apiFetch<{ notifications: AppNotification[] }>('/api/notifications', {}, 'notifications')
        .then((r) => setNotifications(r.notifications || []))
        .catch(() => {}),
      apiFetch<{ notes: FieldNote[] }>('/api/notes', {}, 'notes')
        .then((r) => setNotes(r.notes || []))
        .catch(() => {}),
    ]);
  }, [fetchLeafScans, fetchPublicDatasets, fetchSoilPlans, fetchWeather]);

  // Initial Boot & Session Check
  useEffect(() => {
    let mounted = true;
    (async () => {
      await refreshQueueMeta();
      await fetchPublicDatasets();
      await fetchWeather();

      const token = getStoredToken();
      if (token || navigator.onLine) {
        try {
          const me = await apiFetch<{ user: UserProfile }>('/api/auth/me');
          if (mounted && me.user) {
            setUser(me.user);
            setLang(me.user.preferred_lang || 'kn');
            await cacheSet('user_profile', me.user);
            await fetchFarmerDatasets(me.user);
          }
        } catch {
          const cachedProfile = await cacheGet<UserProfile>('user_profile');
          if (mounted && cachedProfile?.value && token) {
            setUser(cachedProfile.value);
            setLang(cachedProfile.value.preferred_lang || 'kn');
            await fetchFarmerDatasets(cachedProfile.value);
          }
        }
      }
      if (mounted) setAuthChecked(true);
    })();
    return () => {
      mounted = false;
    };
  }, [fetchFarmerDatasets, fetchPublicDatasets, fetchWeather, refreshQueueMeta]);

  // Automatic Background Sync when returning online
  const handleSyncNow = useCallback(async () => {
    if (!user || syncingNow) return;
    setSyncingNow(true);
    try {
      const res = await syncPendingOfflineActions();
      await refreshQueueMeta();
      if (res.synced > 0 || res.conflicts > 0) {
        await fetchFarmerDatasets(user);
        setSyncFeedback(
          lang === 'kn'
            ? `${res.synced} ಆಫ್‌ಲೈನ್ ಕಾರ್ಯಗಳು ಸಿಂಕ್ ಆಗಿವೆ.`
            : `${res.synced} queued action(s) synced to your account.`
        );
      }
    } finally {
      setSyncingNow(false);
    }
  }, [user, syncingNow, refreshQueueMeta, fetchFarmerDatasets, lang]);

  useEffect(() => {
    if (isOnline && user) {
      handleSyncNow();
    }
  }, [isOnline, user, handleSyncNow]);

  useEffect(() => {
    if (activeTab === 'admin' && user?.role !== 'admin') {
      setActiveTab('dashboard');
    }
  }, [activeTab, user?.role]);

  const handleToggleLang = async () => {
    const next: Lang = lang === 'kn' ? 'en' : 'kn';
    setLang(next);
    if (user && isOnline) {
      try {
        const res = await apiFetch<{ user: UserProfile }>('/api/profile', {
          method: 'PUT',
          body: JSON.stringify({ preferred_lang: next }),
        });
        setUser(res.user);
        await cacheSet('user_profile', res.user);
      } catch {
        // ignore offline language update
      }
    }
  };

  const handleAuthSuccess = async (loggedInUser: UserProfile) => {
    setUser(loggedInUser);
    setPublicView(null);
    setLang(loggedInUser.preferred_lang || 'kn');
    setActiveTab('dashboard');
    await cacheSet('user_profile', loggedInUser);
    await fetchFarmerDatasets(loggedInUser);
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setStoredToken(null);
    setUser(null);
    setCalendars([]);
    setPlots([]);
    setNotifications([]);
    setNotes([]);
    setLeafScans([]);
    setLeafScansMeta(null);
    setSoilPlans([]);
    setSoilPlansMeta(null);
    await Promise.all([
      cacheDelete('user_profile'),
      cacheDelete('calendars'),
      cacheDelete('plots'),
      cacheDelete('notifications'),
      cacheDelete('notes'),
      cacheDelete('leaf_scans'),
      cacheDelete('soil_plans'),
    ]);
    setActiveTab('dashboard');
  };

  const handleCreateCalendar = async (payload: Record<string, unknown>) => {
    await apiFetch('/api/calendars', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (user) await fetchFarmerDatasets(user);
  };

  const handleDeleteCalendar = async (id: number) => {
    await apiFetch(`/api/calendars/${id}`, { method: 'DELETE' });
    if (user) await fetchFarmerDatasets(user);
  };

  const handleUpdateTaskStatus = async (task: CalendarTask, status: 'pending' | 'completed' | 'missed') => {
    // Optimistic UI update + offline queue fallback
    const updatedCals = calendars.map((c) =>
      c.id === task.calendar_id
        ? { ...c, tasks: c.tasks.map((tk) => (tk.id === task.id ? { ...tk, status } : tk)) }
        : c
    );
    setCalendars(updatedCals);
    await cacheSet('calendars', { calendars: updatedCals });

    if (isOnline) {
      try {
        await apiFetch(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        });
        return;
      } catch {
        // fallback to offline queue
      }
    }
    await enqueueOfflineAction({
      type: 'TASK_UPDATE',
      payload: { taskId: task.id, status },
    });
    await refreshQueueMeta();
  };

  const handleRescheduleTask = async (task: CalendarTask, newDueDate: string) => {
    const oldDueMs = Date.parse(`${task.due_date}T00:00:00Z`);
    const oldEndMs = Date.parse(`${task.end_date || task.due_date}T00:00:00Z`);
    const newDueMs = Date.parse(`${newDueDate}T00:00:00Z`);
    const spanDays =
      !Number.isNaN(oldDueMs) && !Number.isNaN(oldEndMs)
        ? Math.max(0, Math.round((oldEndMs - oldDueMs) / 86400000))
        : 0;
    const newEndDate = !Number.isNaN(newDueMs)
      ? new Date(newDueMs + spanDays * 86400000).toISOString().slice(0, 10)
      : newDueDate;

    const updatedCals = calendars.map((c) =>
      c.id === task.calendar_id
        ? {
            ...c,
            tasks: c.tasks.map((tk) =>
              tk.id === task.id ? { ...tk, due_date: newDueDate, end_date: newEndDate } : tk
            ),
          }
        : c
    );
    setCalendars(updatedCals);
    await cacheSet('calendars', { calendars: updatedCals });

    if (isOnline) {
      try {
        await apiFetch(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ due_date: newDueDate, end_date: newEndDate }),
        });
        return;
      } catch {
        // fallback to offline queue
      }
    }
    await enqueueOfflineAction({
      type: 'TASK_UPDATE',
      payload: { taskId: task.id, status: task.status, dueDate: newDueDate, endDate: newEndDate },
    });
    await refreshQueueMeta();
  };

  const handleCreateSoilPlan = async (payload: {
    plot_name: string;
    crop_code: string;
    crop_name_en: string;
    crop_name_kn: string;
    crop_stage: string;
    soil_type: string;
    ph_level: number | null;
    n_status: NutrientStatus;
    p_status: NutrientStatus;
    k_status: NutrientStatus;
    area_acres: number;
    planned_inputs: SoilInputItem[];
    notes: string;
  }): Promise<{ queuedOffline: boolean }> => {
    if (isOnline) {
      try {
        const res = await apiFetch<{ plan: SoilPlan }>('/api/soil-plans', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const nextPlans = [res.plan, ...soilPlans];
        setSoilPlans(nextPlans);
        await cacheSet('soil_plans', { plans: nextPlans, fetched_at: new Date().toISOString() });
        return { queuedOffline: false };
      } catch {
        // fall through to offline queue
      }
    }

    const totalCost = payload.planned_inputs.reduce(
      (acc, it) => acc + Math.max(0, Number(it.estimated_cost_inr) || 0),
      0
    );
    const optimistic: SoilPlan = {
      id: -Date.now(),
      user_id: user?.id ?? 0,
      plot_name: payload.plot_name,
      crop_code: payload.crop_code,
      crop_name_en: payload.crop_name_en,
      crop_name_kn: payload.crop_name_kn,
      crop_stage: payload.crop_stage,
      soil_type: payload.soil_type,
      ph_level: payload.ph_level,
      n_status: payload.n_status,
      p_status: payload.p_status,
      k_status: payload.k_status,
      area_acres: payload.area_acres,
      planned_inputs: payload.planned_inputs,
      total_estimated_cost_inr: Math.round(totalCost),
      notes: payload.notes,
      added_calendar_id: null,
      added_task_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const nextPlans = [optimistic, ...soilPlans];
    setSoilPlans(nextPlans);
    await cacheSet('soil_plans', { plans: nextPlans, fetched_at: new Date().toISOString() });
    await enqueueOfflineAction({
      type: 'SOIL_PLAN',
      payload,
    });
    await refreshQueueMeta();
    return { queuedOffline: true };
  };

  const handleDeleteSoilPlan = async (planId: number) => {
    await apiFetch(`/api/soil-plans/${planId}`, { method: 'DELETE' });
    const nextPlans = soilPlans.filter((p) => p.id !== planId);
    setSoilPlans(nextPlans);
    await cacheSet('soil_plans', { plans: nextPlans, fetched_at: new Date().toISOString() });
  };

  const handleAddSoilPlanToCalendar = async (planId: number, calendarId: number | null, dueDate: string) => {
    const res = await apiFetch<{ plan: SoilPlan; calendar_id: number }>(`/api/soil-plans/${planId}/add-to-calendar`, {
      method: 'POST',
      body: JSON.stringify({
        calendar_id: calendarId,
        due_date: dueDate,
        auto_create_calendar: true,
      }),
    });
    const nextPlans = soilPlans.map((p) => (p.id === planId ? res.plan : p));
    setSoilPlans(nextPlans);
    await cacheSet('soil_plans', { plans: nextPlans, fetched_at: new Date().toISOString() });
    const calRes = await apiFetch<{ calendars: CropCalendar[] }>('/api/calendars', {}, 'calendars');
    setCalendars(calRes.calendars || []);
  };

  const handleQueueLeafAddToCalendar = async (scan: LeafScan, dueDate: string, calendarId: number | null) => {
    await enqueueOfflineAction({
      type: 'LEAF_ADD_TO_CALENDAR',
      payload: {
        scanId: scan.id,
        dueDate,
        calendarId,
      },
    });
    await refreshQueueMeta();
  };

  const handleAddCustomTask = async (payload: { calendarId: number; title: string; description: string; dueDate: string }) => {
    if (isOnline) {
      try {
        await apiFetch('/api/tasks', {
          method: 'POST',
          body: JSON.stringify({
            calendar_id: payload.calendarId,
            title_en: payload.title,
            title_kn: payload.title,
            description_en: payload.description,
            due_date: payload.dueDate,
          }),
        });
        if (user) await fetchFarmerDatasets(user);
        return;
      } catch {
        // queue offline
      }
    }
    await enqueueOfflineAction({
      type: 'CUSTOM_TASK',
      payload,
    });
    await refreshQueueMeta();
  };

  const handleAddOfflineNote = async (title: string, content: string) => {
    if (isOnline) {
      try {
        await apiFetch('/api/notes', {
          method: 'POST',
          body: JSON.stringify({ title, content }),
        });
        if (user) await fetchFarmerDatasets(user);
        return;
      } catch {
        // fallback
      }
    }
    const optimistic: FieldNote = {
      id: Date.now(),
      title,
      content,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const nextNotes = [optimistic, ...notes];
    setNotes(nextNotes);
    await cacheSet('notes', { notes: nextNotes });
    await enqueueOfflineAction({
      type: 'FIELD_NOTE',
      payload: { title, content },
    });
    await refreshQueueMeta();
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#F8FAF8] flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <p className="text-xl font-bold text-[#155E34]">{t.brandName}</p>
          <p className="text-sm text-slate-500">{lang === 'kn' ? 'ಲೋಡ್ ಆಗುತ್ತಿದೆ...' : 'Loading Krishi Mitra...'}</p>
        </div>
      </div>
    );
  }

  // Public Explorer Mode (for unauthenticated visitors checking Weather, Schemes, or APMC Prices)
  if (!user && publicView) {
    return (
      <div className="min-h-screen bg-[#F8FAF8]">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-3 sm:px-6 py-3 flex items-center justify-between gap-2 sm:gap-4">
          <button onClick={() => setPublicView(null)} className="text-base sm:text-lg font-bold text-[#155E34] truncate min-w-0">
            {t.brandName}
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleToggleLang}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-700 min-h-[38px] whitespace-nowrap shrink-0"
            >
              <Languages className="w-4 h-4 text-[#155E34] shrink-0" />
              <span>{lang === 'kn' ? 'EN' : 'ಕನ್ನಡ'}</span>
            </button>
            <button
              onClick={() => setPublicView(null)}
              className="rounded-xl bg-[#155E34] px-3 sm:px-4 py-2 text-xs font-semibold text-white min-h-[38px] whitespace-nowrap shrink-0"
            >
              {lang === 'kn' ? 'ಲಾಗಿನ್' : 'Sign In'}
            </button>
          </div>
        </header>
        {!isOnline && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5 text-xs font-medium text-amber-950 flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
            <span>{t.offlineBanner}</span>
          </div>
        )}
        <main className="max-w-6xl mx-auto p-4 sm:p-6">
          {publicView === 'weather' && (
            <WeatherPage
              lang={lang}
              weather={weather}
              loading={weatherLoading}
              isOnline={isOnline}
              onRefresh={() => fetchWeather(13.741, 76.904, 'Sira, Tumakuru', true)}
            />
          )}
          {publicView === 'schemes' && <SchemesPage lang={lang} schemes={schemes} />}
          {publicView === 'market' && (
            <MarketPricesPage
              lang={lang}
              prices={prices}
              marketData={marketData}
              loading={marketLoading}
              isOnline={isOnline}
              onRefresh={() => fetchMarketPrices(true)}
            />
          )}
        </main>
      </div>
    );
  }

  // Landing & Auth screen
  if (!user) {
    return (
      <LandingAndAuth
        lang={lang}
        onToggleLang={handleToggleLang}
        onAuthSuccess={handleAuthSuccess}
        onExplorePublic={(tab) => setPublicView(tab)}
      />
    );
  }

  // Farmer Onboarding Wizard for newly registered accounts
  if (user.role === 'farmer' && !user.onboarding_completed) {
    return (
      <OnboardingWizard
        lang={lang}
        user={user}
        locations={locations}
        onComplete={async (updated) => {
          setUser(updated);
          await cacheSet('user_profile', updated);
          await fetchFarmerDatasets(updated);
        }}
      />
    );
  }

  const unreadNotifs = notifications.filter((n) => !n.is_read).length;

  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: t.navDashboard, icon: <Home className="w-4 h-4" /> },
    { id: 'calendar', label: t.navCalendar, icon: <CalendarDays className="w-4 h-4" /> },
    { id: 'weather', label: t.navWeather, icon: <CloudRain className="w-4 h-4" /> },
    { id: 'voice', label: t.navVoice, icon: <Mic className="w-4 h-4" /> },
    { id: 'leaf_scan', label: t.navLeafScan, icon: <Leaf className="w-4 h-4" /> },
    { id: 'soil_health', label: t.navSoilHealth, icon: <FlaskConical className="w-4 h-4" /> },
    { id: 'shops', label: t.navShops, icon: <Store className="w-4 h-4" /> },
    { id: 'rentals', label: t.navRentals, icon: <Tractor className="w-4 h-4" /> },
    { id: 'schemes', label: t.navSchemes, icon: <Landmark className="w-4 h-4" /> },
    { id: 'market', label: t.navMarket, icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'location', label: t.navLocation, icon: <MapPin className="w-4 h-4" /> },
    { id: 'notifications', label: `${t.navNotifications}${unreadNotifs ? ` (${unreadNotifs})` : ''}`, icon: <Bell className="w-4 h-4" /> },
    { id: 'profile', label: t.navProfile, icon: <User className="w-4 h-4" /> },
  ];

  if (user.role === 'admin') {
    navItems.push({ id: 'admin', label: t.navAdmin, icon: <Shield className="w-4 h-4" /> });
  }

  return (
    <div className="min-h-screen bg-[#F8FAF8] flex">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white z-30">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight text-[#155E34] whitespace-nowrap">
            {t.brandName}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors text-left min-h-[42px] ${
                  active
                    ? 'bg-emerald-50 text-[#155E34] font-semibold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-2 text-slate-600">
            <span className={isOnline ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>
              {isOnline ? t.onlineStatus : t.offlineStatus}
            </span>
            {pendingCount > 0 && (
              <span className="tabular-nums font-mono text-slate-700">
                {pendingCount} {lang === 'kn' ? 'ಕ್ಯೂ' : 'queued'}
              </span>
            )}
          </div>
          {isOnline && pendingCount > 0 && (
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncingNow}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#155E34] px-3 py-2 text-xs font-semibold text-white hover:bg-[#114B29] disabled:opacity-60 min-h-[38px]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingNow ? 'animate-spin' : ''}`} />
              <span>{t.syncNow}</span>
            </button>
          )}
          <button
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 min-h-[38px]"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t.logout}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 h-14 border-b border-slate-200 bg-white/95 backdrop-blur-md px-2.5 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1 text-slate-700 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="lg:hidden text-sm sm:text-base font-bold text-[#155E34] truncate min-w-0">{t.brandName}</span>
            <span className="hidden lg:inline text-sm font-medium text-slate-500 truncate">
              {user.village}, {user.taluk}, {user.district}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              onClick={handleToggleLang}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 min-h-[40px] whitespace-nowrap shrink-0"
            >
              <Languages className="w-3.5 h-3.5 text-[#155E34] shrink-0" />
              <span>{lang === 'kn' ? 'English' : 'ಕನ್ನಡ'}</span>
            </button>
            <PWAInstallButton lang={lang} />
          </div>
        </header>

        {/* Offline & Pending Sync Feedback Banner */}
        {(!isOnline || pendingCount > 0 || syncFeedback) && (
          <div
            className={`border-b px-3 sm:px-6 py-2 text-xs font-medium flex flex-wrap items-center justify-between gap-2 ${
              !isOnline
                ? 'bg-amber-50 border-amber-200 text-amber-950'
                : pendingCount > 0
                ? 'bg-blue-50 border-blue-200 text-blue-950'
                : 'bg-emerald-50 border-emerald-200 text-emerald-950'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {!isOnline && <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />}
              <span className="leading-snug">
                {!isOnline
                  ? `${t.offlineBanner}${
                      pendingCount > 0 ? ` (${pendingCount} ${t.offlineQueuedBar})` : ''
                    }`
                  : pendingCount > 0
                  ? `${pendingCount} ${t.offlineQueuedBar}`
                  : syncFeedback}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isOnline && pendingCount > 0 && (
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={syncingNow}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#155E34] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#114B29] disabled:opacity-60 min-h-[36px] whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingNow ? 'animate-spin' : ''}`} />
                  <span>{t.syncNow}</span>
                </button>
              )}
              {syncFeedback && pendingCount === 0 && isOnline && (
                <button
                  type="button"
                  onClick={() => setSyncFeedback('')}
                  className="text-xs font-semibold underline px-2 py-1 min-h-[36px]"
                >
                  {lang === 'kn' ? 'ಮುಚ್ಚಿ' : 'Dismiss'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Active Page Body (bottom padding accommodates mobile bottom tab bar) */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-10 max-w-6xl w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardPage
              lang={lang}
              user={user}
              weather={weather}
              calendars={calendars}
              shops={shops}
              prices={prices}
              marketFeedStatus={marketData?.feed_status}
              schemes={schemes}
              isOnline={isOnline}
              pendingCount={pendingCount}
              onNavigate={(tab) => setActiveTab(tab)}
              onToggleTask={(task) => handleUpdateTaskStatus(task, 'completed')}
              onRescheduleTask={handleRescheduleTask}
            />
          )}

          {activeTab === 'calendar' && (
            <CropCalendarPage
              lang={lang}
              user={user}
              crops={crops}
              locations={locations}
              calendars={calendars}
              weather={weather}
              onCreateCalendar={handleCreateCalendar}
              onDeleteCalendar={handleDeleteCalendar}
              onUpdateTaskStatus={handleUpdateTaskStatus}
              onRescheduleTask={handleRescheduleTask}
              onAddCustomTask={handleAddCustomTask}
            />
          )}

          {activeTab === 'weather' && (
            <WeatherPage
              lang={lang}
              weather={weather}
              loading={weatherLoading}
              isOnline={isOnline}
              onRefresh={() =>
                fetchWeather(user.latitude ?? 13.741, user.longitude ?? 76.904, `${user.taluk}, ${user.district}`, true)
              }
            />
          )}

          {activeTab === 'leaf_scan' && (
            <LeafScanPage
              lang={lang}
              user={user}
              crops={crops}
              calendars={calendars}
              scans={leafScans}
              scansMeta={leafScansMeta}
              scansLoading={leafScansLoading}
              isOnline={isOnline}
              onRefreshScans={() => fetchLeafScans()}
              onScansChanged={async (nextScans) => {
                setLeafScans(nextScans);
                await cacheSet('leaf_scans', {
                  scans: nextScans,
                  aiConfigured: leafScansMeta?.aiConfigured ?? true,
                  fetched_at: new Date().toISOString(),
                });
              }}
              onCalendarUpdated={async () => {
                const res = await apiFetch<{ calendars: CropCalendar[] }>('/api/calendars', {}, 'calendars');
                setCalendars(res.calendars || []);
              }}
              onQueueAddToCalendar={handleQueueLeafAddToCalendar}
              onNavigateToCalendar={() => setActiveTab('calendar')}
            />
          )}

          {activeTab === 'soil_health' && (
            <SoilHealthPage
              lang={lang}
              user={user}
              crops={crops}
              calendars={calendars}
              shops={shops}
              plans={soilPlans}
              plansMeta={soilPlansMeta}
              loading={soilPlansLoading}
              isOnline={isOnline}
              onRefresh={() => fetchSoilPlans()}
              onCreateSoilPlan={handleCreateSoilPlan}
              onDeleteSoilPlan={handleDeleteSoilPlan}
              onAddPlanToCalendar={handleAddSoilPlanToCalendar}
              onNavigateToCalendar={() => setActiveTab('calendar')}
              onNavigateToShops={() => setActiveTab('shops')}
            />
          )}

          {(activeTab === 'shops' || activeTab === 'rentals') && (
            <ServicesPage
              mode={activeTab}
              lang={lang}
              user={user}
              shops={shops}
              rentals={rentals}
              onRefresh={() => fetchFarmerDatasets(user)}
            />
          )}

          {activeTab === 'schemes' && <SchemesPage lang={lang} schemes={schemes} />}

          {activeTab === 'market' && (
            <MarketPricesPage
              lang={lang}
              prices={prices}
              marketData={marketData}
              loading={marketLoading}
              isOnline={isOnline}
              onRefresh={() => fetchMarketPrices(true)}
            />
          )}

          {activeTab === 'voice' && (
            <VoiceAssistantPage
              lang={lang}
              user={user}
              weather={weather}
              calendars={calendars}
              prices={prices}
              schemes={schemes}
            />
          )}

          {(activeTab === 'location' || activeTab === 'profile' || activeTab === 'notifications') && (
            <ProfileLocationPage
              mode={activeTab}
              lang={lang}
              user={user}
              locations={locations}
              plots={plots}
              notifications={notifications}
              notes={notes}
              isOnline={isOnline}
              pendingCount={pendingCount}
              lastSyncedAt={lastSyncedAt}
              onSyncNow={handleSyncNow}
              onUserUpdate={async (u) => {
                setUser(u);
                await cacheSet('user_profile', u);
                await fetchFarmerDatasets(u);
              }}
              onRefreshAll={() => fetchFarmerDatasets(user)}
              onAddOfflineNote={handleAddOfflineNote}
            />
          )}

          {activeTab === 'admin' && user.role === 'admin' && (
            <AdminPage user={user} onDataMutated={() => fetchFarmerDatasets(user)} />
          )}
        </main>
      </div>

      {/* Mobile Fixed Thumb-Zone Bottom Tab Bar */}
      <nav
        aria-label={lang === 'kn' ? 'ಮೊಬೈಲ್ ನ್ಯಾವಿಗೇಷನ್' : 'Mobile Navigation'}
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 w-full max-w-[100vw] min-h-[60px] pb-[env(safe-area-inset-bottom)] bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-stretch px-0.5 box-border"
      >
        {[
          { id: 'dashboard' as NavTab, label: t.navShortDashboard, icon: <Home className="w-5 h-5 shrink-0" /> },
          { id: 'calendar' as NavTab, label: t.navShortCalendar, icon: <CalendarDays className="w-5 h-5 shrink-0" /> },
          { id: 'weather' as NavTab, label: t.navShortWeather, icon: <CloudRain className="w-5 h-5 shrink-0" /> },
          { id: 'voice' as NavTab, label: t.navShortVoice, icon: <Mic className="w-5 h-5 shrink-0" /> },
        ].map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative flex flex-col items-center justify-center w-full min-w-0 min-h-[56px] py-1.5 px-0.5 text-center transition-colors ${
                active ? 'text-[#155E34] font-semibold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {active && (
                <span aria-hidden="true" className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-0.5 rounded-full bg-[#155E34]" />
              )}
              {item.icon}
              <span className="block w-full truncate text-[10px] sm:text-[11px] leading-[1.2] mt-1 tracking-[-0.01em] px-0.5">
                {item.label}
              </span>
            </button>
          );
        })}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className={`relative flex flex-col items-center justify-center w-full min-w-0 min-h-[56px] py-1.5 px-0.5 text-center transition-colors ${
            !['dashboard', 'calendar', 'weather', 'voice'].includes(activeTab)
              ? 'text-[#155E34] font-semibold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {!['dashboard', 'calendar', 'weather', 'voice'].includes(activeTab) && (
            <span aria-hidden="true" className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-0.5 rounded-full bg-[#155E34]" />
          )}
          <span className="relative inline-flex">
            <Menu className="w-5 h-5 shrink-0" />
            {pendingCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white"
              />
            )}
          </span>
          <span className="block w-full truncate text-[10px] sm:text-[11px] leading-[1.2] mt-1 tracking-[-0.01em] px-0.5">
            {t.navShortMore}
          </span>
        </button>
      </nav>

      {/* Mobile Full Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50 flex">
          <div className="w-72 bg-white h-full p-5 flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <span className="text-lg font-bold text-[#155E34]">{t.brandName}</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 text-slate-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-4 space-y-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-left min-h-[44px] ${
                      activeTab === item.id ? 'bg-emerald-50 text-[#155E34] font-semibold' : 'text-slate-700'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-700"
            >
              <LogOut className="w-4 h-4" />
              <span>{t.logout}</span>
            </button>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}
    </div>
  );
}
