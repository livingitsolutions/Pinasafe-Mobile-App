import { LinearGradient } from 'expo-linear-gradient';
import { Heart, MapPin, Shield } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { Animated, Image, Text, View } from 'react-native';

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    const animateSequence = Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]);

    animateSequence.start();

    const timer = setTimeout(() => {
      onFinish();
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <LinearGradient
      colors={['#2947ecff', '#4d87f3ff']} // emergency-600 → emergency-700
      className="flex-1 justify-center items-center px-6"
    >
      {/* Logo Section */}
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        }}
        className="items-center mb-8"
      >
        <View className="bg-white/20 p-6 rounded-full mb-6">
          <Image source={require('@/assets/images/onboarding1.2.png')}  
            style={{ width: 160, height: 160 }}   // ✅ instead of size/props
            resizeMode="contain" 
          />
        </View>

        <Animated.Text
          style={{ transform: [{ translateY: slideAnim }] }}
          className="text-4xl font-bold text-white text-center mb-2"
        >
          PinaSafe
        </Animated.Text>

        <Animated.Text
          style={{ transform: [{ translateY: slideAnim }] }}
          className="text-xl text-white/90 text-center mb-8"
        >
          Your Safety, Our Priority
        </Animated.Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
        className="items-center"
      >
        <Text className="text-white/80 text-center text-base mb-6">
          Emergency Response System
        </Text>

        <View className="flex-row gap-x-6">
          <View className="items-center">
            <Heart size={24} color="#fff" strokeWidth={1.5} />
            <Text className="text-white/70 text-xs mt-1">Care</Text>
          </View>
          <View className="items-center">
            <Shield size={24} color="#fff" strokeWidth={1.5} />
            <Text className="text-white/70 text-xs mt-1">Protect</Text>
          </View>
          <View className="items-center">
            <MapPin size={24} color="#fff" strokeWidth={1.5} />
            <Text className="text-white/70 text-xs mt-1">Locate</Text>
          </View>
        </View>
      </Animated.View>

      {/* Footer */}
      <Animated.View
        style={{ opacity: fadeAnim }}
        className="absolute bottom-12"
      >
        <Text className="text-white/60 text-sm">
          Keeping Leyte Safe
        </Text>
      </Animated.View>
    </LinearGradient>
  );
}
