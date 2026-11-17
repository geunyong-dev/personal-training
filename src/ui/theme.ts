// 헬스장 조명 아래에서도 잘 보이도록 다크 테마 고정
export const C = {
  bg: '#0E0F12',
  surface: '#17191E',
  surface2: '#22252C',
  border: '#2C3038',
  text: '#F4F5F7',
  textDim: '#9BA1AC',
  textFaint: '#666C77',
  accent: '#C8F560', // 라임
  accentInk: '#10140A',
  danger: '#FF6B6B',
  warn: '#FFB547',
  good: '#4ADE80',
  info: '#7AA2FF',
} as const;

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const R = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const T = {
  hero: { fontSize: 56, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },
  h1: { fontSize: 26, fontWeight: '700' as const },
  h2: { fontSize: 20, fontWeight: '700' as const },
  h3: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  num: { fontVariant: ['tabular-nums' as const] },
};
