import { hashPassword } from './auth.ts';
import { db } from './db.ts';
import { KARNATAKA_CROPS } from './seedCrops.ts';

const KARNATAKA_LOCATIONS = [
  // Tumakuru -> Sira Pilot (5 Hoblis, multiple villages)
  { district: 'Tumakuru', district_kn: 'ತುಮಕೂರು', taluk: 'Sira', taluk_kn: 'ಸಿರಾ', hobli: 'Kasaba', hobli_kn: 'ಕಸಬಾ', village: 'Sira Rural', village_kn: 'ಸಿರಾ ಗ್ರಾಮಾಂತರ', agro_zone: 'Central Dry Zone', agro_zone_kn: 'ಮಧ್ಯ ಒಣ ವಲಯ', lat: 13.741, lng: 76.904 },
  { district: 'Tumakuru', district_kn: 'ತುಮಕೂರು', taluk: 'Sira', taluk_kn: 'ಸಿರಾ', hobli: 'Kasaba', hobli_kn: 'ಕಸಬಾ', village: 'Chikkahalli', village_kn: 'ಚಿಕ್ಕಹಳ್ಳಿ', agro_zone: 'Central Dry Zone', agro_zone_kn: 'ಮಧ್ಯ ಒಣ ವಲಯ', lat: 13.762, lng: 76.885 },
  { district: 'Tumakuru', district_kn: 'ತುಮಕೂರು', taluk: 'Sira', taluk_kn: 'ಸಿರಾ', hobli: 'Kallambella', hobli_kn: 'ಕಳ್ಳಂಬೆಳ್ಳ', village: 'Kallambella', village_kn: 'ಕಳ್ಳಂಬೆಳ್ಳ', agro_zone: 'Central Dry Zone', agro_zone_kn: 'ಮಧ್ಯ ಒಣ ವಲಯ', lat: 13.628, lng: 76.927 },
  { district: 'Tumakuru', district_kn: 'ತುಮಕೂರು', taluk: 'Sira', taluk_kn: 'ಸಿರಾ', hobli: 'Kallambella', hobli_kn: 'ಕಳ್ಳಂಬೆಳ್ಳ', village: 'Thimmalapura', village_kn: 'ತಿಮ್ಮಲಾಪುರ', agro_zone: 'Central Dry Zone', agro_zone_kn: 'ಮಧ್ಯ ಒಣ ವಲಯ', lat: 13.645, lng: 76.942 },
  { district: 'Tumakuru', district_kn: 'ತುಮಕೂರು', taluk: 'Sira', taluk_kn: 'ಸಿರಾ', hobli: 'Bukkapatna', hobli_kn: 'ಬುಕ್ಕಾಪಟ್ಟಣ', village: 'Bukkapatna', village_kn: 'ಬುಕ್ಕಾಪಟ್ಟಣ', agro_zone: 'Central Dry Zone', agro_zone_kn: 'ಮಧ್ಯ ಒಣ ವಲಯ', lat: 13.688, lng: 76.765 },
  { district: 'Tumakuru', district_kn: 'ತುಮಕೂರು', taluk: 'Sira', taluk_kn: 'ಸಿರಾ', hobli: 'Gowdagere', hobli_kn: 'ಗೌಡಗೆರೆ', village: 'Gowdagere', village_kn: 'ಗೌಡಗೆರೆ', agro_zone: 'Central Dry Zone', agro_zone_kn: 'ಮಧ್ಯ ಒಣ ವಲಯ', lat: 13.816, lng: 76.882 },
  { district: 'Tumakuru', district_kn: 'ತುಮಕೂರು', taluk: 'Sira', taluk_kn: 'ಸಿರಾ', hobli: 'Hulikunte', hobli_kn: 'ಹುಲಿಕುಂಟೆ', village: 'Hulikunte', village_kn: 'ಹುಲಿಕುಂಟೆ', agro_zone: 'Central Dry Zone', agro_zone_kn: 'ಮಧ್ಯ ಒಣ ವಲಯ', lat: 13.841, lng: 76.968 },
  // Tumakuru other taluks
  { district: 'Tumakuru', district_kn: 'ತುಮಕೂರು', taluk: 'Tumakuru', taluk_kn: 'ತುಮಕೂರು', hobli: 'Urdigere', hobli_kn: 'ಊರ್ಡಿಗೆರೆ', village: 'Hirehalli', village_kn: 'ಹಿರೇಹಳ್ಳಿ', agro_zone: 'Eastern Dry Zone', agro_zone_kn: 'ಪೂರ್ವ ಒಣ ವಲಯ', lat: 13.283, lng: 77.145 },
  { district: 'Tumakuru', district_kn: 'ತುಮಕೂರು', taluk: 'Tiptur', taluk_kn: 'ತಿಪಟೂರು', hobli: 'Kasaba', hobli_kn: 'ಕಸಬಾ', village: 'Nonavinakere', village_kn: 'ನೊಣವಿನಕೆರೆ', agro_zone: 'Central Dry Zone', agro_zone_kn: 'ಮಧ್ಯ ಒಣ ವಲಯ', lat: 13.258, lng: 76.478 },
  { district: 'Tumakuru', district_kn: 'ತುಮಕೂರು', taluk: 'Pavagada', taluk_kn: 'ಪಾವಗಡ', hobli: 'Kasaba', hobli_kn: 'ಕಸಬಾ', village: 'Pavagada Rural', village_kn: 'ಪಾವಗಡ ಗ್ರಾಮಾಂತರ', agro_zone: 'Central Dry Zone', agro_zone_kn: 'ಮಧ್ಯ ಒಣ ವಲಯ', lat: 14.102, lng: 77.281 },
  { district: 'Tumakuru', district_kn: 'ತುಮಕೂರು', taluk: 'Madhugiri', taluk_kn: 'ಮಧುಗಿರಿ', hobli: 'Kasaba', hobli_kn: 'ಕಸಬಾ', village: 'Madhugiri Rural', village_kn: 'ಮಧುಗಿರಿ ಗ್ರಾಮಾಂತರ', agro_zone: 'Central Dry Zone', agro_zone_kn: 'ಮಧ್ಯ ಒಣ ವಲಯ', lat: 13.661, lng: 77.211 },
  // Broader Karnataka Expansion
  { district: 'Chitradurga', district_kn: 'ಚಿತ್ರದುರ್ಗ', taluk: 'Hiriyur', taluk_kn: 'ಹಿರಿಯೂರು', hobli: 'Kasaba', hobli_kn: 'ಕಸಬಾ', village: 'Babbur Farm', village_kn: 'ಬಬ್ಬೂರು ಫಾರ್ಮ್', agro_zone: 'Central Dry Zone', agro_zone_kn: 'ಮಧ್ಯ ಒಣ ವಲಯ', lat: 13.944, lng: 76.617 },
  { district: 'Mandya', district_kn: 'ಮಂಡ್ಯ', taluk: 'Maddur', taluk_kn: 'ಮದ್ದೂರು', hobli: 'Kasaba', hobli_kn: 'ಕಸಬಾ', village: 'VC Farm Mandya', village_kn: 'ವಿಸಿ ಫಾರ್ಮ್ ಮಂಡ್ಯ', agro_zone: 'Southern Dry Zone', agro_zone_kn: 'ದಕ್ಷಿಣ ಒಣ ವಲಯ', lat: 12.567, lng: 76.824 },
  { district: 'Bengaluru Rural', district_kn: 'ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ', taluk: 'Doddaballapura', taluk_kn: 'ದೊಡ್ಡಬಳ್ಳಾಪುರ', hobli: 'Sasalu', hobli_kn: 'ಸಾಸಲು', village: 'Hesaraghatta', village_kn: 'ಹೆಸರಘಟ್ಟ', agro_zone: 'Eastern Dry Zone', agro_zone_kn: 'ಪೂರ್ವ ಒಣ ವಲಯ', lat: 13.144, lng: 77.493 },
  { district: 'Davanagere', district_kn: 'ದಾವಣಗೆರೆ', taluk: 'Harihara', taluk_kn: 'ಹರಿಹರ', hobli: 'Kasaba', hobli_kn: 'ಕಸಬಾ', village: 'Malebennur', village_kn: 'ಮಲೇಬೆನ್ನೂರು', agro_zone: 'Central Dry Zone', agro_zone_kn: 'ಮಧ್ಯ ಒಣ ವಲಯ', lat: 14.355, lng: 75.744 },
  { district: 'Hassan', district_kn: 'ಹಾಸನ', taluk: 'Arsikere', taluk_kn: 'ಅರಸೀಕೆರೆ', hobli: 'Kasaba', hobli_kn: 'ಕಸಬಾ', village: 'Arsikere Rural', village_kn: 'ಅರಸೀಕೆರೆ ಗ್ರಾಮಾಂತರ', agro_zone: 'Southern Dry Zone', agro_zone_kn: 'ದಕ್ಷಿಣ ಒಣ ವಲಯ', lat: 13.314, lng: 76.257 },
  { district: 'Mysuru', district_kn: 'ಮೈಸೂರು', taluk: 'Nanjangud', taluk_kn: 'ನಂಜನಗೂಡು', hobli: 'Kasaba', hobli_kn: 'ಕಸಬಾ', village: 'Suttur', village_kn: 'ಸುತ್ತೂರು', agro_zone: 'Southern Dry Zone', agro_zone_kn: 'ದಕ್ಷಿಣ ಒಣ ವಲಯ', lat: 12.172, lng: 76.784 },
  { district: 'Dharwad', district_kn: 'ಧಾರವಾಡ', taluk: 'Dharwad', taluk_kn: 'ಧಾರವಾಡ', hobli: 'Garag', hobli_kn: 'ಗರಗ', village: 'Yettingudda', village_kn: 'ಎತ್ತಿನಗುಡ್ಡ', agro_zone: 'Northern Transition Zone', agro_zone_kn: 'ಉತ್ತರ ಪರಿವರ್ತನಾ ವಲಯ', lat: 15.489, lng: 74.985 },
  { district: 'Belagavi', district_kn: 'ಬೆಳಗಾವಿ', taluk: 'Gokak', taluk_kn: 'ಗೋಕಾಕ್', hobli: 'Kasaba', hobli_kn: 'ಕಸಬಾ', village: 'Arabavi', village_kn: 'ಅರಭಾವಿ', agro_zone: 'Northern Dry Zone', agro_zone_kn: 'ಉತ್ತರ ಒಣ ವಲಯ', lat: 16.215, lng: 74.828 },
  { district: 'Kolar', district_kn: 'ಕೋಲಾರ', taluk: 'Malur', taluk_kn: 'ಮಾಲೂರು', hobli: 'Kasaba', hobli_kn: 'ಕಸಬಾ', village: 'Tamaka', village_kn: 'ಟಮಕ', agro_zone: 'Eastern Dry Zone', agro_zone_kn: 'ಪೂರ್ವ ಒಣ ವಲಯ', lat: 13.133, lng: 78.129 },
  { district: 'Shivamogga', district_kn: 'ಶಿವಮೊಗ್ಗ', taluk: 'Sagara', taluk_kn: 'ಸಾಗರ', hobli: 'Kasaba', hobli_kn: 'ಕಸಬಾ', village: 'Anandapura', village_kn: 'ಆನಂದಪುರ', agro_zone: 'Hilly Zone', agro_zone_kn: 'ಮಲೆನಾಡು ವಲಯ', lat: 14.075, lng: 75.204 },
];

