import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import { Phone, Users, Bell, Shield, MapPin, TriangleAlert as AlertTriangle } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface OnboardingScreenProps {
  onComplete: () => void;
}

const { width } = Dimensions.get('window');

const onboardingData = [
  {
    id: 1,
    icon: Phone,
    title: 'Emergency Contacts',
    description: 'Quick access to local emergency services, hospitals, and fire stations in Leyte.',
    color: 'text-emergency-600',
    bgColor: 'bg-emergency-50',
  },
  {
    id: 2,
    icon: Bell,
    title: 'Real-time Alerts',
    description: 'Receive instant notifications about disasters, weather warnings, and community emergencies.',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
  },
  {
    id: 3,
    icon: MapPin,
    title: 'Location Sharing',
    description: 'Share your location with emergency responders and family members during critical situations.',
    color: 'text-safety-600',
    bgColor: 'bg-safety-50',
  },
  {
    id: 4,
    icon: Users,
    title: 'Community Network',
    description: 'Connect with local emergency responders and community volunteers in Leyte.',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
];

function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  const handleNext = useCallback(() => {
    if (currentPage < onboardingData.length - 1) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      scrollViewRef.current?.scrollTo({ x: nextPage * width, y: 0, animated: true });
    } else {
      onComplete();
    }
  }, [currentPage, onComplete]);

  const handleSkip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row justify-between items-center px-6 pt-12 pb-4">
        <Text className="text-2xl font-bold text-gray-900">PinaSafe</Text>
        <TouchableOpacity onPress={handleSkip}>
          <Text className="text-safety-600 font-semibold">Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled
        onMomentumScrollEnd={(e) => {
          const page = Math.round(e.nativeEvent.contentOffset.x / width);
          if (page !== currentPage) setCurrentPage(page);
        }}
        className="flex-1"
      >
        {onboardingData.map((item, index) => (
          <View key={item.id} style={{ width }} className="flex-1 px-6 justify-center">
            <View className="items-center">
              <View className={`${item.bgColor} p-6 rounded-full mb-8`}>
                <item.icon size={60} className={item.color} strokeWidth={1.5} />
              </View>
              
              <Text className="text-3xl font-bold text-gray-900 text-center mb-4">
                {item.title}
              </Text>
              
              <Text className="text-gray-600 text-center text-base leading-6 px-4">
                {item.description}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Page Indicators */}
      <View className="flex-row justify-center py-6">
        {onboardingData.map((_, index) => (
          <View
            key={index}
            className={`w-2 h-2 rounded-full mx-1 ${
              index === currentPage ? 'bg-emergency-600' : 'bg-gray-300'
            }`}
          />
        ))}
      </View>

      {/* Bottom Button */}
      <View className="px-6 pb-8">
        <TouchableOpacity
          onPress={handleNext}
          className="bg-emergency-600 py-4 rounded-xl shadow-sm"
        >
          <Text className="text-white text-center font-semibold text-lg">
            {currentPage === onboardingData.length - 1 ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export default React.memo(OnboardingScreen);