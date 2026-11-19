export type UserRole = 'farmer' | 'admin';
export type LangCode = 'kn' | 'en';

export type AuthProvider = 'password' | 'google' | 'password+google';
export type AccountVerificationStatus = 'unverified' | 'pending' | 'verified';

export interface UserRecord {
  id: number;
  name: string;
  identifier: string;
  email: string | null;
  phone: string | null;
  google_sub: string | null;
  auth_provider: AuthProvider;
  avatar_url: string;
  verification_status: AccountVerificationStatus;
  verified_at: string | null;
  password_hash: string;
  role: UserRole;
  preferred_lang: LangCode;
  district: string;
  taluk: string;
  hobli: string;
  village: string;
  farm_size_acres: number;
  soil_type: string;
  irrigation_type: string;
  crops_cultivated: string; // JSON string array
  latitude: number | null;
  longitude: number | null;
  onboarding_completed: number;
  is_demo: number;
  created_at: string;
  updated_at: string;
}

export interface SafeUser {
  id: number;
  name: string;
  identifier: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  preferred_lang: LangCode;
  auth_provider: AuthProvider;
  avatar_url: string;
  verification_status: AccountVerificationStatus;
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
  created_at: string;
  updated_at: string;
}

export interface LocationNode {
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

export interface CropStageTemplate {
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

export interface CropDefinition {
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
  stages: CropStageTemplate[];
}
