import { Platform } from 'react-native';

export const colors = {
  brand: '#B42318', brandDark: '#7A271A', brandSoft: '#FEE4E2',
  ink: '#182230', muted: '#667085', subtle: '#98A2B3',
  canvas: '#F7F7F5', surface: '#FFFFFF', surfaceAlt: '#F2F4F7',
  border: '#E4E7EC', borderStrong: '#D0D5DD',
  success: '#067647', successSoft: '#ECFDF3',
  warning: '#B54708', warningSoft: '#FFFAEB',
  info: '#175CD3', infoSoft: '#EFF8FF',
  critical: '#B42318', criticalSoft: '#FEF3F2', white: '#FFFFFF'
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;
export const type = {
  display: { fontFamily: 'Quicksand-Bold', fontSize: 30, lineHeight: 36 },
  title: { fontFamily: 'Quicksand-Bold', fontSize: 22, lineHeight: 28 },
  heading: { fontFamily: 'Quicksand-SemiBold', fontSize: 17, lineHeight: 24 },
  body: { fontFamily: 'Quicksand-Medium', fontSize: 15, lineHeight: 22 },
  label: { fontFamily: 'Quicksand-SemiBold', fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: 'Quicksand-Medium', fontSize: 12, lineHeight: 16 }
} as const;
export const elevation = Platform.select({ web: { boxShadow: '0 1px 2px rgba(16,24,40,.05)' }, default: { elevation: 1 } });
export const breakpoints = { tablet: 720, desktop: 1040 } as const;
