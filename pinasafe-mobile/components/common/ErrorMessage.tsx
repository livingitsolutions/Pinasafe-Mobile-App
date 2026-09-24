import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  fullScreen?: boolean;
}

export function ErrorMessage({
  message,
  onRetry,
  fullScreen = false,
}: ErrorMessageProps) {
  const content = (
    <View className="items-center justify-center p-6">
      <View className="bg-red-50 rounded-lg p-6 items-center">
        <Text className="text-4xl mb-4">⚠️</Text>
        <Text className="text-red-800 text-center font-semibold mb-2">
          Something went wrong
        </Text>
        <Text className="text-red-600 text-center text-sm mb-4">{message}</Text>
        {onRetry && (
          <TouchableOpacity
            onPress={onRetry}
            className="bg-red-500 px-6 py-3 rounded-lg"
          >
            <Text className="text-white font-semibold">Try Again</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (fullScreen) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        {content}
      </View>
    );
  }

  return content;
}