const SCHEMES = [
  {
    code: 'pm_kisan',
    level: 'Central',
    category: 'Income Support',
    name_en: 'PM-KISAN Samman Nidhi',
    name_kn: 'ಪಿಎಂ-ಕಿಸಾನ್ ಸಮ್ಮಾನ್ ನಿಧಿ',
    description_en: 'Direct income support of ₹6,000 per year in three equal four-monthly installments of ₹2,000 directly into eligible landholding farmer bank accounts.',
    description_kn: 'ಅರ್ಹ ಭೂಮಾಲೀಕ ರೈತರ ಬ್ಯಾಂಕ್ ಖಾತೆಗಳಿಗೆ ನೇರವಾಗಿ ವರ್ಷಕ್ಕೆ ₹6,000 (ಪ್ರತಿ 4 ತಿಂಗಳಿಗೊಮ್ಮೆ ₹2,000 ರಂತೆ 3 ಕಂತುಗಳಲ್ಲಿ) ಆರ್ಥಿಕ ನೆರವು.',
    eligibility_en: 'Cultivable landholding farmer families in Karnataka with verified e-KYC and Aadhaar-seeded bank account.',
    eligibility_kn: 'ಕರ್ನಾಟಕದಲ್ಲಿ ಕೃಷಿ ಭೂಮಿ ಹೊಂದಿರುವ, e-KYC ಮತ್ತು ಆಧಾರ್ ಜೋಡಣೆಯಾದ ಬ್ಯಾಂಕ್ ಖಾತೆ ಹೊಂದಿರುವ ರೈತ ಕುಟುಂಬಗಳು.',
    benefits_en: '₹6,000 per annum via Direct Benefit Transfer (DBT).',
    benefits_kn: 'ವಾರ್ಷಿಕ ₹6,000 ನೇರ ನಗದು ವರ್ಗಾವಣೆ (DBT).',
    documents_en: 'Aadhaar Card, RTC / Pahani (Land Record), Bank Passbook with DBT seeding, Mobile Number.',
    documents_kn: 'ಆಧಾರ್ ಕಾರ್ಡ್, ಪಹಣಿ (RTC), ಆಧಾರ್ ಜೋಡಿತ ಬ್ಯಾಂಕ್ ಪಾಸ್‌ಬುಕ್, ಮೊಬೈಲ್ ಸಂಖ್ಯೆ.',
    application_process_en: 'Register or check status at pmkisan.gov.in or via nearest Raitha Samparka Kendra (RSK) / Grama One.',
    application_process_kn: 'pmkisan.gov.in ಪೋರ್ಟಲ್ ಅಥವಾ ಹತ್ತಿರದ ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರ (RSK) / ಗ್ರಾಮ ಒನ್ ಕೇಂದ್ರದಲ್ಲಿ ಅರ್ಜಿ/ಸ್ಥಿತಿ ಪರಿಶೀಲಿಸಿ.',
    official_url: 'https://pmkisan.gov.in/',
    department: 'Ministry of Agriculture & Farmers Welfare / Dept. of Agriculture, Karnataka',
    last_verified_date: '2026-06-15',
    status: 'active',
  },
  {
    code: 'krishi_bhagya',
    level: 'Karnataka State',
    category: 'Irrigation & Water Conservation',
    name_en: 'Krishi Bhagya Scheme (Karnataka)',
    name_kn: 'ಕೃಷಿ ಭಾಗ್ಯ ಯೋಜನೆ (ಕರ್ನಾಟಕ)',
    description_en: 'Supports dryland farmers in constructing farm ponds (Krishi Honda), polythene lining, diesel/solar pump sets, and micro-irrigation units.',
    description_kn: 'ಮಳೆಯಾಶ್ರಿತ ರೈತರಿಗೆ ಕೃಷಿ ಹೊಂಡ ನಿರ್ಮಾಣ, ಪಾಲಿಥೀನ್ ಹೊದಿಕೆ, ಡೀಸೆಲ್/ಸೋಲಾರ್ ಪಂಪ್‌ಸೆಟ್ ಮತ್ತು ಸೂಕ್ಷ್ಮ ನೀರಾವರಿ ಘಟಕಗಳಿಗೆ ಸಹಾಯಧನ.',
    eligibility_en: 'Dryland farmers in Karnataka dry zones (including Tumakuru/Sira) who have not availed Krishi Honda subsidy previously.',
    eligibility_kn: 'ತುಮಕೂರು/ಸಿರಾ ಸೇರಿದಂತೆ ಒಣ ವಲಯದ ಮಳೆಯಾಶ್ರಿತ ರೈತರು (ಹಿಂದೆ ಕೃಷಿ ಹೊಂಡ ಸಹಾಯಧನ ಪಡೆಯದವರು).',
    benefits_en: 'Subsidized Krishi Honda construction, lining, and protective irrigation equipment as per current Dept. norms.',
    benefits_kn: 'ಕೃಷಿ ಇಲಾಖೆ ನಿಯಮಾವಳಿ ಪ್ರಕಾರ ಕೃಷಿ ಹೊಂಡ, ಪಾಲಿಥೀನ್ ಶೀಟ್ ಮತ್ತು ನೀರಾವರಿ ಸಲಕರಣೆಗೆ ಸಹಾಯಧನ.',
    documents_en: 'RTC / Pahani, Aadhaar, FRUITS ID (FID), Bank Passbook, Passport Photo.',
    documents_kn: 'ಪಹಣಿ (RTC), ಆಧಾರ್, FRUITS ID (FID), ಬ್ಯಾಂಕ್ ಪಾಸ್‌ಬುಕ್, ಭಾವಚಿತ್ರ.',
    application_process_en: 'Apply via Karnataka FRUITS / K-Kisan portal or visit your Hobli Raitha Samparka Kendra (RSK).',
    application_process_kn: 'FRUITS / K-Kisan ಪೋರ್ಟಲ್ ಅಥವಾ ಹೋಬಳಿ ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರದಲ್ಲಿ (RSK) ಅರ್ಜಿ ಸಲ್ಲಿಸಿ.',
    official_url: 'https://raitamitra.karnataka.gov.in/',
    department: 'Department of Agriculture, Government of Karnataka',
    last_verified_date: '2026-06-12',
    status: 'active',
  },
  {
    code: 'pmfby_karnataka',
    level: 'Central + Karnataka State',
    category: 'Crop Insurance',
    name_en: 'Karnataka Raitha Suraksha — PMFBY Crop Insurance',
    name_kn: 'ಕರ್ನಾಟಕ ರೈತ ಸುರಕ್ಷಾ ಪ್ರಧಾನ ಮಂತ್ರಿ ಫಸಲ್ ಬಿಮಾ ಯೋಜನೆ',
    description_en: 'Comprehensive crop insurance against natural calamities, drought, flood, and post-harvest losses for notified crops in Karnataka taluks.',
    description_kn: 'ಪ್ರಕೃತಿ ವಿಕೋಪ, ಬರ, ಅತಿವೃಷ್ಟಿ ಮತ್ತು ಕೊಯ್ಲು ನಂತರದ ನಷ್ಟದಿಂದ ಅಧಿಸೂಚಿತ ಬೆಳೆಗಳಿಗೆ ಬೆಳೆ ವಿಮೆ ರಕ್ಷಣೆ.',
    eligibility_en: 'Loanee and non-loanee farmers cultivating notified crops in notified taluks/hoblis before seasonal cut-off dates.',
    eligibility_kn: 'ಅಧಿಸೂಚಿತ ತಾಲ್ಲೂಕು/ಹೋಬಳಿಗಳಲ್ಲಿ ನಿಗದಿತ ದಿನಾಂಕದೊಳಗೆ ಬೆಳೆ ಬೆಳೆಯುವ ಸಾಲ ಪಡೆದ ಮತ್ತು ಸಾಲ ರಹಿತ ರೈತರು.',
    benefits_en: 'Farmer premium is subsidized (typically 2% Kharif, 1.5% Rabi, 5% commercial/horticultural; verify seasonal notification).',
    benefits_kn: 'ರೈತರ ವಿಮಾ ಕಂತಿಗೆ ಸಹಾಯಧನ (ಸಾಮಾನ್ಯವಾಗಿ ಮುಂಗಾರು 2%, ಹಿಂಗಾರು 1.5%, ವಾಣಿಜ್ಯ ಬೆಳೆ 5%; ಪ್ರಸಕ್ತ ಅಧಿಸೂಚನೆ ಪರಿಶೀಲಿಸಿ).',
    documents_en: 'FRUITS ID, RTC, Sowing Declaration / Crop Survey (Bele Samikshe), Aadhaar, Bank Account.',
    documents_kn: 'FRUITS ID, ಪಹಣಿ, ಬಿತ್ತನೆ ದೃಢೀಕರಣ/ಬೆಳೆ ಸಮೀಕ್ಷೆ, ಆಧಾರ್, ಬ್ಯಾಂಕ್ ಖಾತೆ.',
    application_process_en: 'Enroll through Samrakshane portal (samrakshane.karnataka.gov.in), CSC, or cooperative/commercial bank before season deadline.',
    application_process_kn: 'ಸಂರಕ್ಷಣೆ ಪೋರ್ಟಲ್ (samrakshane.karnataka.gov.in), CSC ಅಥವಾ ಬ್ಯಾಂಕ್ ಮೂಲಕ ಗಡುವಿನೊಳಗೆ ನೋಂದಾಯಿಸಿ.',
    official_url: 'https://samrakshane.karnataka.gov.in/',
    department: 'Department of Agriculture, Government of Karnataka',
    last_verified_date: '2026-06-14',
    status: 'active',
  },
  {
    code: 'raitha_siri',
    level: 'Karnataka State',
    category: 'Millet Promotion',
    name_en: 'Raitha Siri Millet Incentive Scheme',
    name_kn: 'ರೈತ ಸಿರಿ ಸಿರಿಧಾನ್ಯ ಪ್ರೋತ್ಸಾಹ ಧನ ಯೋಜನೆ',
    description_en: 'Encourages cultivation of minor millets (Navane, Saame, Korale, Haraka, Baragu, Oodalu) in dryland districts like Tumakuru.',
    description_kn: 'ತುಮಕೂರು ಸೇರಿದಂತೆ ಒಣಭೂಮಿ ಜಿಲ್ಲೆಗಳಲ್ಲಿ ನವಣೆ, ಸಾಮೆ, ಕೊರಲೆ, ಹಾರಕ, ಬರಗು ಮತ್ತು ಊದಲು ಸಿರಿಧಾನ್ಯ ಬೆಳೆಯುವ ರೈತರಿಗೆ ಪ್ರೋತ್ಸಾಹ ಧನ.',
    eligibility_en: 'Karnataka farmers cultivating notified minor millets verified through Crop Survey (Bele Samikshe) and FRUITS ID.',
    eligibility_kn: 'FRUITS ID ಹೊಂದಿದ್ದು ಬೆಳೆ ಸಮೀಕ್ಷೆಯಲ್ಲಿ ಸಿರಿಧಾನ್ಯ ಬೆಳೆ ದೃಢಪಟ್ಟ ಕರ್ನಾಟಕದ ರೈತರು.',
    benefits_en: 'Direct financial incentive per hectare as notified in seasonal Karnataka state budget/circulars.',
    benefits_kn: 'ರಾಜ್ಯ ಸರ್ಕಾರದ ಚಾಲ್ತಿ ಆದೇಶದಂತೆ ಪ್ರತಿ ಹೆಕ್ಟೇರ್‌ಗೆ ನೇರ ಪ್ರೋತ್ಸಾಹ ಧನ.',
    documents_en: 'FRUITS ID, RTC, Aadhaar-linked Bank Account, Bele Samikshe confirmation.',
    documents_kn: 'FRUITS ID, ಪಹಣಿ, ಆಧಾರ್ ಜೋಡಿತ ಬ್ಯಾಂಕ್ ಖಾತೆ, ಬೆಳೆ ಸಮೀಕ್ಷೆ.',
    application_process_en: 'Ensure crop is recorded in Karnataka Bele Samikshe app and confirm with local RSK.',
    application_process_kn: 'ಬೆಳೆ ಸಮೀಕ್ಷೆ ಆ್ಯಪ್‌ನಲ್ಲಿ ಬೆಳೆ ದಾಖಲಿಸಿ ಸ್ಥಳೀಯ ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರದಲ್ಲಿ ದೃಢೀಕರಿಸಿ.',
    official_url: 'https://raitamitra.karnataka.gov.in/',
    department: 'Department of Agriculture, Government of Karnataka',
    last_verified_date: '2026-06-10',
    status: 'verify_portal',
  },
  {
    code: 'pmksy_micro_irrigation',
    level: 'Central + Karnataka State',
    category: 'Irrigation Equipment',
    name_en: 'PMKSY Micro Irrigation (Drip & Sprinkler Subsidy)',
    name_kn: 'ಪ್ರಧಾನ ಮಂತ್ರಿ ಕೃಷಿ ಸಿಂಚಾಯಿ ಯೋಜನೆ (ಹನಿ ಮತ್ತು ತುಂತುರು ನೀರಾವರಿ)',
    description_en: 'Subsidy assistance for installing drip and sprinkler irrigation systems for agricultural and horticultural crops.',
    description_kn: 'ಕೃಷಿ ಮತ್ತು ತೋಟಗಾರಿಕೆ ಬೆಳೆಗಳಿಗೆ ಹನಿ ನೀರಾವರಿ ಹಾಗೂ ತುಂತುರು ನೀರಾವರಿ ಘಟಕ ಅಳವಡಿಸಲು ಸಹಾಯಧನ.',
    eligibility_en: 'Farmers with valid land records (RTC), water source, and FRUITS ID.',
    eligibility_kn: 'ಮಾನ್ಯ ಪಹಣಿ, ನೀರಿನ ಮೂಲ ಮತ್ತು FRUITS ID ಹೊಂದಿರುವ ರೈತರು.',
    benefits_en: 'High subsidy support (higher percentage for SC/ST and small/marginal farmers; check current K-Kisan slab).',
    benefits_kn: 'ಸಣ್ಣ/ಅತಿ ಸಣ್ಣ ಮತ್ತು SC/ST ರೈತರಿಗೆ ಹೆಚ್ಚಿನ ಪ್ರಮಾಣದ ಸಹಾಯಧನ (K-Kisan ದರ ಪಟ್ಟಿ ಪರಿಶೀಲಿಸಿ).',
    documents_en: 'FRUITS ID, RTC, Caste Certificate (if applicable), Water source proof, Vendor quotation.',
    documents_kn: 'FRUITS ID, ಪಹಣಿ, ಜಾತಿ ಪ್ರಮಾಣಪತ್ರ (ಅನ್ವಯಿಸಿದರೆ), ನೀರಿನ ಮೂಲ ದಾಖಲೆ.',
    application_process_en: 'Apply online via K-Kisan (kkisan.karnataka.gov.in) or through Hobli RSK / Horticulture office.',
    application_process_kn: 'K-Kisan (kkisan.karnataka.gov.in) ಅಥವಾ ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರ / ತೋಟಗಾರಿಕೆ ಕಚೇರಿ ಮೂಲಕ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ.',
    official_url: 'https://kkisan.karnataka.gov.in/',
    department: 'Dept. of Agriculture & Dept. of Horticulture, Karnataka',
    last_verified_date: '2026-06-14',
    status: 'active',
  },
  {
    code: 'soil_health_card',
    level: 'Central + Karnataka State',
    category: 'Soil Testing & Inputs',
    name_en: 'Soil Health Card & Micronutrient Support',
    name_kn: 'ಮಣ್ಣು ಆರೋಗ್ಯ ಕಾರ್ಡ್ ಮತ್ತು ಲಘು ಪೋಷಕಾಂಶ ನೆರವು',
    description_en: 'Free or subsidized soil sample testing for NPK, pH, EC, and micronutrients with crop-wise fertilizer recommendations.',
    description_kn: 'ಮಣ್ಣಿನ NPK, pH ಮತ್ತು ಲಘು ಪೋಷಕಾಂಶಗಳ ಪರೀಕ್ಷೆ ಹಾಗೂ ಬೆಳೆವಾರು ರಸಗೊಬ್ಬರ ಶಿಫಾರಸು.',
    eligibility_en: 'All farmers in Karnataka via local Raitha Samparka Kendra / Soil Testing Labs.',
    eligibility_kn: 'ಕರ್ನಾಟಕದ ಎಲ್ಲಾ ರೈತರು ಸ್ಥಳೀಯ ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರದ ಮೂಲಕ ಪಡೆಯಬಹುದು.',
    benefits_en: 'Soil Health Card report + subsidized Gypsum, Zinc Sulphate, Boron via RSK when available.',
    benefits_kn: 'ಮಣ್ಣು ಆರೋಗ್ಯ ಕಾರ್ಡ್ ಮತ್ತು RSK ಮೂಲಕ ರಿಯಾಯಿತಿ ದರದಲ್ಲಿ ಜಿಪ್ಸಂ, ಜಿಂಕ್, ಬೋರಾನ್.',
    documents_en: 'FRUITS ID / Aadhaar and soil sample collected as per RSK instructions.',
    documents_kn: 'FRUITS ID / ಆಧಾರ್ ಮತ್ತು RSK ಮಾರ್ಗದರ್ಶನದಂತೆ ಸಂಗ್ರಹಿಸಿದ ಮಣ್ಣಿನ ಮಾದರಿ.',
    application_process_en: 'Submit soil sample at your nearest RSK or Taluk Soil Testing Laboratory.',
    application_process_kn: 'ನಿಮ್ಮ ಹತ್ತಿರದ ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರ ಅಥವಾ ತಾಲ್ಲೂಕು ಮಣ್ಣು ಪರೀಕ್ಷಾ ಕೇಂದ್ರಕ್ಕೆ ಮಣ್ಣಿನ ಮಾದರಿ ನೀಡಿ.',
    official_url: 'https://soilhealth.dac.gov.in/',
    department: 'Department of Agriculture, Government of Karnataka',
    last_verified_date: '2026-06-15',
    status: 'active',
  },
];

