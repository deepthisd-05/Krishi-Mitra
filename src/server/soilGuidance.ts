export type NutrientStatus = 'low' | 'medium' | 'high' | 'unknown';

export interface SoilPlanningTemplate {
  crop_code: string;
  ph_range: string;
  npk_reference_en: string;
  npk_reference_kn: string;
  basal_practice_en: string;
  basal_practice_kn: string;
  default_inputs: Array<{
    name_en: string;
    name_kn: string;
    category: 'seed' | 'fertilizer' | 'soil_amendment' | 'bio_input';
    qty_per_acre_label: string;
    estimated_cost_per_acre_inr: number;
  }>;
}

export const SOIL_PLANNING_TEMPLATES: Record<string, SoilPlanningTemplate> = {
  ragi: {
    crop_code: 'ragi',
    ph_range: '5.5 – 7.5',
    npk_reference_en: 'General Dry Zone Ragi reference: FYM/compost basal + split nitrogen with modest P & K (often ~20:16:10 kg NPK/acre rainfed; higher only under assured irrigation).',
    npk_reference_kn: 'ಸಾಮಾನ್ಯ ರಾಗಿ ಯೋಜನಾ ಉಲ್ಲೇಖ: ಬೇಸಲ್ ಕೊಟ್ಟಿಗೆ ಗೊಬ್ಬರ + ಮಿತವಾದ ರಂಜಕ-ಪೊಟ್ಯಾಶ್ ಹಾಗೂ ಹಂತ ಹಂತವಾಗಿ ಸಾರಜನಕ (ಮಳೆಯಾಶ್ರಿತಕ್ಕೆ ಸುಮಾರು 20:16:10 ಕೆಜಿ/ಎಕರೆ ಮಟ್ಟದಲ್ಲಿ).',
    basal_practice_en: 'Incorporate well-decomposed FYM or vermicompost 2–3 weeks before sowing; split nitrogen top-dressing 30–35 days after sowing only when soil has moisture.',
    basal_practice_kn: 'ಬಿತ್ತನೆಗೆ 2–3 ವಾರ ಮೊದಲು ಕಳಿತ ಕೊಟ್ಟಿಗೆ ಗೊಬ್ಬರ ಸೇರಿಸಿ; 30–35 ದಿನಗಳ ನಂತರ ಮಣ್ಣಿನಲ್ಲಿ ತೇವಾಂಶ ಇದ್ದಾಗ ಮಾತ್ರ ಮೇಲುಗೊಬ್ಬರ ನೀಡಿ.',
    default_inputs: [
      { name_en: 'Certified Ragi Seed (GPU-28 / MR-1)', name_kn: 'ಪ್ರಮಾಣಿತ ರಾಗಿ ಬೀಜ (GPU-28 / MR-1)', category: 'seed', qty_per_acre_label: '4 kg / acre', estimated_cost_per_acre_inr: 320 },
      { name_en: 'Compost / FYM + Trichoderma enrichment', name_kn: 'ಕೊಟ್ಟಿಗೆ ಗೊಬ್ಬರ + ಟ್ರೈಕೋಡರ್ಮಾ', category: 'bio_input', qty_per_acre_label: '2–3 tractor loads / acre', estimated_cost_per_acre_inr: 1500 },
      { name_en: 'DAP + Urea + MOP (split planning)', name_kn: 'ಡಿಎಪಿ + ಯೂರಿಯಾ + ಎಂಒಪಿ (ಹಂತ ಹಂತ)', category: 'fertilizer', qty_per_acre_label: '1 bag DAP + 0.5 bag Urea + 0.3 bag MOP', estimated_cost_per_acre_inr: 1850 },
    ],
  },
  groundnut: {
    crop_code: 'groundnut',
    ph_range: '6.0 – 7.5',
    npk_reference_en: 'General Groundnut reference: Low starter nitrogen + phosphorus/potash + calcium/sulphur support via Gypsum at flowering/pegging (approx. 10:20:10 kg NPK/acre planning band).',
    npk_reference_kn: 'ಸಾಮಾನ್ಯ ಶೇಂಗಾ ಯೋಜನಾ ಉಲ್ಲೇಖ: ಆರಂಭಿಕ ಕಡಿಮೆ ಸಾರಜನಕ + ರಂಜಕ/ಪೊಟ್ಯಾಶ್ ಮತ್ತು ಹೂವು-ಕಾಯಿ ಹಂತದಲ್ಲಿ ಜಿಪ್ಸಂ (ಕ್ಯಾಲ್ಸಿಯಂ/ಗಂಧಕ) ಬೆಂಬಲ.',
    basal_practice_en: 'Apply Rhizobium + PSB seed treatment at sowing and Gypsum around root zone at 35–40 DAS (flowering/pegging) to support pod filling.',
    basal_practice_kn: 'ಬಿತ್ತನೆ ವೇಳೆ ರೈಜೋಬಿಯಂ/ಪಿಎಸ್‌ಬಿ ಬೀಜೋಪಚಾರ ಮಾಡಿ ಮತ್ತು 35–40 ದಿನಗಳ ಹೂವು ಹಂತದಲ್ಲಿ ಬೇರಿಗೆ ಜಿಪ್ಸಂ ನೀಡಿ.',
    default_inputs: [
      { name_en: 'Groundnut Seed Kernel (TMV-2 / KCG-6)', name_kn: 'ಶೇಂಗಾ ಬೀಜ (TMV-2 / KCG-6)', category: 'seed', qty_per_acre_label: '40 kg / acre', estimated_cost_per_acre_inr: 4600 },
      { name_en: 'Agricultural Gypsum (Pod filling)', name_kn: 'ಕೃಷಿ ಜಿಪ್ಸಂ (ಕಾಯಿ ತುಂಬಲು)', category: 'soil_amendment', qty_per_acre_label: '200 kg / acre', estimated_cost_per_acre_inr: 900 },
      { name_en: 'Starter Complex / SSP + MOP + Rhizobium', name_kn: 'ಬೇಸಲ್ ಎಸ್‌ಎಸ್‌ಪಿ + ಎಂಒಪಿ + ರೈಜೋಬಿಯಂ', category: 'fertilizer', qty_per_acre_label: '1.5 bags SSP + 0.4 bag MOP', estimated_cost_per_acre_inr: 1350 },
    ],
  },
  tomato: {
    crop_code: 'tomato',
    ph_range: '6.0 – 7.0',
    npk_reference_en: 'General Tomato reference: Balanced basal nutrition + higher potassium during flowering & fruit set; secondary Calcium/Boron checks help prevent blossom-end rot.',
    npk_reference_kn: 'ಸಾಮಾನ್ಯ ಟೊಮೆಟೊ ಯೋಜನಾ ಉಲ್ಲೇಖ: ಸಮತೋಲಿತ ಬೇಸಲ್ ಪೋಷಣೆ + ಹೂವು-ಕಾಯಿ ಹಂತದಲ್ಲಿ ಹೆಚ್ಚು ಪೊಟ್ಯಾಶ್ ಮತ್ತು ಕ್ಯಾಲ್ಸಿಯಂ/ಬೋರಾನ್ ಸಮತೋಲನ.',
    basal_practice_en: 'Use raised beds with neem cake & compost; split top-dressing or fertigation across vegetative, flowering, and fruit bulking stages.',
    basal_practice_kn: 'ಏರುಮಡಿಗಳಲ್ಲಿ ಬೇವಿನ ಹಿಂಡಿ ಮತ್ತು ಕಾಂಪೋಸ್ಟ್ ಸೇರಿಸಿ; ಸಸ್ಯ ಬೆಳವಣಿಗೆ ಮತ್ತು ಹೂವು-ಕಾಯಿ ಹಂತಗಳಲ್ಲಿ ಗೊಬ್ಬರ ವಿಭಜಿಸಿ ಕೊಡಿ.',
    default_inputs: [
      { name_en: 'Tomato Hybrid Seedlings / Seed', name_kn: 'ಟೊಮೆಟೊ ಸಸಿ / ಬೀಜ', category: 'seed', qty_per_acre_label: '5,000 seedlings / acre', estimated_cost_per_acre_inr: 4500 },
      { name_en: 'Neem Cake + Compost Basal Mix', name_kn: 'ಬೇವಿನ ಹಿಂಡಿ + ಕಾಂಪೋಸ್ಟ್', category: 'bio_input', qty_per_acre_label: '100 kg neem cake + compost', estimated_cost_per_acre_inr: 2400 },
      { name_en: '19:19:19 / NPK + Potash & Micronutrient Mix', name_kn: '19:19:19 / ಎನ್‌ಪಿಕೆ + ಪೊಟ್ಯಾಶ್ + ಸೂಕ್ಷ್ಮ ಪೋಷಕಾಂಶ', category: 'fertilizer', qty_per_acre_label: '2–3 bags split', estimated_cost_per_acre_inr: 3400 },
    ],
  },
  maize: {
    crop_code: 'maize',
    ph_range: '5.8 – 7.5',
    npk_reference_en: 'General Maize reference: Nitrogen-responsive crop (3-way split: basal, knee-high, and tasseling) alongside basal P, K, and Zinc Sulphate in deficient soils.',
    npk_reference_kn: 'ಸಾಮಾನ್ಯ ಮೆಕ್ಕೆಜೋಳ ಉಲ್ಲೇಖ: ಸಾರಜನಕಕ್ಕೆ ಹೆಚ್ಚು ಪ್ರತಿಕ್ರಿಯಿಸುವ ಬೆಳೆ (ಬೇಸಲ್, ಮೊಣಕಾಲು ಎತ್ತರ ಮತ್ತು ತುರಾಯಿ ಹಂತದಲ್ಲಿ 3 ವಿಭಜನೆ) + ಸತುವಿನ ಸಲ್ಫೇಟ್.',
    basal_practice_en: 'Never dump all nitrogen at sowing; split urea into knee-high (25–30 DAS) and pre-tasseling (45–50 DAS) when soil is moist.',
    basal_practice_kn: 'ಎಲ್ಲಾ ಯೂರಿಯಾವನ್ನು ಒಮ್ಮೆಲೇ ಹಾಕಬೇಡಿ; 25–30 ದಿನ ಮತ್ತು 45–50 ದಿನಗಳ ಹಂತದಲ್ಲಿ ತೇವಾಂಶ ಇರುವಾಗ ವಿಭಜಿಸಿ ಕೊಡಿ.',
    default_inputs: [
      { name_en: 'Hybrid Maize Seed', name_kn: 'ಹೈಬ್ರಿಡ್ ಮೆಕ್ಕೆಜೋಳ ಬೀಜ', category: 'seed', qty_per_acre_label: '7–8 kg / acre', estimated_cost_per_acre_inr: 1800 },
      { name_en: 'Basal DAP + MOP + Zinc Sulphate', name_kn: 'ಬೇಸಲ್ ಡಿಎಪಿ + ಎಂಒಪಿ + ಜಿಂಕ್ ಸಲ್ಫೇಟ್', category: 'fertilizer', qty_per_acre_label: '1.5 bags DAP + 0.5 bag MOP + 5 kg Zn', estimated_cost_per_acre_inr: 2550 },
      { name_en: 'Split Urea Top-Dressing (2 stages)', name_kn: 'ವಿಭಜಿತ ಯೂರಿಯಾ ಮೇಲುಗೊಬ್ಬರ (2 ಹಂತ)', category: 'fertilizer', qty_per_acre_label: '1.5 bags Urea / acre', estimated_cost_per_acre_inr: 500 },
    ],
  },
  red_gram: {
    crop_code: 'red_gram',
    ph_range: '6.0 – 7.5',
    npk_reference_en: 'General Red Gram (Tur) reference: Low nitrogen starter + adequate phosphorus & sulphur for root nodulation and pod set.',
    npk_reference_kn: 'ಸಾಮಾನ್ಯ ತೊಗರಿ ಯೋಜನಾ ಉಲ್ಲೇಖ: ಕಡಿಮೆ ಆರಂಭಿಕ ಸಾರಜನಕ + ಬೇರು ಗಂಟು ಬೆಳವಣಿಗೆಗೆ ರಂಜಕ ಮತ್ತು ಗಂಧಕ.',
    basal_practice_en: 'Treat seeds with Rhizobium and Trichoderma; apply basal DAP/SSP before ridges and avoid excess late nitrogen that causes excessive leafy growth.',
    basal_practice_kn: 'ರೈಜೋಬಿಯಂ ಮತ್ತು ಟ್ರೈಕೋಡರ್ಮಾ ಬೀಜೋಪಚಾರ ಮಾಡಿ; ಹೆಚ್ಚು ಸಾರಜನಕ ಕೊಟ್ಟರೆ ಹೂವು ಕಡಿಮೆಯಾಗಿ ಎಲೆ ಬೆಳವಣಿಗೆ ಹೆಚ್ಚಾಗಬಹುದು.',
    default_inputs: [
      { name_en: 'Tur Seed (BRG-2 / BRG-5)', name_kn: 'ತೊಗರಿ ಬೀಜ (BRG-2 / BRG-5)', category: 'seed', qty_per_acre_label: '5–6 kg / acre', estimated_cost_per_acre_inr: 750 },
      { name_en: 'SSP / DAP Basal + Rhizobium Culture', name_kn: 'ಎಸ್‌ಎಸ್‌ಪಿ / ಡಿಎಪಿ ಬೇಸಲ್ + ರೈಜೋಬಿಯಂ', category: 'fertilizer', qty_per_acre_label: '1 bag DAP + bio-culture', estimated_cost_per_acre_inr: 1450 },
    ],
  },
  coconut: {
    crop_code: 'coconut',
    ph_range: '5.5 – 7.8',
    npk_reference_en: 'General Coconut basin reference: Organic compost/green leaf manure + annual NPK split (higher Potash) + Borax/Magnesium support where yellowing appears.',
    npk_reference_kn: 'ಸಾಮಾನ್ಯ ತೆಂಗು ಪಾತಿ ಉಲ್ಲೇಖ: ಸಾವಯವ ಗೊಬ್ಬರ/ಹಸಿರೆಲೆ ಗೊಬ್ಬರ + ವರ್ಷಕ್ಕೆ ಎರಡು ಬಾರಿ ಎನ್‌ಪಿಕೆ (ಹೆಚ್ಚು ಪೊಟ್ಯಾಶ್) + ಬೋರಾನ್/ಮೆಗ್ನೀಸಿಯಂ.',
    basal_practice_en: 'Apply nutrients in a circular basin 1.5–1.8 m around the palm trunk during pre-monsoon and post-monsoon moisture windows, covered with coconut husk/mulch.',
    basal_practice_kn: 'ಮರದ ಬುಡದಿಂದ 1.5 ಮೀ ದೂರದಲ್ಲಿ ವೃತ್ತಾಕಾರದ ಪಾತಿಯಲ್ಲಿ ಮುಂಗಾರು-ಹಿಂಗಾರು ಮಳೆ ವೇಳೆ ಗೊಬ್ಬರ ನೀಡಿ ತೆಂಗಿನ ನಾರಿನ ಮಲ್ಚಿಂಗ್ ಮಾಡಿ.',
    default_inputs: [
      { name_en: 'Compost / Neem Cake per palm block', name_kn: 'ಕಾಂಪೋಸ್ಟ್ + ಬೇವಿನ ಹಿಂಡಿ', category: 'bio_input', qty_per_acre_label: 'Basin organic mix (~70 palms/acre)', estimated_cost_per_acre_inr: 3200 },
      { name_en: 'MOP + Urea + Rock Phosphate + Boron Mix', name_kn: 'ಎಂಒಪಿ + ಯೂರಿಯಾ + ರಂಜಕ + ಬೋರಾನ್', category: 'fertilizer', qty_per_acre_label: 'Annual 2-split basin plan', estimated_cost_per_acre_inr: 3800 },
    ],
  },
};

