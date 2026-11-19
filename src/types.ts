import type { Lang } from './i18n/translations';

export type AuthProvider = 'password' | 'google' | 'password+google';
export type AccountVerificationStatus = 'unverified' | 'pending' | 'verified' | 'expired' | 'failed';

export interface UserProfile {
  id: number;
  name: string;
  identifier: string;
  email: string | null;
  phone: string | null;
  role: 'farmer' | 'admin';
  preferred_lang: Lang;
  auth_provider: AuthProvider;
  avatar_url: string;
  verification_status: 'unverified' | 'pending' | 'verified';
  verified_at: string | null;
  district: string;
  taluk: string;
  hobli: string;
  village: string;
  farm_size_acres: number;
  soil_type: string;
  irrigation_type: string;
  crops_cultivated: string[];
  latitude: number | null;
  longitude: number | null;
  onboarding_completed: boolean;
}

export interface AuthConfig {
  googleClientId: string | null;
  googleConfigured: boolean;
  verificationExpirySeconds: number;
}

export interface VerificationStatusSnapshot {
  identifier: string;
  channel: 'email' | 'phone' | 'google' | 'username';
  status: AccountVerificationStatus;
  expiresAt: string | null;
  verifiedAt: string | null;
  attempts: number;
  maxAttempts: number;
  attemptsRemaining: number;
  serverTime: string;
  userVerified: boolean;
}

export interface FarmPlot {
  id: number;
  user_id: number;
  name: string;
  district: string;
  taluk: string;
  hobli: string;
  village: string;
  area_acres: number;
  soil_type: string;
  irrigation_type: string;
  latitude: number | null;
  longitude: number | null;
}

export interface KarnatakaLocation {
  id: number;
  country: string;
  state: string;
  district: string;
  district_kn: string;
  taluk: string;
  taluk_kn: string;
  hobli: string;
  hobli_kn: string;
  village: string;
  village_kn: string;
  agro_zone: string;
  agro_zone_kn: string;
  latitude: number;
  longitude: number;
}

export interface CropStage {
  stage_number: number;
  stage_key: string;
  day_start: number;
  day_end: number;
  title_en: string;
  title_kn: string;
  instructions_en: string;
  instructions_kn: string;
  inputs_en: string;
  inputs_kn: string;
  weather_rule: string;
}

export interface CropInfo {
  code: string;
  name_en: string;
  name_kn: string;
  category: string;
  category_kn: string;
  varieties: string[];
  seasons: string[];
  soils: string[];
  duration_days: number;
  water_need: string;
  water_need_kn: string;
  applicable_zones: string[];
  source_institution: string;
  source_url: string;
  verified_date: string;
  notes_en: string;
  notes_kn: string;
  stages: CropStage[];
}

export interface CalendarTask {
  id: number;
  calendar_id: number;
  stage_number: number;
  stage_key: string;
  title_en: string;
  title_kn: string;
  description_en: string;
  description_kn: string;
  inputs_en: string;
  inputs_kn: string;
  due_date: string;
  end_date: string;
  status: 'pending' | 'completed' | 'missed';
  reminder_enabled: number;
  is_custom: number;
  notes: string;
  source_institution: string;
}

export interface CropCalendar {
  id: number;
  crop_code: string;
  crop_name_en: string;
  crop_name_kn: string;
  variety: string;
  season: string;
  soil_type: string;
  irrigation_type: string;
  sowing_date: string;
  district: string;
  taluk: string;
  hobli: string;
  village: string;
  agro_zone: string;
  duration_days: number;
  source_institution: string;
  source_url: string;
  verified_date: string;
  data_coverage: 'verified' | 'partial_adaptation';
  limitation_note_en: string;
  limitation_note_kn: string;
  tasks: CalendarTask[];
}

export interface WeatherData {
  latitude: number;
  longitude: number;
  location_label: string;
  provider: string;
  api_status: 'live' | 'cached' | 'unavailable';
  last_updated: string;
  error_message?: string;
  _fromOfflineCache?: boolean;
  _cachedAt?: string;
  current: {
    temperature_c: number;
    humidity_pct: number;
    rain_mm: number;
    wind_kmh: number;
    weather_code: number;
    condition_en: string;
    condition_kn: string;
  } | null;
  daily: Array<{
    date: string;
    temp_min_c: number;
    temp_max_c: number;
    rain_sum_mm: number;
    rain_prob_pct: number;
    wind_max_kmh: number;
    weather_code: number;
    condition_en: string;
    condition_kn: string;
  }>;
  alerts: Array<{
    id: string;
    severity: 'info' | 'warning' | 'critical';
    type: string;
    title_en: string;
    title_kn: string;
    message_en: string;
    message_kn: string;
  }>;
  spraying_suitable: boolean;
  spraying_reason_en: string;
  spraying_reason_kn: string;
}