const SHOPS = [
  {
    name: 'Raitha Samparka Kendra (RSK) — Sira Kasaba',
    name_kn: 'ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರ (RSK) — ಸಿರಾ ಕಸಬಾ',
    category: 'Government Seed & Input Center',
    address: 'Taluk Agriculture Office Premises, Sira, Tumakuru 572137',
    district: 'Tumakuru',
    taluk: 'Sira',
    phone: '08135-275120',
    products: 'Subsidized Seeds (Ragi, Groundnut, Red Gram), Gypsum, Biofertilizers, Soil Testing',
    operating_hours: 'Mon–Sat 10:00 AM – 5:30 PM',
    latitude: 13.7425,
    longitude: 76.9068,
    verification_status: 'verified',
    source_label: 'Karnataka Dept. of Agriculture Directory (Verify stock at RSK)',
  },
  {
    name: 'Kallambella Raitha Samparka Kendra',
    name_kn: 'ಕಳ್ಳಂಬೆಳ್ಳ ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರ',
    category: 'Government Seed & Input Center',
    address: 'Kallambella Hobli Center, NH-48 Road, Sira Taluk, Tumakuru',
    district: 'Tumakuru',
    taluk: 'Sira',
    phone: '',
    products: 'Certified Kharif Seeds, Micronutrients, Agricultural Advisory',
    operating_hours: 'Mon–Sat 10:00 AM – 5:30 PM',
    latitude: 13.6295,
    longitude: 76.9281,
    verification_status: 'verified',
    source_label: 'Karnataka Dept. of Agriculture Directory',
  },
  {
    name: 'TAPCMS Sira Agricultural Input Depot',
    name_kn: 'TAPCMS ಸಿರಾ ಕೃಷಿ ಪರಿಕರ ಮಳಿಗೆ',
    category: 'Fertilizer & Seed Cooperative',
    address: 'APMC Yard Road, Sira, Tumakuru 572137',
    district: 'Tumakuru',
    taluk: 'Sira',
    phone: '',
    products: 'Urea, DAP, Complex Fertilizers, Certified Seeds, Sprayers',
    operating_hours: 'Mon–Sat 9:00 AM – 6:30 PM',
    latitude: 13.7488,
    longitude: 76.9122,
    verification_status: 'verified',
    source_label: 'Taluk Agricultural Cooperative Marketing Society (TAPCMS)',
  },
  {
    name: 'KVK Hirehalli Seed & Nursery Unit',
    name_kn: 'ಕೃಷಿ ವಿಜ್ಞಾನ ಕೇಂದ್ರ (KVK) ಹಿರೇಹಳ್ಳಿ ಬೀಜ ಘಟಕ',
    category: 'Research & Nursery Center',
    address: 'Hirehalli Industrial Area, Tumakuru 572168',
    district: 'Tumakuru',
    taluk: 'Tumakuru',
    phone: '0816-2243177',
    products: 'Foundation Seeds, Arka Vegetable Seedlings, Bio-agents, Training',
    operating_hours: 'Mon–Sat 9:30 AM – 5:00 PM',
    latitude: 13.2842,
    longitude: 77.1455,
    verification_status: 'verified',
    source_label: 'ICAR-IIHR KVK Hirehalli Official Center',
  },
];