export function getSoilPlanningTemplate(cropCode: string): SoilPlanningTemplate {
  if (SOIL_PLANNING_TEMPLATES[cropCode]) {
    return SOIL_PLANNING_TEMPLATES[cropCode];
  }
  return {
    crop_code: cropCode,
    ph_range: '6.0 – 7.5',
    npk_reference_en:
      'General crop planning reference: Base exact nitrogen, phosphorus, potash, and micronutrient quantities on your plot Soil Health Card and verify with your local Raitha Samparka Kendra (RSK).',
    npk_reference_kn:
      'ಸಾಮಾನ್ಯ ಬೆಳೆ ಯೋಜನಾ ಉಲ್ಲೇಖ: ನಿಖರವಾದ ಸಾರಜನಕ, ರಂಜಕ, ಪೊಟ್ಯಾಶ್ ಮತ್ತು ಸೂಕ್ಷ್ಮ ಪೋಷಕಾಂಶಗಳ ಪ್ರಮಾಣವನ್ನು ನಿಮ್ಮ ಮಣ್ಣಿನ ಆರೋಗ್ಯ ಕಾರ್ಡ್ ಮತ್ತು ಸ್ಥಳೀಯ ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರದಿಂದ ದೃಢಪಡಿಸಿ.',
    basal_practice_en:
      'Incorporate organic compost/FYM before sowing, use seed bio-inoculants where suited, and split nitrogen applications rather than applying all at once.',
    basal_practice_kn:
      'ಬಿತ್ತನೆಗೆ ಮುನ್ನ ಸಾವಯವ/ಕೊಟ್ಟಿಗೆ ಗೊಬ್ಬರ ಸೇರಿಸಿ ಮತ್ತು ಸಾರಜನಕ ಗೊಬ್ಬರವನ್ನು ಹಂತ ಹಂತವಾಗಿ ನೀಡಿ.',
    default_inputs: [
      { name_en: 'Certified Crop Seed', name_kn: 'ಪ್ರಮಾಣಿತ ಬೆಳೆ ಬೀಜ', category: 'seed', qty_per_acre_label: '1 acre seed lot', estimated_cost_per_acre_inr: 1200 },
      { name_en: 'Compost / FYM Basal Application', name_kn: 'ಕೊಟ್ಟಿಗೆ / ಸಾವಯವ ಗೊಬ್ಬರ', category: 'bio_input', qty_per_acre_label: 'Basal organic lot', estimated_cost_per_acre_inr: 1600 },
      { name_en: 'Balanced Basal & Top-Dressing Fertilizer', name_kn: 'ಬೇಸಲ್ ಮತ್ತು ಮೇಲುಗೊಬ್ಬರ', category: 'fertilizer', qty_per_acre_label: '1–2 bags / acre', estimated_cost_per_acre_inr: 1800 },
    ],
  };
}

