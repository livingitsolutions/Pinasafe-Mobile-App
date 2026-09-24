import React, { useState } from 'react';
import { View, TextInput, Text, TouchableOpacity, TextInputProps } from 'react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onRightIconPress?: () => void;
}

export function Input({
  label,
  error,
  helperText,
  icon,
  rightIcon,
  onRightIconPress,
  ...textInputProps
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);

  const borderColor = error
    ? 'border-red-500'
    : isFocused
    ? 'border-blue-500'
    : 'border-gray-300';

  return (
    <View className="mb-4">
      {label && (
        <Text className="text-sm font-semibold mb-2 text-gray-700">{label}</Text>
      )}
      <View
        className={`flex-row items-center border rounded-lg px-4 py-3 bg-white ${borderColor}`}
      >
        {icon && <View className="mr-2">{icon}</View>}
        <TextInput
          {...textInputProps}
          onFocus={(e) => {
            setIsFocused(true);
            textInputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            textInputProps.onBlur?.(e);
          }}
          className="flex-1 text-gray-800"
          placeholderTextColor="#9CA3AF"
        />
        {rightIcon && (
          <TouchableOpacity onPress={onRightIconPress} className="ml-2">
            {rightIcon}
          </TouchableOpacity>
        )}
      </View>
      {error && <Text className="text-xs text-red-500 mt-1">{error}</Text>}
      {helperText && !error && (
        <Text className="text-xs text-gray-500 mt-1">{helperText}</Text>
      )}
    </View>
  );
}
