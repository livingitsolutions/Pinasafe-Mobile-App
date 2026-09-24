import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const baseConfig = appJson.expo as ExpoConfig;

  return {
    ...config,
    ...baseConfig,
    ios: {
      ...baseConfig.ios,
      ...(googleMapsApiKey
        ? {
            config: {
              ...baseConfig.ios?.config,
              googleMapsApiKey,
            },
          }
        : {}),
    },
    android: {
      ...baseConfig.android,
      ...(googleMapsApiKey
        ? {
            config: {
              ...baseConfig.android?.config,
              googleMaps: {
                ...baseConfig.android?.config?.googleMaps,
                apiKey: googleMapsApiKey,
              },
            },
          }
        : {}),
    },
  };
};
