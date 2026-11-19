import type { CropStageTemplate } from './types.ts';

export interface CropRow {
  code: string;
  name_en: string;
  name_kn: string;
  category: string;
  category_kn: string;
  varieties: string;
  seasons: string;
  soils: string;
  duration_days: number;
  water_need: string;
  water_need_kn: string;
  applicable_zones: string;
  source_institution: string;
  source_url: string;
  verified_date: string;
  notes_en: string;
  notes_kn: string;
  stages: string;
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface GeneratedCalendarResult {
  data_coverage: 'verified' | 'partial_adaptation';
  limitation_note_en: string;
  limitation_note_kn: string;
  tasks: Array<{
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
    source_institution: string;
  }>;
}

export function generateHyperlocalSchedule(params: {
  crop: CropRow;
  variety: string;
  season: string;
  soilType: string;
  irrigationType: string;
  sowingDate: string;
  district: string;
  taluk: string;
  agroZone: string;
}): GeneratedCalendarResult {
  const stages = JSON.parse(params.crop.stages) as CropStageTemplate[];
  const zones = JSON.parse(params.crop.applicable_zones) as string[];
  const soils = JSON.parse(params.crop.soils) as string[];
  const seasons = JSON.parse(params.crop.seasons) as string[];

  const zoneMatched = zones.some((z) => z.toLowerCase().includes(params.agroZone.toLowerCase()) || params.agroZone.toLowerCase().includes(z.toLowerCase()));
  const soilMatched = soils.some((s) => s.toLowerCase().includes(params.soilType.toLowerCase()) || params.soilType.toLowerCase().includes(s.toLowerCase()));
  const seasonMatched = seasons.some((s) => s.toLowerCase().includes(params.season.toLowerCase()) || params.season.toLowerCase().includes(s.toLowerCase()));

  const limitationsEn: string[] = [];
  const limitationsKn: string[] = [];

  if (!zoneMatched) {
    limitationsEn.push(`Verified trials primarily cover ${zones.join(', ')}; ${params.taluk} (${params.agroZone}) is outside the primary zone. Confirm variety suitability with your local KVK/RSK.`);
    limitationsKn.push(`ದೃಢೀಕೃತ ಪ್ರಯೋಗಗಳು ಮುಖ್ಯವಾಗಿ ${zones.join(', ')} ವಲಯಕ್ಕೆ ಸೀಮಿತವಾಗಿವೆ; ${params.taluk} (${params.agroZone}) ಭಾಗಕ್ಕೆ ಸ್ಥಳೀಯ KVK/RSK ಸಲಹೆ ಪಡೆಯಿರಿ.`);
  }

  if ((params.crop.code === 'paddy' || params.crop.code === 'sugarcane') && params.irrigationType.toLowerCase().includes('rainfed')) {
    limitationsEn.push(`${params.crop.name_en} requires high assured irrigation and is NOT recommended under purely rainfed conditions in ${params.taluk}.`);
    limitationsKn.push(`${params.crop.name_kn} ಬೆಳೆಗೆ ಹೆಚ್ಚಿನ ನೀರಾವರಿ ಅಗತ್ಯವಿದ್ದು, ${params.taluk} ತಾಲ್ಲೂಕಿನ ಕೇವಲ ಮಳೆಯಾಶ್ರಿತ ಭೂಮಿಗೆ ಶಿಫಾರಸು ಮಾಡಲಾಗುವುದಿಲ್ಲ.`);
  }

  if (!soilMatched && params.soilType !== 'Unknown') {
    limitationsEn.push(`Selected soil (${params.soilType}) differs from primary recommended soils (${soils.join(', ')}); adjust organic matter and drainage accordingly.`);
    limitationsKn.push(`ಆಯ್ಕೆ ಮಾಡಿದ ಮಣ್ಣು (${params.soilType}) ಸಾಮಾನ್ಯ ಶಿಫಾರಸು ಮಣ್ಣಿಗಿಂತ ಭಿನ್ನವಾಗಿದೆ; ಸಾವಯವ ಗೊಬ್ಬರ ಮತ್ತು ನೀರು ಬಸಿದು ಹೋಗುವ ವ್ಯವಸ್ಥೆ ಸರಿಹೊಂದಿಸಿ.`);
  }

  if (!seasonMatched) {
    limitationsEn.push(`Selected season (${params.season}) is off-peak for ${params.crop.name_en}; verify local sowing window with Raitha Samparka Kendra.`);
    limitationsKn.push(`ಆಯ್ಕೆ ಮಾಡಿದ ಹಂಗಾಮು (${params.season}) ಈ ಬೆಳೆಗೆ ಸಾಮಾನ್ಯವಲ್ಲದ ಅವಧಿಯಾಗಿದೆ; RSK ನಲ್ಲಿ ಬಿತ್ತನೆ ಅವಧಿ ದೃಢಪಡಿಸಿಕೊಳ್ಳಿ.`);
  }

  const isDrip = params.irrigationType.toLowerCase().includes('drip');
  const isRainfed = params.irrigationType.toLowerCase() === 'rainfed';
  const isSandy = params.soilType.toLowerCase().includes('sandy');
  const isBlack = params.soilType.toLowerCase().includes('black');

  // Duration adjustment: rainfed or sandy soils slightly tighten/shift irrigation notes, winter/Rabi adds slight maturity buffer
  const rabiOffset = params.season.toLowerCase().includes('rabi') ? 4 : 0;

  const tasks = stages.map((st) => {
    const startOffset = st.day_start > 15 ? st.day_start + rabiOffset : st.day_start;
    const endOffset = st.day_end > 15 ? st.day_end + rabiOffset : st.day_end;

    let descEn = st.instructions_en;
    let descKn = st.instructions_kn;

    if (st.stage_key === 'irrigation') {
      if (isDrip) {
        descEn += ' [Drip Mode]: Operate drip 45–60 min/day based on evapotranspiration and apply soluble nutrients via venturi.';
        descKn += ' [ಹನಿ ನೀರಾವರಿ]: ಆವಿಯಾಗುವಿಕೆ ಆಧರಿಸಿ ದಿನಕ್ಕೆ 45–60 ನಿಮಿಷ ಹನಿ ನೀರಾವರಿ ನೀಡಿ.';
      } else if (isRainfed) {
        descEn += ' [Rainfed Mode]: Focus on dead furrows, blade hoe dust mulching, and Krishi Honda life-saving irrigation during >15-day dry spells.';
        descKn += ' [ಮಳೆಯಾಶ್ರಿತ]: ಕುಂಟೆ ಮಲ್ಚಿಂಗ್ ಮಾಡಿ ಮಣ್ಣಿನ ತೇವಾಂಶ ಉಳಿಸಿ; 15 ದಿನ ಮಳೆ ಇಲ್ಲದಿದ್ದರೆ ಕೃಷಿ ಹೊಂಡದ ರಕ್ಷಣಾತ್ಮಕ ನೀರು ಕೊಡಿ.';
      }
      if (isSandy) {
        descEn += ' Sandy loam drains faster — prefer shorter, more frequent cycles.';
        descKn += ' ಮರಳು ಮಿಶ್ರಿತ ಮಣ್ಣಿನಲ್ಲಿ ನೀರು ಬೇಗ ಇಂಗುವುದರಿಂದ ಕಡಿಮೆ ಪ್ರಮಾಣದಲ್ಲಿ ಸ್ವಲ್ಪ ಹೆಚ್ಚಾಗಿ ನೀರು ಕೊಡಿ.';
      } else if (isBlack) {
        descEn += ' Black soil retains moisture longer — avoid over-irrigation and waterlogging.';
        descKn += ' ಕಪ್ಪು ಮಣ್ಣು ತೇವಾಂಶ ಹೆಚ್ಚು ಹಿಡಿದಿಡುತ್ತದೆ — ಹೆಚ್ಚುವರಿ ನೀರು ನಿಲ್ಲದಂತೆ ಎಚ್ಚರ ವಹಿಸಿ.';
      }
    }

    if (st.stage_key === 'sowing') {
      descEn += ` (Selected variety: ${params.variety} · Location: ${params.taluk}, ${params.district}).`;
      descKn += ` (ತಳಿ: ${params.variety} · ಸ್ಥಳ: ${params.taluk}, ${params.district}).`;
    }

    return {
      stage_number: st.stage_number,
      stage_key: st.stage_key,
      title_en: st.title_en,
      title_kn: st.title_kn,
      description_en: descEn,
      description_kn: descKn,
      inputs_en: st.inputs_en,
      inputs_kn: st.inputs_kn,
      due_date: addDays(params.sowingDate, startOffset),
      end_date: addDays(params.sowingDate, endOffset),
      source_institution: params.crop.source_institution,
    };
  });

  return {
    data_coverage: limitationsEn.length === 0 ? 'verified' : 'partial_adaptation',
    limitation_note_en: limitationsEn.join(' '),
    limitation_note_kn: limitationsKn.join(' '),
    tasks,
  };
}
