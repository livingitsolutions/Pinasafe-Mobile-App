import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme/tokens';

export function useTabBarPresentation() {
  const insets = useSafeAreaInsets();
  return {
    tabBarActiveTintColor: colors.brand,
    tabBarInactiveTintColor: colors.muted,
    tabBarActiveBackgroundColor: colors.brandSoft,
    tabBarLabelStyle: { fontFamily: 'Quicksand-SemiBold', fontSize: 12 },
    tabBarStyle: {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      borderTopWidth: 1,
      height: 64 + insets.bottom,
      paddingTop: 4,
      paddingBottom: 8 + insets.bottom,
    },
  };
}