const RENTALS = [
  {
    equipment_name: '45 HP Tractor + Rotavator & Seed Drill',
    equipment_name_kn: '45 HP ಟ್ರ್ಯಾಕ್ಟರ್ + ರೋಟಾವೇಟರ್ ಮತ್ತು ಸೀಡ್ ಡ್ರಿಲ್',
    category: 'Tractor & Tillage',
    owner_name: 'Sira Custom Hiring Center (CHSC)',
    district: 'Tumakuru',
    taluk: 'Sira',
    village: 'Sira Rural',
    rate_info: 'Confirm hourly/acreage rate directly with provider',
    phone: '',
    availability_status: 'confirmed',
    verification_status: 'verified',
    latitude: 13.744,
    longitude: 76.901,
  },
  {
    equipment_name: 'Battery Knapsack Power Sprayer (16L)',
    equipment_name_kn: 'ಬ್ಯಾಟರಿ ಚಾಲಿತ ಪವರ್ ಸ್ಪ್ರೇಯರ್ (16 ಲೀ)',
    category: 'Sprayer',
    owner_name: 'Kallambella Farmer Cooperative',
    district: 'Tumakuru',
    taluk: 'Sira',
    village: 'Kallambella',
    rate_info: 'Daily rental — confirm directly with provider',
    phone: '',
    availability_status: 'confirmed',
    verification_status: 'verified',
    latitude: 13.631,
    longitude: 76.925,
  },
  {
    equipment_name: 'Groundnut Thresher & Multi-Crop Harvester',
    equipment_name_kn: 'ಶೇಂಗಾ ಒಕ್ಕಣೆ ಯಂತ್ರ ಮತ್ತು ಮಲ್ಟಿ-ಕ್ರಾಪ್ ಹಾರ್ವೆಸ್ಟರ್',
    category: 'Harvester & Thresher',
    owner_name: 'Bukkapatna Agro Services',
    district: 'Tumakuru',
    taluk: 'Sira',
    village: 'Bukkapatna',
    rate_info: 'Seasonal booking — enquire for availability',
    phone: '',
    availability_status: 'confirmed',
    verification_status: 'verified',
    latitude: 13.689,
    longitude: 76.768,
  },
];