export function buildSoilAdvisoryNotes(params: {
  soilType: string;
  phLevel: number | null;
  nStatus: NutrientStatus;
  pStatus: NutrientStatus;
  kStatus: NutrientStatus;
  cropCode: string;
}): { en: string[]; kn: string[] } {
  const tpl = getSoilPlanningTemplate(params.cropCode);
  const en: string[] = [tpl.npk_reference_en, `Typical pH band for this crop: ${tpl.ph_range}.`];
  const kn: string[] = [tpl.npk_reference_kn, `ಈ ಬೆಳೆಗೆ ಸಾಮಾನ್ಯ ಮಣ್ಣಿನ ಪಿಹೆಚ್ ಮಟ್ಟ: ${tpl.ph_range}.`];

  if (params.phLevel !== null && !Number.isNaN(params.phLevel)) {
    if (params.phLevel < 5.5) {
      en.push(`Logged pH ${params.phLevel.toFixed(1)} is acidic — ask RSK if agricultural lime/dolomite amendment is needed before phosphorus fertilization.`);
      kn.push(`ದಾಖಲಿಸಿದ ಪಿಹೆಚ್ ${params.phLevel.toFixed(1)} ಆಮ್ಲೀಯವಾಗಿದೆ — ರಂಜಕ ಗೊಬ್ಬರಕ್ಕೆ ಮೊದಲು ಕೃಷಿ ಸುಣ್ಣ/ಡೊಲೊಮೈಟ್ ಅಗತ್ಯವಿದೆಯೇ ಎಂದು ಆರ್‌ಎಸ್‌ಕೆಯಲ್ಲಿ ವಿಚಾರಿಸಿ.`);
    } else if (params.phLevel > 8.0) {
      en.push(`Logged pH ${params.phLevel.toFixed(1)} is alkaline — organic compost, green manuring, or gypsum check with RSK helps micronutrient uptake.`);
      kn.push(`ದಾಖಲಿಸಿದ ಪಿಹೆಚ್ ${params.phLevel.toFixed(1)} ಕ್ಷಾರೀಯವಾಗಿದೆ — ಸಾವಯವ ಗೊಬ್ಬರ/ಜಿಪ್ಸಂ ಬಳಕೆಯ ಕುರಿತು ಆರ್‌ಎಸ್‌ಕೆ ಸಲಹೆ ಪಡೆಯಿರಿ.`);
    } else {
      en.push(`Logged pH ${params.phLevel.toFixed(1)} falls in a generally favorable nutrient-availability window.`);
      kn.push(`ದಾಖಲಿಸಿದ ಪಿಹೆಚ್ ${params.phLevel.toFixed(1)} ಪೋಷಕಾಂಶ ಲಭ್ಯತೆಗೆ ಸಾಮಾನ್ಯವಾಗಿ ಅನುಕೂಲಕರವಾಗಿದೆ.`);
    }
  }

  const lowList: string[] = [];
  const lowListKn: string[] = [];
  if (params.nStatus === 'low') {
    lowList.push('Nitrogen (N)');
    lowListKn.push('ಸಾರಜನಕ (N)');
  }
  if (params.pStatus === 'low') {
    lowList.push('Phosphorus (P)');
    lowListKn.push('ರಂಜಕ (P)');
  }
  if (params.kStatus === 'low') {
    lowList.push('Potassium (K)');
    lowListKn.push('ಪೊಟ್ಯಾಶ್ (K)');
  }

  if (lowList.length > 0) {
    en.push(`Marked Low: ${lowList.join(', ')} — plan split organic + basal replenishment and confirm exact kg/acre dosage with your local RSK.`);
    kn.push(`ಕಡಿಮೆ ಮಟ್ಟ: ${lowListKn.join(', ')} — ಸಾವಯವ ಮತ್ತು ಹಂತ ಹಂತದ ಪೋಷಣೆ ಯೋಜಿಸಿ, ನಿಖರ ಕೆಜಿ/ಎಕರೆ ಪ್ರಮಾಣವನ್ನು ಸ್ಥಳೀಯ ಆರ್‌ಎಸ್‌ಕೆಯಲ್ಲಿ ದೃಢಪಡಿಸಿ.`);
  }

  en.push(tpl.basal_practice_en);
  kn.push(tpl.basal_practice_kn);
  return { en, kn };
}

