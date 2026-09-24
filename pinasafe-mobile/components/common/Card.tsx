import React from 'react';
import { View, Text, TouchableOpacity, ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  onPress?: () => void;
  variant?: 'default' | 'outlined' | 'elevated';
  headerRight?: React.ReactNode;
}

export function Card({
  title,
  subtitle,
  children,
  onPress,
  variant = 'default',
  headerRight,
  ...viewProps
}: CardProps) {
  const variantClasses = {
    default: 'bg-white border border-gray-200',
    outlined: 'bg-transparent border-2 border-gray-300',
    elevated: 'bg-white shadow-lg',
  };

  const content = (
    <View
      {...viewProps}
      className={`rounded-lg p-4 ${variantClasses[variant]} ${viewProps.className || ''}`}
    >
      {(title || subtitle || headerRight) && (
        <View className="mb-3 flex-row items-center justify-between">
          <View className="flex-1">
            {title && (
              <Text className="text-lg font-bold text-gray-800">{title}</Text>
            )}
            {subtitle && (
              <Text className="text-sm text-gray-600 mt-1">{subtitle}</Text>
            )}
          </View>
          {headerRight && <View>{headerRight}</View>}
        </View>
      )}
      {children}
    </View>
  );

  if (onPress) {
    return <TouchableOpacity onPress={onPress}>{content}</TouchableOpacity>;
  }

  return content;
}
