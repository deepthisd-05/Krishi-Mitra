import type { Lang } from '../i18n/translations';

export interface CameraErrorInfo {
  code: 'permission_denied' | 'unsupported' | 'no_camera' | 'camera_busy' | 'unknown';
  title: string;
  message: string;
  suggestUpload: boolean;
  suggestOpenTab: boolean;
}

export function isEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function isLiveCameraSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

export function stopMediaStream(stream: { getTracks?: () => Array<{ stop: () => void }> } | null | undefined): void {
  if (!stream || typeof stream.getTracks !== 'function') return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Ignore track stop errors during teardown
    }
  }
}

export function describeCameraError(err: unknown, lang: Lang, inIframe: boolean): CameraErrorInfo {
  const errName =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'name' in err
      ? String((err as { name?: unknown }).name || '')
      : '';
  const errMessage =
    typeof err === 'string'
      ? err
      : err instanceof Error
      ? err.message
      : '';

  const combined = `${errName} ${errMessage}`.toLowerCase();
  const isKn = lang === 'kn';

  if (
    combined.includes('unsupported') ||
    combined.includes('not implemented') ||
    combined.includes('mediadevices')
  ) {
    return {
      code: 'unsupported',
      title: isKn ? 'ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಲೈವ್ ಕ್ಯಾಮೆರಾ ಲಭ್ಯವಿಲ್ಲ' : 'Live camera preview is unavailable here',
      message: isKn
        ? inIframe
          ? 'ಈ ಎಂಬೆಡೆಡ್ ಪೂರ್ವವೀಕ್ಷಣೆ ಫ್ರೇಮ್ ಅಥವಾ ಬ್ರೌಸರ್ ಲೈವ್ ಕ್ಯಾಮೆರಾ ವೀಕ್ಷಣೆಯನ್ನು ಬೆಂಬಲಿಸುವುದಿಲ್ಲ. ದಯವಿಟ್ಟು "ಫೋಟೋ ಅಪ್‌ಲೋಡ್" ಬಳಸಿ ಅಥವಾ ಹೊಸ ಟ್ಯಾಬ್‌ನಲ್ಲಿ ತೆರೆಯಿರಿ.'
          : 'This browser does not support in-page live camera capture. Please use "Upload Photo" or "Camera Photo" to pick an image.'
        : inIframe
        ? 'Live camera viewfinder is unavailable inside this embedded preview or browser context. Use "Upload Photo" instead, or open Krishi Mitra in a standalone tab.'
        : 'This browser does not support in-page live camera capture. Please use "Upload Photo" or "Camera Photo" instead.',
      suggestUpload: true,
      suggestOpenTab: inIframe,
    };
  }

  if (
    combined.includes('notallowed') ||
    combined.includes('permissiondenied') ||
    combined.includes('permission denied') ||
    combined.includes('securityerror')
  ) {
    return {
      code: 'permission_denied',
      title: isKn
        ? inIframe
          ? 'ಎಂಬೆಡೆಡ್ ಫ್ರೇಮ್‌ನಲ್ಲಿ ಕ್ಯಾಮೆರಾ ಅನುಮತಿ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ'
          : 'ಕ್ಯಾಮೆರಾ ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ'
        : inIframe
        ? 'Camera access is blocked in embedded preview'
        : 'Camera permission was denied',
      message: isKn
        ? inIframe
          ? 'ಈ ಎಂಬೆಡೆಡ್ ಪೂರ್ವವೀಕ್ಷಣೆ ಫ್ರೇಮ್‌ನಲ್ಲಿ ಕ್ಯಾಮೆರಾ ಅನುಮತಿ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ. ದಯವಿಟ್ಟು "ಫೋಟೋ ಅಪ್‌ಲೋಡ್" ಬಳಸಿ ಎಲೆಯ ಚಿತ್ರವನ್ನು ಆಯ್ಕೆಮಾಡಿ ಅಥವಾ ಸ್ವತಂತ್ರ ಟ್ಯಾಬ್‌ನಲ್ಲಿ ತೆರೆಯಿರಿ.'
          : 'ಬ್ರೌಸರ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಕ್ಯಾಮೆರಾ ಅನುಮತಿ ನೀಡಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ, ಅಥವಾ ಕೆಳಗಿನ "ಫೋಟೋ ಅಪ್‌ಲೋಡ್" ಆಯ್ಕೆಯನ್ನು ಬಳಸಿ.'
        : inIframe
        ? 'Live camera access is blocked inside this embedded preview iframe. Use "Upload Photo" below or open Krishi Mitra in a standalone tab to grant camera permission.'
        : 'Camera permission was denied in your browser. Allow camera access in site settings and retry, or use "Upload Photo" instead.',
      suggestUpload: true,
      suggestOpenTab: true,
    };
  }

  if (combined.includes('notfound') || combined.includes('devicesnotfound')) {
    return {
      code: 'no_camera',
      title: isKn ? 'ಕ್ಯಾಮೆರಾ ಕಂಡುಬಂದಿಲ್ಲ' : 'No camera detected on this device',
      message: isKn
        ? 'ಈ ಸಾಧನದಲ್ಲಿ ಬಳಸಬಹುದಾದ ಕ್ಯಾಮೆರಾ ಪತ್ತೆಯಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು "ಫೋಟೋ ಅಪ್‌ಲೋಡ್" ಮೂಲಕ ಎಲೆಯ ಫೋಟೋ ಸೇರಿಸಿ.'
        : 'No usable rear or built-in camera was found on this device. Please use "Upload Photo" to select a leaf image from your files.',
      suggestUpload: true,
      suggestOpenTab: false,
    };
  }

  if (combined.includes('notreadable') || combined.includes('trackstart')) {
    return {
      code: 'camera_busy',
      title: isKn ? 'ಕ್ಯಾಮೆರಾ ಬೇರೊಂದು ಆ್ಯಪ್‌ನಲ್ಲಿ ಬಳಕೆಯಲ್ಲಿದೆ' : 'Camera is busy in another application',
      message: isKn
        ? 'ಬೇರೊಂದು ಆ್ಯಪ್ ಕ್ಯಾಮೆರಾವನ್ನು ಬಳಸುತ್ತಿರುವುದರಿಂದ ಲೈವ್ ವೀಕ್ಷಣೆ ತೆರೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಅದನ್ನು ಮುಚ್ಚಿ ಮರುಪ್ರಯತ್ನಿಸಿ ಅಥವಾ "ಫೋಟೋ ಅಪ್‌ಲೋಡ್" ಬಳಸಿ.'
        : 'Another app or tab is currently using the camera. Close it and try again, or use "Upload Photo" instead.',
      suggestUpload: true,
      suggestOpenTab: false,
    };
  }

  return {
    code: 'unknown',
    title: isKn ? 'ಲೈವ್ ಕ್ಯಾಮೆರಾ ತೆರೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ' : 'Unable to start live camera',
    message: isKn
      ? 'ಲೈವ್ ಕ್ಯಾಮೆರಾ ಪ್ರಾರಂಭಿಸುವಲ್ಲಿ ತೊಂದರೆಯಾಗಿದೆ. ನೀವು "ಫೋಟೋ ಅಪ್‌ಲೋಡ್" ಅಥವಾ "ಕ್ಯಾಮೆರಾ ಫೋಟೋ" ಬಳಸಬಹುದು.'
      : 'Could not open the live camera stream right now. You can use "Upload Photo" or open in a standalone tab.',
    suggestUpload: true,
    suggestOpenTab: inIframe,
  };
}
