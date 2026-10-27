import en from './locales/en.js?v=3.1.5';

export const strings = en;
export const t = (key, ...args) => {
  const value = strings[key] ?? key;
  return typeof value === 'function' ? value(...args) : value;
};