const MARKET_PRICES = [
  { apmc_name: 'Sira APMC', apmc_name_kn: 'ಸಿರಾ ಎಪಿಎಂಸಿ', district: 'Tumakuru', crop_code: 'groundnut', crop_name_en: 'Groundnut (Pods)', crop_name_kn: 'ಶೇಂಗಾ (ಕಾಯಿ)', variety: 'TMV-2 / Gejje', min_price: 5650, max_price: 6820, modal_price: 6350, reported_date: '2026-11-16', trend: 'up', source_name: 'Agmarknet / Karnataka State Agrl. Marketing Board (Reference Snapshot)' },
  { apmc_name: 'Sira APMC', apmc_name_kn: 'ಸಿರಾ ಎಪಿಎಂಸಿ', district: 'Tumakuru', crop_code: 'ragi', crop_name_en: 'Ragi (Finger Millet)', crop_name_kn: 'ರಾಗಿ', variety: 'Local / GPU-28', min_price: 3350, max_price: 3920, modal_price: 3740, reported_date: '2026-11-16', trend: 'stable', source_name: 'Agmarknet / Karnataka State Agrl. Marketing Board (Reference Snapshot)' },
  { apmc_name: 'Tumakuru APMC', apmc_name_kn: 'ತುಮಕೂರು ಎಪಿಎಂಸಿ', district: 'Tumakuru', crop_code: 'red_gram', crop_name_en: 'Red Gram (Tur)', crop_name_kn: 'ತೊಗರಿ', variety: 'Red Bold', min_price: 8200, max_price: 9450, modal_price: 8950, reported_date: '2026-11-16', trend: 'up', source_name: 'Agmarknet / Karnataka State Agrl. Marketing Board (Reference Snapshot)' },
  { apmc_name: 'Tiptur APMC', apmc_name_kn: 'ತಿಪಟೂರು ಎಪಿಎಂಸಿ', district: 'Tumakuru', crop_code: 'coconut', crop_name_en: 'Copra (Ball Copra)', crop_name_kn: 'ಕೊಬ್ಬರಿ (ಉಂಡೆ)', variety: 'Tiptur Ball', min_price: 11800, max_price: 13400, modal_price: 12750, reported_date: '2026-11-15', trend: 'up', source_name: 'Agmarknet / Tiptur APMC Bulletin (Reference Snapshot)' },
  { apmc_name: 'Tumakuru APMC', apmc_name_kn: 'ತುಮಕೂರು ಎಪಿಎಂಸಿ', district: 'Tumakuru', crop_code: 'maize', crop_name_en: 'Maize', crop_name_kn: 'ಮೆಕ್ಕೆಜೋಳ', variety: 'Yellow Hybrid', min_price: 2050, max_price: 2340, modal_price: 2210, reported_date: '2026-11-16', trend: 'stable', source_name: 'Agmarknet / Karnataka State Agrl. Marketing Board (Reference Snapshot)' },
  { apmc_name: 'Yeshwanthpur APMC', apmc_name_kn: 'ಯಶವಂತಪುರ ಎಪಿಎಂಸಿ', district: 'Bengaluru', crop_code: 'onion', crop_name_en: 'Onion', crop_name_kn: 'ಈರುಳ್ಳಿ', variety: 'Puna / Bellary Red', min_price: 1900, max_price: 3400, modal_price: 2750, reported_date: '2026-11-16', trend: 'down', source_name: 'Agmarknet / eNAM Reference Snapshot' },
  { apmc_name: 'Kolar APMC', apmc_name_kn: 'ಕೋಲಾರ ಎಪಿಎಂಸಿ', district: 'Kolar', crop_code: 'tomato', crop_name_en: 'Tomato', crop_name_kn: 'ಟೊಮೆಟೊ', variety: 'Hybrid (Nati/Rakshak)', min_price: 1200, max_price: 2450, modal_price: 1850, reported_date: '2026-11-16', trend: 'up', source_name: 'Agmarknet / Kolar APMC Reference Snapshot' },
  { apmc_name: 'Mandya APMC', apmc_name_kn: 'ಮಂಡ್ಯ ಎಪಿಎಂಸಿ', district: 'Mandya', crop_code: 'paddy', crop_name_en: 'Paddy (Common)', crop_name_kn: 'ಭತ್ತ', variety: 'Sona Masuri / Jaya', min_price: 2300, max_price: 2880, modal_price: 2620, reported_date: '2026-11-15', trend: 'stable', source_name: 'Agmarknet / Mandya APMC Reference Snapshot' },
];

