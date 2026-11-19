import { GoogleGenAI, Type } from '@google/genai';

export class LeafServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 500, code = 'LEAF_ANALYSIS_ERROR') {
    super(message);
    this.name = 'LeafServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface LeafAnalysisInput {
  cropCode: string;
  cropNameEn: string;
  cropNameKn: string;
  imageDataUrl: string;
  fieldNotes?: string;
  district?: string;
  taluk?: string;
  soilType?: string;
  irrigationType?: string;
}

export interface LeafAnalysisResult {
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
    | 'uncertain';
  severity: 'low' | 'moderate' | 'high';
  confidence_level: 'high' | 'medium' | 'low';
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
  model_used: string;
}

const LEAF_MODEL = 'gemini-4-hydrogen';

export function isLeafAiConfigured(): boolean {
  return Boolean((process.env.GEMINI_API_KEY || '').trim());
}

export function parseImageDataUrl(dataUrl: string): { mimeType: string; base64Data: string } {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new LeafServiceError(
      'Please upload a valid JPEG, PNG, or WebP leaf image.',
      400,
      'INVALID_IMAGE_DATA'
    );
  }
  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const base64Data = match[2].replace(/\s+/g, '');
  if (base64Data.length < 32) {
    throw new LeafServiceError('Uploaded image is empty or corrupted.', 400, 'EMPTY_IMAGE');
  }
  if (base64Data.length > 5_500_000) {
    throw new LeafServiceError('Leaf image is too large. Please upload an image under 4 MB.', 413, 'IMAGE_TOO_LARGE');
  }
  return { mimeType, base64Data };
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    condition_name_en: { type: Type.STRING },
    condition_name_kn: { type: Type.STRING },
    category: {
      type: Type.STRING,
      enum: ['fungal', 'bacterial', 'viral', 'pest', 'nutrient_deficiency', 'abiotic_stress', 'healthy', 'uncertain'],
    },
    severity: { type: Type.STRING, enum: ['low', 'moderate', 'high'] },
    confidence_level: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
    confidence_pct: { type: Type.INTEGER },
    confidence_notes_en: { type: Type.STRING },
    confidence_notes_kn: { type: Type.STRING },
    visible_symptoms_en: { type: Type.STRING },
    visible_symptoms_kn: { type: Type.STRING },
    fertilizer_guidance_en: { type: Type.STRING },
    fertilizer_guidance_kn: { type: Type.STRING },
    spray_care_guidance_en: { type: Type.STRING },
    spray_care_guidance_kn: { type: Type.STRING },
    rsk_confirmation_en: { type: Type.STRING },
    rsk_confirmation_kn: { type: Type.STRING },
    recommended_task_title_en: { type: Type.STRING },
    recommended_task_title_kn: { type: Type.STRING },
    recommended_task_description_en: { type: Type.STRING },
    recommended_task_description_kn: { type: Type.STRING },
    recommended_days_offset: { type: Type.INTEGER },
  },
  required: [
    'condition_name_en',
    'condition_name_kn',
    'category',
    'severity',
    'confidence_level',
    'confidence_pct',
    'confidence_notes_en',
    'confidence_notes_kn',
    'visible_symptoms_en',
    'visible_symptoms_kn',
    'fertilizer_guidance_en',
    'fertilizer_guidance_kn',
    'spray_care_guidance_en',
    'spray_care_guidance_kn',
    'rsk_confirmation_en',
    'rsk_confirmation_kn',
    'recommended_task_title_en',
    'recommended_task_title_kn',
    'recommended_task_description_en',
    'recommended_task_description_kn',
    'recommended_days_offset',
  ],
};

