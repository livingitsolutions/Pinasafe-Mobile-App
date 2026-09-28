import { Platform } from 'react-native';

export const isClientRuntime = (
  platform: string = Platform.OS,
  hasBrowserWindow: boolean = typeof window !== 'undefined'
) => platform !== 'web' || hasBrowserWindow;