export interface StageFertilizerSuggestion {
  id: string;
  name_en: string;
  name_kn: string;
  category: 'seed' | 'fertilizer' | 'soil_amendment' | 'bio_input';
  qty_per_acre_label: string;
  estimated_cost_per_acre_inr: number;
  estimated_cost_total_inr: number;
  rationale_en: string;
  rationale_kn: string;
}

export interface StageFertilizerRecommendation {
  crop_code: string;
  crop_stage: string;
  summary_en: string;
  summary_kn: string;
  suggestions: StageFertilizerSuggestion[];
}

export function getStageFertilizerSuggestions(params: {
  cropCode: string;
  cropStage: string;
  phLevel: number | null;
  nStatus: NutrientStatus;
  pStatus: NutrientStatus;
  kStatus: NutrientStatus;
  areaAcres: number;
}): StageFertilizerRecommendation {
  const scale = Math.max(0.25, Number(params.areaAcres) || 1);
  const tpl = getSoilPlanningTemplate(params.cropCode);
  const isVegetative = /vegetative|top-dressing/i.test(params.cropStage);
  const isFlowering = /flowering|pod|fruit|grain/i.test(params.cropStage);
  const isBasal = !isVegetative && !isFlowering;

  const suggestions: StageFertilizerSuggestion[] = [];
  const pushItem = (item: Omit<StageFertilizerSuggestion, 'estimated_cost_total_inr'>) => {
    suggestions.push({
      ...item,
      estimated_cost_total_inr: Math.round(item.estimated_cost_per_acre_inr * scale),
    });
  };

  if (isBasal) {
    for (let i = 0; i < tpl.default_inputs.length; i += 1) {
      const def = tpl.default_inputs[i];
      pushItem({
        id: `${params.cropCode}-basal-${i}`,
        name_en: def.name_en,
        name_kn: def.name_kn,
        category: def.category,
        qty_per_acre_label: def.qty_per_acre_label,
        estimated_cost_per_acre_inr: def.estimated_cost_per_acre_inr,
        rationale_en:
          def.category === 'seed'
            ? 'Basal stage: certified seed / planting lot for your planned acreage.'
            : def.category === 'bio_input'
            ? 'Builds organic carbon and microbial activity before sowing.'
            : 'General basal nutrient foundation; confirm exact bag count with SHC/RSK.',
        rationale_kn:
          def.category === 'seed'
            ? 'ಬಿತ್ತನೆ ಪೂರ್ವ ಹಂತ: ಪ್ರಮಾಣಿತ ಬೀಜದ ವೆಚ್ಚ ಅಂದಾಜು.'
            : def.category === 'bio_input'
            ? 'ಬಿತ್ತನೆಗೆ ಮುನ್ನ ಮಣ್ಣಿನ ಸಾವಯವ ಶಕ್ತಿ ಮತ್ತು ಸೂಕ್ಷ್ಮಜೀವಿ ಚಟುವಟಿಕೆಗೆ ಸಹಾಯಕ.'
            : 'ಸಾಮಾನ್ಯ ಬೇಸಲ್ ಪೋಷಕಾಂಶ ಯೋಜನೆ; ನಿಖರ ಪ್ರಮಾಣವನ್ನು SHC/RSK ಮೂಲಕ ಖಚಿತಪಡಿಸಿ.',
      });
    }
  } else if (isVegetative) {
    if (params.nStatus !== 'high') {
      const boostNoteEn =
        params.nStatus === 'low'
          ? 'Nitrogen marked Low — prioritize split top-dressing when soil has adequate moisture.'
          : 'General vegetative canopy growth split; apply only in moist soil.';
      const boostNoteKn =
        params.nStatus === 'low'
          ? 'ಸಾರಜನಕ ಕಡಿಮೆ ಇರುವುದರಿಂದ ಮಣ್ಣಿನಲ್ಲಿ ತೇವಾಂಶ ಇದ್ದಾಗ ಹಂತ ಹಂತದ ಮೇಲುಗೊಬ್ಬರಕ್ಕೆ ಆದ್ಯತೆ ನೀಡಿ.'
          : 'ಸಸ್ಯ ಬೆಳವಣಿಗೆ ಹಂತದ ಸಾಮಾನ್ಯ ಮೇಲುಗೊಬ್ಬರ; ಮಣ್ಣಿನಲ್ಲಿ ತೇವಾಂಶ ಇದ್ದಾಗ ಮಾತ್ರ ಕೊಡಿ.';
      pushItem({
        id: `${params.cropCode}-veg-n`,
        name_en:
          params.cropCode === 'groundnut' || params.cropCode === 'red_gram'
            ? 'Light Booster + Bio-Spray (19:19:19 foliar / Vermicompost)'
            : 'Neem-Coated Urea Split Top-Dressing',
        name_kn:
          params.cropCode === 'groundnut' || params.cropCode === 'red_gram'
            ? 'ಲಘು ಪೋಷಕಾಂಶ + ಜೈವಿಕ ಸಿಂಪಡಣೆ (19:19:19 / ಎರೆಹುಳು ಗೊಬ್ಬರ)'
            : 'ಬೇವು ಲೇಪಿತ ಯೂರಿಯಾ ಮೇಲುಗೊಬ್ಬರ (ವಿಭಜಿತ)',
        category: params.cropCode === 'groundnut' || params.cropCode === 'red_gram' ? 'bio_input' : 'fertilizer',
        qty_per_acre_label: params.nStatus === 'low' ? '0.75–1 bag / acre (split)' : '0.5 bag / acre (check moisture)',
        estimated_cost_per_acre_inr: params.nStatus === 'low' ? 420 : 280,
        rationale_en: boostNoteEn,
        rationale_kn: boostNoteKn,
      });
    }

    if (params.cropCode === 'maize' || params.cropCode === 'ragi' || params.cropCode === 'tomato') {
      pushItem({
        id: `${params.cropCode}-veg-micro`,
        name_en: 'Zinc Sulphate + Micronutrient Mixture (Foliar/Soil)',
        name_kn: 'ಜಿಂಕ್ ಸಲ್ಫೇಟ್ + ಸೂಕ್ಷ್ಮ ಪೋಷಕಾಂಶ ಮಿಶ್ರಣ',
        category: 'fertilizer',
        qty_per_acre_label: '4–5 kg / acre soil or RSK foliar mix',
        estimated_cost_per_acre_inr: 450,
        rationale_en: 'Supports chlorophyll & internode vigor in Central/Eastern Dry Zone soils.',
        rationale_kn: 'ಒಣ ವಲಯದ ಮಣ್ಣಿನಲ್ಲಿ ಹಸಿರು ಮತ್ತು ಸಸ್ಯ ಶಕ್ತಿ ಕಾಪಾಡಲು ಸಹಾಯಕ (RSK ಸಲಹೆ ಮೇರೆಗೆ).',
      });
    }

    pushItem({
      id: `${params.cropCode}-veg-org`,
      name_en: 'Enriched Compost / Vermicompost Side-Dressing',
      name_kn: 'ಸಮೃದ್ಧ ಕಾಂಪೋಸ್ಟ್ / ಎರೆಹುಳು ಗೊಬ್ಬರ',
      category: 'bio_input',
      qty_per_acre_label: '200–250 kg / acre around root zone',
      estimated_cost_per_acre_inr: 900,
      rationale_en: 'Improves moisture retention and buffers fertilizer efficiency during inter-cultivation.',
      rationale_kn: 'ಎಡೆಕುಂಟೆ ಸಮಯದಲ್ಲಿ ತೇವಾಂಶ ಹಿಡಿದಿಟ್ಟುಕೊಳ್ಳಲು ಮತ್ತು ಪೋಷಕಾಂಶ ಹೀರಿಕೆಗೆ ನೆರವಾಗುತ್ತದೆ.',
    });
  } else {
    // Flowering / Pod Filling stage
    if (params.cropCode === 'groundnut') {
      pushItem({
        id: 'groundnut-flower-gypsum',
        name_en: 'Agricultural Gypsum (Calcium & Sulphur for Pegging)',
        name_kn: 'ಕೃಷಿ ಜಿಪ್ಸಂ (ಕಾಯಿ ಮತ್ತು ಬೀಜ ತುಂಬಲು)',
        category: 'soil_amendment',
        qty_per_acre_label: '200 kg / acre at pegging',
        estimated_cost_per_acre_inr: 900,
        rationale_en: 'Flowering/pegging stage: Calcium & Sulphur aid well-filled groundnut pods.',
        rationale_kn: 'ಹೂವು ಮತ್ತು ಊಡು ಇಳಿಯುವ ಹಂತದಲ್ಲಿ ಕಾಯಿ ಚೆನ್ನಾಗಿ ತುಂಬಲು ಕ್ಯಾಲ್ಸಿಯಂ-ಗಂಧಕ ಪೂರೈಸುತ್ತದೆ.',
      });
    }

    pushItem({
      id: `${params.cropCode}-flower-k`,
      name_en:
        params.cropCode === 'tomato' || params.cropCode === 'coconut'
          ? 'Potash / 0:0:50 (SOP) + Calcium-Boron Support'
          : 'Potash (MOP / 0:0:50 Foliar) for Grain & Pod Filling',
      name_kn:
        params.cropCode === 'tomato' || params.cropCode === 'coconut'
          ? 'ಪೊಟ್ಯಾಶ್ / 0:0:50 + ಕ್ಯಾಲ್ಸಿಯಂ-ಬೋರಾನ್ ಬೆಂಬಲ'
          : 'ಪೊಟ್ಯಾಶ್ (MOP / 0:0:50) ಕಾಳು ಮತ್ತು ಕಾಯಿ ತುಂಬಲು',
      category: 'fertilizer',
      qty_per_acre_label: params.kStatus === 'low' ? '15–20 kg MOP or 1 kg SOP spray / acre' : '10 kg MOP or 0.5 kg SOP / acre',
      estimated_cost_per_acre_inr: params.kStatus === 'low' ? 680 : 450,
      rationale_en:
        params.kStatus === 'low'
          ? 'Potash marked Low — important during flowering/grain filling for weight and stress tolerance.'
          : 'Supports flower retention, grain/pod weight, and moisture-stress resilience.',
      rationale_kn:
        params.kStatus === 'low'
          ? 'ಪೊಟ್ಯಾಶ್ ಕಡಿಮೆ ಇರುವುದರಿಂದ ಹೂವು ಮತ್ತು ಕಾಳು ತುಂಬುವ ಹಂತದಲ್ಲಿ ಗುಣಮಟ್ಟಕ್ಕೆ ಅಗತ್ಯ.'
          : 'ಹೂವು ಉದುರುವುದನ್ನು ತಡೆಯಲು ಹಾಗೂ ಕಾಳು/ಕಾಯಿ ತೂಕ ಹೆಚ್ಚಿಸಲು ಸಾಮಾನ್ಯ ಬೆಂಬಲ.',
    });

    pushItem({
      id: `${params.cropCode}-flower-bio`,
      name_en: 'Pulse / Fruit-Set Bio-Booster or Neem-Based Care',
      name_kn: 'ಹೂವು-ಕಾಯಿ ಹಂತದ ಜೈವಿಕ ಪೋಷಕ / ಬೇವಿನ ಆರೈಕೆ',
      category: 'bio_input',
      qty_per_acre_label: 'Per RSK calm-hour spray check',
      estimated_cost_per_acre_inr: 350,
      rationale_en: 'Gentle biological support; pause all foliar sprays if rain or strong wind is forecast.',
      rationale_kn: 'ಹೂವು ಹಂತದಲ್ಲಿ ಸೌಮ್ಯ ಬೆಂಬಲ; ಮಳೆ ಅಥವಾ ಗಾಳಿ ಮುನ್ಸೂಚನೆ ಇದ್ದರೆ ಸಿಂಪಡಣೆ ನಿಲ್ಲಿಸಿ.',
    });
  }

  // Conditional NPK & pH adjustments
  if (params.pStatus === 'low' && !isBasal) {
    pushItem({
      id: `${params.cropCode}-low-p`,
      name_en: 'PSB Bio-Fertilizer + Phosphorus Check (SSP/DAP per RSK)',
      name_kn: 'ಪಿಎಸ್‌ಬಿ ಜೈವಿಕ ಗೊಬ್ಬರ + ರಂಜಕ ಪರಿಶೀಲನೆ (RSK ಸಲಹೆ)',
      category: 'bio_input',
      qty_per_acre_label: '2 kg PSB with compost / acre',
      estimated_cost_per_acre_inr: 260,
      rationale_en: 'Phosphorus marked Low — PSB helps unlock bound soil P around active roots.',
      rationale_kn: 'ರಂಜಕ ಕಡಿಮೆ ದಾಖಲಾಗಿದೆ — ಮಣ್ಣಿನಲ್ಲಿರುವ ರಂಜಕ ಬೇರಿಗೆ ಲಭ್ಯವಾಗಲು PSB ಸಹಾಯಕ.',
    });
  }

  if (params.kStatus === 'low' && isBasal) {
    pushItem({
      id: `${params.cropCode}-low-k-basal`,
      name_en: 'Extra Muriate of Potash (MOP) Allocation (Low-K Plot)',
      name_kn: 'ಹೆಚ್ಚುವರಿ ಪೊಟ್ಯಾಶ್ (MOP) ಯೋಜನೆ (ಕಡಿಮೆ-K ತಾಕು)',
      category: 'fertilizer',
      qty_per_acre_label: '10–15 kg / acre (verify on SHC)',
      estimated_cost_per_acre_inr: 480,
      rationale_en: 'Potassium marked Low — discuss basal K adjustment at your local RSK.',
      rationale_kn: 'ಪೊಟ್ಯಾಶ್ ಕಡಿಮೆ ಇರುವುದರಿಂದ ಬೇಸಲ್ ಪ್ರಮಾಣವನ್ನು ಸ್ಥಳೀಯ ಆರ್‌ಎಸ್‌ಕೆಯಲ್ಲಿ ಖಚಿತಪಡಿಸಿ.',
    });
  }

  if (params.phLevel !== null && !Number.isNaN(params.phLevel)) {
    if (params.phLevel < 5.5) {
      pushItem({
        id: `${params.cropCode}-acidic-lime`,
        name_en: 'Agricultural Lime / Dolomite Soil Amendment',
        name_kn: 'ಕೃಷಿ ಸುಣ್ಣ / ಡೊಲೊಮೈಟ್ ಮಣ್ಣು ಸುಧಾರಕ',
        category: 'soil_amendment',
        qty_per_acre_label: '150–200 kg / acre (confirm SHC buffer pH)',
        estimated_cost_per_acre_inr: 850,
        rationale_en: `Acidic soil pH ${params.phLevel.toFixed(1)} reduces P availability; verify exact lime dose via SHC.`,
        rationale_kn: `ಆಮ್ಲೀಯ pH ${params.phLevel.toFixed(1)} ರಂಜಕ ಲಭ್ಯತೆ ಕಡಿಮೆ ಮಾಡುತ್ತದೆ; SHC ವರದಿ ಪ್ರಕಾರ ಸುಣ್ಣ ಪ್ರಮಾಣ ಖಚಿತಪಡಿಸಿ.`,
      });
    } else if (params.phLevel > 8.0) {
      pushItem({
        id: `${params.cropCode}-alkaline-gypsum`,
        name_en: 'Gypsum + Organic Compost Alkalinity Buffer',
        name_kn: 'ಜಿಪ್ಸಂ + ಸಾವಯವ ಗೊಬ್ಬರ (ಕ್ಷಾರೀಯ ಮಣ್ಣು ಸುಧಾರಣೆ)',
        category: 'soil_amendment',
        qty_per_acre_label: '200 kg gypsum + compost / acre',
        estimated_cost_per_acre_inr: 950,
        rationale_en: `Alkaline soil pH ${params.phLevel.toFixed(1)} can lock micronutrients; confirm amendment rate at RSK.`,
        rationale_kn: `ಕ್ಷಾರೀಯ pH ${params.phLevel.toFixed(1)} ಸೂಕ್ಷ್ಮ ಪೋಷಕಾಂಶ ತಡೆಯಬಹುದು; RSK ಅಧಿಕಾರಿಗಳಿಂದ ದೃಢಪಡಿಸಿ.`,
      });
    }
  }

  const flaggedLowEn: string[] = [];
  const flaggedLowKn: string[] = [];
  if (params.nStatus === 'low') {
    flaggedLowEn.push('Low N');
    flaggedLowKn.push('ಕಡಿಮೆ N');
  }
  if (params.pStatus === 'low') {
    flaggedLowEn.push('Low P');
    flaggedLowKn.push('ಕಡಿಮೆ P');
  }
  if (params.kStatus === 'low') {
    flaggedLowEn.push('Low K');
    flaggedLowKn.push('ಕಡಿಮೆ K');
  }
  if (params.phLevel !== null && params.phLevel < 5.5) {
    flaggedLowEn.push(`Acidic pH ${params.phLevel.toFixed(1)}`);
    flaggedLowKn.push(`ಆಮ್ಲೀಯ pH ${params.phLevel.toFixed(1)}`);
  } else if (params.phLevel !== null && params.phLevel > 8.0) {
    flaggedLowEn.push(`Alkaline pH ${params.phLevel.toFixed(1)}`);
    flaggedLowKn.push(`ಕ್ಷಾರೀಯ pH ${params.phLevel.toFixed(1)}`);
  }

  const summary_en =
    flaggedLowEn.length > 0
      ? `General planning suggestions for ${params.cropStage} adjusted for ${flaggedLowEn.join(', ')} (${scale} ac). Confirm final quantities with your Soil Health Card & RSK.`
      : `General planning suggestions for ${params.cropStage} (${scale} ac). Confirm exact dosages with your Soil Health Card & local RSK before purchasing.`;

  const summary_kn =
    flaggedLowKn.length > 0
      ? `${params.cropStage} ಹಂತಕ್ಕೆ ${flaggedLowKn.join(', ')} ಆಧಾರಿತ ಸಾಮಾನ್ಯ ಯೋಜನಾ ಸಲಹೆ (${scale} ಎಕರೆ). ಖರೀದಿಗೆ ಮುನ್ನ SHC ಮತ್ತು ಆರ್‌ಎಸ್‌ಕೆಯಲ್ಲಿ ಖಚಿತಪಡಿಸಿ.`
      : `${params.cropStage} ಹಂತಕ್ಕೆ ಸಾಮಾನ್ಯ ಯೋಜನಾ ಸಲಹೆ (${scale} ಎಕರೆ). ಖರೀದಿಗೆ ಮುನ್ನ ಅಧಿಕೃತ SHC ವರದಿ ಮತ್ತು ಆರ್‌ಎಸ್‌ಕೆ ಅಧಿಕಾರಿಗಳಿಂದ ದೃಢಪಡಿಸಿ.`;

  return {
    crop_code: params.cropCode,
    crop_stage: params.cropStage,
    summary_en,
    summary_kn,
    suggestions,
  };
}