export async function analyzeLeafImage(input: LeafAnalysisInput): Promise<LeafAnalysisResult> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new LeafServiceError(
      'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to enable AI leaf diagnosis.',
      503,
      'GEMINI_NOT_CONFIGURED'
    );
  }

  const { mimeType, base64Data } = parseImageDataUrl(input.imageDataUrl);

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const systemInstruction = [
    'You are a Karnataka agricultural plant pathology and crop nutrition extension advisor supporting farmers in English and Kannada.',
    'Analyze the uploaded crop leaf photo carefully alongside the crop type, Karnataka district/taluk context, and optional field notes.',
    'Rules:',
    '1. Be honest about uncertainty. If the photo is blurry, poorly lit, shows no leaf, or symptoms overlap between a disease and a nutrient deficiency, set confidence_level to "low" or "medium", lower confidence_pct accordingly, and explain lookalikes or photo limitations clearly in confidence_notes_en and confidence_notes_kn.',
    '2. Describe only visible symptoms actually observable in the image (spot color, concentric rings, margin scorching, interveinal chlorosis, mosaic, powdery coating, pest mines, or healthy green lamina).',
    '3. Provide practical, safe fertilizer / soil nutrition guidance (e.g., balanced NPK, potash, gypsum, zinc sulphate, magnesium sulphate, boron, organic compost/neem cake) with general application care and dosage ranges.',
    '4. Provide practical cultural & spray care guidance (removing severely infected leaves, avoiding overhead irrigation, calm morning/evening spraying, bio-agents like Trichoderma or neem oil, or general fungicide/bactericide class care).',
    '5. In rsk_confirmation_en and rsk_confirmation_kn, ALWAYS remind the farmer to confirm exact chemical name, dosage per litre of water, and waiting period with their local Raitha Samparka Kendra (RSK) or Agriculture Officer before spraying.',
    '6. Ensure ALL Kannada fields are natural, farmer-friendly Kannada (not transliterated English).',
    '7. Provide a concise, actionable recommended_task_title_* and recommended_task_description_* suitable for adding directly to the farmer crop calendar (recommended_days_offset between 0 and 7).',
  ].join('\n');

  const userPrompt = [
    `Selected Crop: ${input.cropNameEn} (${input.cropNameKn}) [code: ${input.cropCode}]`,
    `Location: ${input.taluk || 'Sira'}, ${input.district || 'Tumakuru'}, Karnataka`,
    `Soil & Irrigation: ${input.soilType || 'Red Sandy Loam'}, ${input.irrigationType || 'Rainfed'}`,
    `Farmer Field Notes: ${input.fieldNotes?.trim() ? input.fieldNotes.trim() : 'None provided'}`,
    'Diagnose the most likely leaf disease, pest damage, or nutrient deficiency (or confirm if healthy/uncertain) and return structured JSON matching the schema.',
  ].join('\n');

  try {
    const response = await ai.models.generateContent({
      model: LEAF_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          { text: userPrompt },
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      throw new LeafServiceError('Empty diagnosis received from Gemini model.', 502, 'EMPTY_MODEL_RESPONSE');
    }

    const parsed = JSON.parse(rawText) as Omit<LeafAnalysisResult, 'model_used'>;
    const clampedPct = Math.max(0, Math.min(100, Math.round(Number(parsed.confidence_pct) || 50)));
    const clampedOffset = Math.max(0, Math.min(14, Math.round(Number(parsed.recommended_days_offset) || 1)));

    return {
      ...parsed,
      confidence_pct: clampedPct,
      recommended_days_offset: clampedOffset,
      model_used: LEAF_MODEL,
    };
  } catch (err) {
    if (err instanceof LeafServiceError) throw err;
    const msg = err instanceof Error ? err.message : 'Leaf diagnosis failed';
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
      throw new LeafServiceError(
        'Gemini API quota limit reached right now. Please wait a moment and try again.',
        429,
        'GEMINI_RATE_LIMITED'
      );
    }
    if (/403|PERMISSION_DENIED|API_KEY_INVALID|API key not valid/i.test(msg)) {
      throw new LeafServiceError(
        'Server Gemini API key was rejected. Check GEMINI_API_KEY in Settings > Secrets.',
        503,
        'GEMINI_AUTH_ERROR'
      );
    }
    throw new LeafServiceError(`Unable to analyze leaf image: ${msg}`, 502, 'GEMINI_UPSTREAM_ERROR');
  }
}