export function seedDatabase() {
  const locCount = db.prepare('SELECT COUNT(*) as c FROM locations').get() as { c: number };
  if (locCount.c === 0) {
    const insLoc = db.prepare(
      `INSERT INTO locations (district, district_kn, taluk, taluk_kn, hobli, hobli_kn, village, village_kn, agro_zone, agro_zone_kn, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const l of KARNATAKA_LOCATIONS) {
      insLoc.run(l.district, l.district_kn, l.taluk, l.taluk_kn, l.hobli, l.hobli_kn, l.village, l.village_kn, l.agro_zone, l.agro_zone_kn, l.lat, l.lng);
    }
  }

  const cropCount = db.prepare('SELECT COUNT(*) as c FROM crops').get() as { c: number };
  if (cropCount.c === 0) {
    const insCrop = db.prepare(
      `INSERT INTO crops (code, name_en, name_kn, category, category_kn, varieties, seasons, soils, duration_days, water_need, water_need_kn, applicable_zones, source_institution, source_url, verified_date, notes_en, notes_kn, stages)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const c of KARNATAKA_CROPS) {
      insCrop.run(
        c.code,
        c.name_en,
        c.name_kn,
        c.category,
        c.category_kn,
        JSON.stringify(c.varieties),
        JSON.stringify(c.seasons),
        JSON.stringify(c.soils),
        c.duration_days,
        c.water_need,
        c.water_need_kn,
        JSON.stringify(c.applicable_zones),
        c.source_institution,
        c.source_url,
        c.verified_date,
        c.notes_en,
        c.notes_kn,
        JSON.stringify(c.stages)
      );
    }
  }

  const schemeCount = db.prepare('SELECT COUNT(*) as c FROM schemes').get() as { c: number };
  if (schemeCount.c === 0) {
    const insScheme = db.prepare(
      `INSERT INTO schemes (code, level, category, name_en, name_kn, description_en, description_kn, eligibility_en, eligibility_kn, benefits_en, benefits_kn, documents_en, documents_kn, application_process_en, application_process_kn, official_url, department, last_verified_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const s of SCHEMES) {
      insScheme.run(s.code, s.level, s.category, s.name_en, s.name_kn, s.description_en, s.description_kn, s.eligibility_en, s.eligibility_kn, s.benefits_en, s.benefits_kn, s.documents_en, s.documents_kn, s.application_process_en, s.application_process_kn, s.official_url, s.department, s.last_verified_date, s.status);
    }
  }

  const shopCount = db.prepare('SELECT COUNT(*) as c FROM agro_shops').get() as { c: number };
  if (shopCount.c === 0) {
    const insShop = db.prepare(
      `INSERT INTO agro_shops (name, name_kn, category, address, district, taluk, phone, products, operating_hours, latitude, longitude, verification_status, source_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const sh of SHOPS) {
      insShop.run(sh.name, sh.name_kn, sh.category, sh.address, sh.district, sh.taluk, sh.phone, sh.products, sh.operating_hours, sh.latitude, sh.longitude, sh.verification_status, sh.source_label);
    }
  }

  const rentalCount = db.prepare('SELECT COUNT(*) as c FROM equipment_rentals').get() as { c: number };
  if (rentalCount.c === 0) {
    const insRental = db.prepare(
      `INSERT INTO equipment_rentals (equipment_name, equipment_name_kn, category, owner_name, district, taluk, village, rate_info, phone, availability_status, verification_status, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of RENTALS) {
      insRental.run(r.equipment_name, r.equipment_name_kn, r.category, r.owner_name, r.district, r.taluk, r.village, r.rate_info, r.phone, r.availability_status, r.verification_status, r.latitude, r.longitude);
    }
  }

  const priceCount = db.prepare('SELECT COUNT(*) as c FROM market_prices').get() as { c: number };
  if (priceCount.c === 0) {
    const insPrice = db.prepare(
      `INSERT INTO market_prices (apmc_name, apmc_name_kn, district, crop_code, crop_name_en, crop_name_kn, variety, min_price, max_price, modal_price, reported_date, trend, source_name, data_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const p of MARKET_PRICES) {
      insPrice.run(p.apmc_name, p.apmc_name_kn, p.district, p.crop_code, p.crop_name_en, p.crop_name_kn, p.variety, p.min_price, p.max_price, p.modal_price, p.reported_date, p.trend, p.source_name, 'published_reference');
    }
  }

  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
  if (userCount.c === 0) {
    const insUser = db.prepare(
      `INSERT INTO users (name, identifier, email, auth_provider, verification_status, verified_at, password_hash, role, preferred_lang, district, taluk, hobli, village, farm_size_acres, soil_type, irrigation_type, crops_cultivated, latitude, longitude, onboarding_completed, is_demo)
       VALUES (?, ?, ?, 'password', 'verified', datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    );
    const farmerRes = insUser.run(
      'Ramesh Gowda',
      'ramesh.sira',
      null,
      hashPassword('farmer123'),
      'farmer',
      'kn',
      'Tumakuru',
      'Sira',
      'Kallambella',
      'Kallambella',
      3.5,
      'Red Sandy Loam',
      'Borewell + Rainfed',
      JSON.stringify(['ragi', 'groundnut']),
      13.628,
      76.927,
      1
    );

    insUser.run(
      'Krishi Officer',
      'admin.krishi',
      null,
      hashPassword('admin123'),
      'admin',
      'en',
      'Tumakuru',
      'Sira',
      'Kasaba',
      'Sira Rural',
      0,
      'Unknown',
      'None',
      '[]',
      13.741,
      76.904,
      1
    );

    const farmerId = Number(farmerRes.lastInsertRowid);
    db.prepare(
      `INSERT INTO plots (user_id, name, district, taluk, hobli, village, area_acres, soil_type, irrigation_type, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(farmerId, 'Survey No. 42 (East Plot)', 'Tumakuru', 'Sira', 'Kallambella', 'Kallambella', 2.0, 'Red Sandy Loam', 'Rainfed', 13.628, 76.927);
    db.prepare(
      `INSERT INTO plots (user_id, name, district, taluk, hobli, village, area_acres, soil_type, irrigation_type, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(farmerId, 'Borewell Plot (West)', 'Tumakuru', 'Sira', 'Kallambella', 'Thimmalapura', 1.5, 'Red Sandy Loam', 'Drip / Borewell', 13.645, 76.942);
  }
}
