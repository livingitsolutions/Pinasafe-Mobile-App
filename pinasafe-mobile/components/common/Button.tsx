import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, View } from 'react-native';

interface ButtonProps {
  onPress: () => void;
  title: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  onPress,
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  icon,
}: ButtonProps) {
  const baseClasses = 'rounded-lg flex-row items-center justify-center';

  const variantClasses = {
    primary: 'bg-blue-500',
    secondary: 'bg-gray-500',
    danger: 'bg-red-500',
    success: 'bg-green-500',
  };

  const disabledClasses = disabled || loading ? 'bg-gray-400 opacity-50' : '';

  const sizeClasses = {
    sm: 'px-3 py-2',
    md: 'px-4 py-3',
    lg: 'px-6 py-4',
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      className={`${baseClasses} ${disabledClasses || variantClasses[variant]} ${sizeClasses[size]} ${widthClass}`}
    >
      {loading ? (
        <ActivityIndicator color="white" size="small" />
      ) : (
        <View className="flex-row items-center gap-2">
          {icon}
          <Text className={`text-white font-semibold ${textSizeClasses[size]}`}>
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
