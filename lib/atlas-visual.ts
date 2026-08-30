export const CATEGORY_COLOURS = [
  '#35D7FF', '#FF0F0F', '#AF38FF', '#FFFF0F', '#0CC20C', '#0C85C2',
  '#E0A955', '#FF61CA', '#0FFF9F', '#C26D0C', '#4AC29A', '#616BFF',
  '#C24AAA', '#61A0FF', '#B6E00D', '#FF7661', '#FF0FFF', '#FFD561',
  '#61FFF4', '#FF0F7F', '#0CAAC2', '#0FFF0F', '#92C24A', '#D561FF',
  '#E05568', '#31E060', '#55E0C5', '#C2910C', '#D20DE0', '#FF0FBF',
] as const;

export const AGREEMENT_STOPS = ['#3B1B78', '#3156B5', '#00A9B7', '#55D56B', '#FFE34D'] as const;

export function normaliseText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