export interface AgroShop {
  id: number;
  name: string;
  name_kn: string;
  category: string;
  address: string;
  district: string;
  taluk: string;
  phone: string;
  products: string;
  operating_hours: string;
  latitude: number;
  longitude: number;
  verification_status: 'verified' | 'pending' | 'rejected';
  source_label: string;
  distance_km?: number;
}

export interface EquipmentRental {
  id: number;
  equipment_name: string;
  equipment_name_kn: string;
  category: string;
  owner_name: string;
  district: string;
  taluk: string;
  village: string;
  rate_info: string;
  phone: string;
  availability_status: 'confirmed' | 'unconfirmed' | 'booked';
  verification_status: 'verified' | 'pending' | 'rejected';
  latitude: number;
  longitude: number;
  distance_km?: number;
}

export interface GovScheme {
  id: number;
  code: string;
  level: string;
  category: string;
  name_en: string;
  name_kn: string;
  description_en: string;
  description_kn: string;
  eligibility_en: string;
  eligibility_kn: string;
  benefits_en: string;
  benefits_kn: string;
  documents_en: string;
  documents_kn: string;
  application_process_en: string;
  application_process_kn: string;
  official_url: string;
  department: string;
  last_verified_date: string;
  status: string;
}

export interface MarketPrice {
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
  data_mode: 'live' | 'cached' | 'fallback' | 'admin_verified' | string;
}

export interface MarketPricesResponse {
  prices: MarketPrice[];
  feed_status: 'live' | 'cached' | 'fallback';
  provider: string;
  source_url: string;
  last_updated: string;
  live_count: number;
  cached_count: number;
  fallback_count: number;
  target_markets: string[];
  missing_live_targets: string[];
  api_configured?: boolean;
  error_message?: string;
  source_note_en: string;
  source_note_kn: string;
  _fromOfflineCache?: boolean;
  _cachedAt?: string;
}

export interface AppNotification {
  id: number;
  title_en: string;
  title_kn: string;
  body_en: string;
  body_kn: string;
  kind: string;
  is_read: number;
  created_at: string;
}

export interface FieldNote {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface LeafScan {
  id: number;
  user_id: number;
  crop_code: string;
  crop_name_en: string;
  crop_name_kn: string;
  field_notes: string;
  image_data_url: string;
  condition_name_en: string;
  condition_name_kn: string;
  category:
    | 'fungal'
    | 'bacterial'
    | 'viral'
    | 'pest'
    | 'nutrient_deficiency'
    | 'abiotic_stress'
    | 'healthy'
    | 'uncertain'
    | string;
  severity: 'low' | 'moderate' | 'high' | string;
  confidence_level: 'high' | 'medium' | 'low' | string;
  confidence_pct: number;
  confidence_notes_en: string;
  confidence_notes_kn: string;
  visible_symptoms_en: string;
  visible_symptoms_kn: string;
  fertilizer_guidance_en: string;
  fertilizer_guidance_kn: string;
  spray_care_guidance_en: string;
  spray_care_guidance_kn: string;
  rsk_confirmation_en: string;
  rsk_confirmation_kn: string;
  recommended_task_title_en: string;
  recommended_task_title_kn: string;
  recommended_task_description_en: string;
  recommended_task_description_kn: string;
  recommended_days_offset: number;
  added_calendar_id: number | null;
  added_task_id: number | null;
  model_used: string;
  created_at: string;
}

export interface LeafScansResponse {
  scans: LeafScan[];
  aiConfigured: boolean;
  fetched_at: string;
  _fromOfflineCache?: boolean;
  _cachedAt?: string;
}

export type NutrientStatus = 'low' | 'medium' | 'high' | 'unknown';

export interface SoilInputItem {
  name: string;
  category: 'seed' | 'fertilizer' | 'soil_amendment' | 'bio_input';
  qty_label: string;
  estimated_cost_inr: number;
}

export interface SoilPlan {
  id: number;
  user_id: number;
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
  total_estimated_cost_inr: number;
  notes: string;
  added_calendar_id: number | null;
  added_task_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface SoilPlansResponse {
  plans: SoilPlan[];
  fetched_at: string;
  _fromOfflineCache?: boolean;
  _cachedAt?: string;
}

