// Augment the window interface
declare global {
  interface Window {
    gtag?: (command: string, action: string, params?: { [key: string]: any }) => void;
  }
}

export const PHONE_CONVERSION_LABEL = 'AW-670806132/a2rZCIHi-P0aEPTg7r8C';
export const FORM_CONVERSION_LABEL = 'AW-670806132/a2rZCIHi-P0aEPTg7r8C';
export const BOOKING_CONVERSION_LABEL = 'AW-670806132/a2rZCIHi-P0aEPTg7r8C';

export const reportConversion = (
  label: string,
  value = 1.0,
  currency = 'EUR',
  callback?: () => void,
) => {
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'conversion', {
      send_to: label,
      value,
      currency,
      event_callback: callback,
    });
  } else {
    console.warn('Google Ads gtag.js not loaded.');
  }
};
