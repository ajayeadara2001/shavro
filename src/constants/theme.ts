
import { Platform } from 'react-native';

export const colors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F9FAFB',

  primary: '#2563EB',
  primaryLight: '#EFF6FF',

  text: '#111827',
  textSecondary: '#6B7280',

  border: '#E5E7EB',

  success: '#15803D',
  error: '#DC2626',
};

export const typography = {
  fontFamily: Platform.select({
    ios: 'System',
    android: 'Roboto',
    default: 'System',
  }),

  sizes: {
    caption: 12,
    small: 14,
    body: 16,
    subtitle: 18,
    heading: 24,
    amount: 36,
  },

  weights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  } as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  small: 8,
  medium: 12,
  large: 16,
  extraLarge: 20,
};

export const layout = {
  screenPadding: 20,
  minimumTouchTarget: 44,
  buttonHeight: 56,
};
