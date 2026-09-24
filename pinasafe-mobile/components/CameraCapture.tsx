import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as Location from "expo-location";
import { X, RotateCcw, Camera as CameraIcon } from "lucide-react-native";
import { aiClassificationService, ClassificationResult, EmergencyEvidence } from "@/hooks/AIClassificationService";

const { height } = Dimensions.get("window");

interface CameraCaptureProps {
  onAutoSubmit: (evidence: EmergencyEvidence, classification: ClassificationResult) => void;
  onReject: () => void; 
  onCancel: () => void;
}

export default function CameraCapture({
  onAutoSubmit,
  onReject,
  onCancel,
}: CameraCaptureProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [isProcessing, setIsProcessing] = useState(false);

  /** ✅ Ask for camera permission on mount */
  useEffect(() => {
    (async () => {
      if (!permission?.granted) await requestPermission();
    })();
  }, [permission]);

  /** ✅ Resize + compress image → 500x500, 100% quality */
  const compressImage = async (uri: string) => {
    return await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 500, height: 500 } }],
      { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
    );
  };

  const takePicture = async () => {
    if (!cameraRef.current || isProcessing) return;

    try {
      setIsProcessing(true);

      /** ✅ Take raw image */
      const rawPhoto = await cameraRef.current.takePictureAsync({
        quality: 1,
      });

      if (!rawPhoto?.uri) throw new Error("Failed to capture image.");

      /** ✅ Compress */
      const compressed = await compressImage(rawPhoto.uri);

      /** ✅ Get user location (best effort) */
      let coords = null;
      let address = null;
      let place = null;

      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === "granted") {
          const pos = await Location.getCurrentPositionAsync({});
          coords = pos.coords;

          const places = await Location.reverseGeocodeAsync({
            latitude: coords.latitude,
            longitude: coords.longitude,
          });

          if (places?.length > 0) {
            place = places[0];
            address = [place.name, place.street, place.city, place.region, place.country]
              .filter(Boolean)
              .join(", ");
          }
        }
      } catch {
        console.warn("Location fetch failed.");
      }

      const evidence: EmergencyEvidence = {
        photos: [compressed.uri],
        timestamp: new Date().toISOString(),
        location: coords,
        address,
      };

      /** ✅ AI Classification */
      const cls = await aiClassificationService.classifyImage(compressed.uri);

      const label = cls.label?.toLowerCase();
      const confidence = Math.round((cls.confidence ?? 0) * 100);

      const Labeltitle = label === "fire" ? "Fire Incident" : "Road Accident";

      /** ✅ Build beautiful alert header */
      const alertTitle = `🔥 AI Result: ${Labeltitle ?? "Unknown"}`;
      const alertMsg =
        `\n• Incident Description: ${cls.caption ?? "No caption"}\n\n` +
        `• Confidence Level: ${confidence}%\n\n`;

      /** ✅ Only allow FIRE and ROAD */
      const allowed = ["fire", "road"];     

      

      if (cls.action === "accept" && cls.status === "valid" && allowed.includes(label)) {

        const isInLeyte  =
              
              (place?.region?.toLowerCase().includes("leyte") ||
              place?.region?.toLowerCase().includes("eastern visayas")
            );

          if (!isInLeyte) {
            Alert.alert(
              "Incident Captured Rejected!!!",
              alertMsg +
                "⚠️ This incident must be captured within Leyte.",
              [{ text: "Retake", onPress: onReject }]
            );

            return onReject();
          }
        // ✅ Auto-submit
        // onAutoSubmit(evidence, cls);
        Alert.alert(
          alertTitle,
          alertMsg,
          [
            {
              text: "OK",
              onPress: () => {
                onAutoSubmit(evidence, cls);
              },
            },
          ]
        );
        return;
        
      }

      /** ❌ Uncertain OR invalid OR wrong label -> Reject */
      Alert.alert(
        "Incident Captured Rejected!!!",
        alertMsg +
          "⚠️ Please retake a clear photo of the incident.\n\n(Only fire or road accidents are recognized)",
        [{ text: "Retake", onPress: onReject }]
      );

      onReject();
      return;
    } catch (err) {
      console.error(err);

      Alert.alert(
        "Capture Error",
        "Something went wrong while capturing the image.\n\nPlease try again.",
        [{ text: "OK", onPress: onReject }]
      );

      onReject();
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleFacing = () => {
    setFacing((prev) => (prev === "back" ? "front" : "back"));
  };

  if (!permission?.granted) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "black",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ color: "white", marginBottom: 12 }}>
          Camera permission is required.
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          style={{
            backgroundColor: "#dc2626",
            padding: 12,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      {/* ✅ Live Camera */}
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing={facing} />

      {/* ✅ Top Controls */}
      <View
        style={{
          position: "absolute",
          top: 40,
          width: "100%",
          paddingHorizontal: 20,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        {/* Close */}
        <TouchableOpacity
          onPress={onCancel}
          style={{
            padding: 10,
            borderRadius: 50,
            backgroundColor: "rgba(0,0,0,0.4)",
          }}
        >
          <X size={22} color="white" strokeWidth={1.5} />
        </TouchableOpacity>

        {/* Flip Camera */}
        <TouchableOpacity
          onPress={toggleFacing}
          style={{
            padding: 10,
            borderRadius: 50,
            backgroundColor: "rgba(0,0,0,0.4)",
          }}
        >
          <RotateCcw size={22} color="white" strokeWidth={1.5} />
        </TouchableOpacity>
      </View>

      {/* ✅ Capture Button + Processing Indicator */}
      <View
        style={{
          position: "absolute",
          bottom: 40,
          width: "100%",
          alignItems: "center",
        }}
      >
        {isProcessing && (
          <View
            style={{
              backgroundColor: "rgba(255,255,255,0.15)",
              padding: 16,
              borderRadius: 12,
              marginBottom: 16,
            }}
          >
            <ActivityIndicator size="large" color="#fff" />
            <Text style={{ color: "white", marginTop: 8 }}>Analyzing image…</Text>
          </View>
        )}

        {/* SHUTTER BUTTON */}
        <TouchableOpacity
          onPress={takePicture}
          disabled={isProcessing}
          style={{
            width: 90,
            height: 90,
            borderRadius: 50,
            backgroundColor: isProcessing ? "#888" : "white",
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 5,
            borderColor: isProcessing ? "#555" : "#dc2626",
          }}
        >
          <CameraIcon
            size={30}
            color={isProcessing ? "#333" : "#dc2626"}
            strokeWidth={1.6}
          />
        </TouchableOpacity>

        <Text style={{ color: "white", marginTop: 14 }}>
          Take one clear photo — AI will auto-submit
        </Text>
      </View>
    </View>
  );
}

// import React, { useState, useRef, useEffect } from 'react';
// import { View, Text, TouchableOpacity, Alert, Dimensions, ScrollView , Image } from 'react-native';
// import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
// import { Camera, RotateCcw, Check, X, Loader } from 'lucide-react-native';
// import { aiClassificationService, ClassificationResult, EmergencyEvidence } from '@/hooks/AIClassificationService';

// import * as Location from 'expo-location';

// interface EmergencyCameraCaptureProps {
//   onEvidenceCollected: (evidence: EmergencyEvidence, classification: ClassificationResult) => void;
//   onCancel: () => void;
// }

// const { width, height } = Dimensions.get('window');

// export default function EmergencyCameraCapture({ onEvidenceCollected, onCancel }: EmergencyCameraCaptureProps) {
//   const [permission, requestPermission] = useCameraPermissions();
//   const [facing, setFacing] = useState<CameraType>('back');
//   const [photos, setPhotos] = useState<string[]>([]);
//   const [isProcessing, setIsProcessing] = useState(false);
//   const [classification, setClassification] = useState<ClassificationResult | null>(null);
//   const [needsManualEvidence, setNeedsManualEvidence] = useState(false);

//   const cameraRef = useRef<CameraView>(null);

//   useEffect(() => {
//     requestPermissions();
//   }, []);

//   const requestPermissions = async () => {
//     if (!permission?.granted) {
//       await requestPermission();
//     }
//   };

//   const takePicture = async () => {
//     if (!cameraRef.current || photos.length >= 5) return;

//     try {
//       const photo = await cameraRef.current.takePictureAsync({
//         quality: 0.8,
//         base64: false,
       
//       });

//       if (photo) {
//         const newPhotos = [...photos, photo.uri];
//         setPhotos(newPhotos);


//         // If this is the first photo, try AI classification
//         if (newPhotos.length === 1) {

//           try {
//             const { status } = await Location.requestForegroundPermissionsAsync();
//             if (status !== "granted") {
//               console.warn("Permission to access location was denied");
//               return;
//             }

//             const currentLocation = await Location.getCurrentPositionAsync({});
//             console.log("Coords:", currentLocation.coords);

//             const places = await Location.reverseGeocodeAsync({
//               latitude: currentLocation.coords.latitude,
//               longitude: currentLocation.coords.longitude,
//             });

//             let address: string | undefined;

//             if (places && places.length > 0) {
//               const place = places[0];
//               const address = [
//                 place.name,
//                 place.street,
//                 place.city,
//                 place.region,
//                 place.country,
//               ]
//                 .filter(Boolean)
//                 .join(", ");

//               console.log("Address:", address);
//             }
//           } catch (err) {
//             console.warn("Could not fetch location:", err);
//           }


//           await performAIClassification(photo.uri);
//         }

//         // Check if we have enough evidence
//         if (needsManualEvidence && newPhotos.length >= 5) {
//           await finalizeEvidence(newPhotos);
//         } else if (!needsManualEvidence && newPhotos.length >= 1) {
//           await finalizeEvidence(newPhotos);
//         }
//       }
//     } catch (error) {
//       Alert.alert('Error', 'Failed to take picture');
//     }
//   };

//   const performAIClassification = async (imageUri: string) => {
//     setIsProcessing(true);
//     try {
//       const result = await aiClassificationService.classifyImage(imageUri);
//       setClassification(result);

//       if (result.action === 'reject') {
//         if(result.reason === 'Likely fake photo') {
//           setNeedsManualEvidence(true);
//           Alert.alert(
//             'Manual Verification Required',
//             `AI Result: ${result.caption}\n\nReason: ${result.reason}\n\nPlease provide additional evidence:\n• Take 5 photos from different angles\n\nThis will help responders better understand the situation.`,
//             [{ text: 'Continue', style: 'default' }]
//           );
//         }
//         Alert.alert(
//           'Report Rejected',
//           `AI Classification: ${result.caption}\n\nReason: ${result.reason}\n\nThis does not appear to be a valid emergency. Please review the situation and try again if necessary.`,
//           [
//             { text: 'Cancel Report', onPress: onCancel, style: 'destructive' },
//             { text: 'Try Again', onPress: () => {
//               setClassification(null)
//               setPhotos([]);
//             }, style: 'default' }
//           ]
//         );
//       // } else if (result.action === 'uncertain' || result.requiresManualVerification) {
//       //   setNeedsManualEvidence(true);
//       //   Alert.alert(
//       //     'Manual Verification Required',
//       //     `AI Result: ${result.caption}\n\nReason: ${result.reason}\n\nPlease provide additional evidence:\n• Take 5 photos from different angles\n\nThis will help responders better understand the situation.`,
//       //     [{ text: 'Continue', style: 'default' }]
//       //   );
//       } else if (result.action === 'accept' && result.status === 'valid') {
//         Alert.alert(
//           'Emergency Classified',
//           `${aiClassificationService.formatClassificationForDisplay(result)}\n\n${result.caption}\n\nConfidence: ${Math.round(result.confidence * 100)}%`,
//           [{ text: 'Continue', style: 'default' }]
//         );
//       }
//     } catch (error) {
//       Alert.alert('Classification Error', 'AI classification failed. Please provide manual evidence.');
//       setNeedsManualEvidence(true);
//     } finally {
//       setIsProcessing(false);
//     }
//   };

//   const finalizeEvidence = async (photoUris: string[]) => {
//     if (!classification) return;

//     let coords: { latitude: number; longitude: number } | undefined;
//     let address: string | undefined;

//     try {
//       const currentLocation = await Location.getCurrentPositionAsync({});
//       coords = currentLocation.coords;

//       // 📍 Reverse geocode into human-readable address
//       const places = await Location.reverseGeocodeAsync({
//         latitude: coords.latitude,
//         longitude: coords.longitude,
//       });

//       if (places.length > 0) {
//         const place = places[0];
//         address = [
//           place.name,
//           place.street,
//           place.city,
//           place.region,
//           place.country,
//         ]
//           .filter(Boolean)
//           .join(", ");
//       }
//     } catch (err) {
//       console.warn("Could not get location:", err);
//     }

//     const evidence: EmergencyEvidence = {
//       photos: photoUris,
//       timestamp: new Date().toISOString(),
//       location: coords ?? null,
//       address: address ?? null,
//     };

//     onEvidenceCollected(evidence, classification);
//   };

//   const retakeEvidence = () => {
//       Alert.alert(
//         "Retake Supporting Photos",
//         "Do you want to discard the supporting photos and retake them? The first photo will be kept.",
//         [
//           { text: "Cancel", style: "cancel" },
//           {
//             text: "Retake",
//             style: "destructive",
//             onPress: () => {
//               if (photos.length > 0) {
//                 // Keep only the first photo
//                 setPhotos([photos[0]]);
//                 // Keep classification (based on the first photo)
//               }
//             },
//           },
//         ]
//       );
//   };

//   const toggleCameraFacing = () => {
//     setFacing(current => (current === 'back' ? 'front' : 'back'));
//   };

//   if (!permission) {
//     return <View className="flex-1 bg-black" />;
//   }

//   if (!permission?.granted) {
//     return (
//       <View className="flex-1 justify-center items-center bg-black">
//         <Text className="text-white text-center mb-4">
//           Camera permission is required for emergency reporting
//         </Text>
//         <TouchableOpacity onPress={requestPermissions} className="bg-red-600 px-6 py-3 rounded-lg">
//           <Text className="text-white font-semibold">Grant Permission</Text>
//         </TouchableOpacity>
//       </View>
//     );
//   }

//   return (
//     <View className="flex-1 bg-black">

//         {photos.length < 5 ? (
//         <>
//           <CameraView
//             ref={cameraRef}
//             style={{ flex: 1 }}
//             facing={facing}
//           />

//           {/* Header */}
//           <View className="absolute top-12 left-0 right-0 px-6">
//             <View className="flex-row justify-between items-center">
//               <TouchableOpacity onPress={onCancel} className="bg-black/50 p-3 rounded-full">
//                 <X size={24} color="#FFFFFF" strokeWidth={1.5} />
//               </TouchableOpacity>

//               <View className="bg-black/50 px-4 py-2 rounded-full">
//                 <Text className="text-white font-semibold">
//                   {needsManualEvidence ? `${photos.length}/5 Photos` : 'Emergency Report'}
//                 </Text>
//               </View>

//               <TouchableOpacity onPress={toggleCameraFacing} className="bg-black/50 p-3 rounded-full">
//                 <RotateCcw size={24} color="#FFFFFF" strokeWidth={1.5} />
//               </TouchableOpacity>
//             </View>
//           </View>

//           {/* Classification Status */}
//           {classification && (
//             <View className="absolute top-24 left-6 right-6 mt-16">
//               <View className={`p-4 rounded-lg border-2 ${
//                 classification.action === 'accept' && classification.status === 'valid'
//                   ? 'bg-green-500/90 border-green-400'
//                   : classification.action === 'reject'
//                   ? 'bg-red-500/90 border-red-400'
//                   : classification.action === 'uncertain' || classification.reason === 'Likely fake photo'
//                   ? 'bg-amber-500/90 border-amber-400'
//                   : 'bg-gray-500/90 border-gray-400'
//               }`}>
//                 <Text className="text-white font-semibold mb-1">
//                   {classification.action === 'accept' && classification.status === 'valid'
//                     ? 'AI Classification Complete'
//                     : classification.action === 'reject'
//                     ? 'Report Rejected'
//                     : classification.action === 'uncertain' || classification.reason === 'Likely fake photo'
//                     ? 'Manual Verification Required'
//                     : 'Classification Failed'}
//                 </Text>
//                 <Text className="text-white text-sm mb-1">{classification.caption}</Text>
//                 <Text className="text-white text-xs opacity-90">{classification.reason}</Text>
//                 <Text className="text-white text-xs mt-1">
//                   Confidence: {Math.round(classification.confidence * 100)}% | Status: {classification.action}
//                 </Text>
//               </View>
//             </View>
//           )}

//           {/* Processing Indicator */}
//           {isProcessing && (
//             <View className="absolute inset-0 bg-black/50 justify-center items-center">
//               <View className="bg-white p-6 rounded-lg items-center">
//                 <Loader size={32} color="#DC2626" strokeWidth={1.5} />
//                 <Text className="text-gray-900 font-semibold mt-3">Analyzing Emergency...</Text>
//                 <Text className="text-gray-600 text-sm mt-1">AI is classifying the situation</Text>
//               </View>
//             </View>
//           )}

//           {/* Bottom Controls */}
//           <View className="absolute bottom-12 left-0 right-0 px-6">
//             <View className="flex-row justify-center items-center gap-x-8">
//               {/* Photo Count */}
//               <View className="bg-black/50 px-3 py-2 rounded-full">
//                 <Text className="text-white text-sm">{photos.length} photos</Text>
//               </View>

//               {/* Capture Button */}
//               <TouchableOpacity
//                 onPress={takePicture}
//                 disabled={isProcessing || photos.length >= 5}
//                 className={`w-20 h-20 rounded-full justify-center items-center border-4 ${
//                   photos.length >= 5
//                     ? 'bg-gray-400 border-gray-500'
//                     : 'bg-white border-red-600'
//                 }`}
//               >
//                 <Camera
//                   size={32}
//                   color={photos.length >= 5 ? "#9CA3AF" : "#DC2626"}
//                   strokeWidth={1.5}
//                 />
//               </TouchableOpacity>

//               {/* Submit Button */}
//               {(needsManualEvidence && photos.length >= 5) && (
//                 <TouchableOpacity
//                   onPress={() => finalizeEvidence(photos)}
//                   className="bg-green-600 p-3 rounded-full"
//                 >
//                   <Check size={24} color="#FFFFFF" strokeWidth={1.5} />
//                 </TouchableOpacity>
//               )}
//             </View>

//             {/* Instructions */}
//             <View className="mt-4 bg-black/50 p-4 rounded-lg">
//               <Text className="text-white text-center text-sm">
//                 {photos.length >= 5
//                   ? 'Photo limit reached. Tap ✓ to submit evidence.'
//                   : needsManualEvidence
//                   ? `Take ${5 - photos.length} more photos for verification`
//                   : 'Take a photo to classify the emergency automatically'
//                 }
//               </Text>
//             </View>
//           </View>
//         </>
        
//       ) :  (
//                 /* Preview Mode after 5 photos */
//                 <View className="flex-1 bg-black">
//                   <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap' }}>
//                     {photos.map((uri, idx) => (
//                       <Image
//                         key={idx}
//                         source={{ uri }}
//                         style={{ width: '50%', height: 200 }}
//                         resizeMode="cover"
//                       />
//                     ))}
//                   </ScrollView>
        
//                   {/* Done Button */}
//                   <View className="absolute bottom-12 left-0 right-0 items-center">
//                     <View className="flex-row justify-between items-center gap-12">
//                       <TouchableOpacity onPress={() => finalizeEvidence(photos)} className="bg-green-600 p-4 rounded-full">
//                         <Check size={28} color="#FFF" strokeWidth={2} />
//                       </TouchableOpacity>
//                       <TouchableOpacity onPress={retakeEvidence} className="bg-red-600 p-4 rounded-full">
//                         <X size={28} color="#FFF" strokeWidth={2} />
//                       </TouchableOpacity>
//                     </View>
//                   </View>
//                 </View>
//               )}
//     </View>
//   );
// }

// CameraCapture.tsx

// import React, { useEffect, useRef, useState } from "react";
// import { View, Text, TouchableOpacity, Dimensions, ActivityIndicator } from "react-native";
// import { CameraView, useCameraPermissions } from "expo-camera";
// import * as ImageManipulator from "expo-image-manipulator";
// import * as Location from "expo-location";
// import { X, RotateCcw, Camera as CameraIcon } from "lucide-react-native";
// import { aiClassificationService, ClassificationResult, EmergencyEvidence } from "@/hooks/AIClassificationService";
// import { CustomAlertManager } from "@/utils/showAlert";

// const { height } = Dimensions.get("window");

// interface CameraCaptureProps {
//   onAutoSubmit: (evidence: EmergencyEvidence, classification: ClassificationResult) => void;
//   onReject: () => void; 
//   onCancel: () => void;
// }

// export default function CameraCapture({
//   onAutoSubmit,
//   onReject,
//   onCancel,
// }: CameraCaptureProps) {
//   const cameraRef = useRef<CameraView>(null);
//   const [permission, requestPermission] = useCameraPermissions();
//   const [facing, setFacing] = useState<"back" | "front">("back");
//   const [isProcessing, setIsProcessing] = useState(false);

//   /** ✅ Ask for camera permission on mount */
//   useEffect(() => {
//     (async () => {
//       if (!permission?.granted) await requestPermission();
//     })();
//   }, [permission]);

//   /** ✅ Resize + compress image → 500x500 */
//   const compressImage = async (uri: string) => {
//     return await ImageManipulator.manipulateAsync(
//       uri,
//       [{ resize: { width: 500, height: 500 } }],
//       { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
//     );
//   };

//   const takePicture = async () => {
//     if (!cameraRef.current || isProcessing) return;

//     try {
//       setIsProcessing(true);

//       /** ✅ Take raw image */
//       const rawPhoto = await cameraRef.current.takePictureAsync({ quality: 1 });
//       if (!rawPhoto?.uri) throw new Error("Failed to capture image.");

//       /** ✅ Compress */
//       const compressed = await compressImage(rawPhoto.uri);

//       /** ✅ Get location */
//       let coords = null;
//       let address = null;
//       try {
//         const perm = await Location.requestForegroundPermissionsAsync();
//         if (perm.status === "granted") {
//           const pos = await Location.getCurrentPositionAsync({});
//           coords = pos.coords;

//           const places = await Location.reverseGeocodeAsync({
//             latitude: coords.latitude,
//             longitude: coords.longitude,
//           });

//           if (places?.length > 0) {
//             const p = places[0];
//             address = [p.name, p.street, p.city, p.region, p.country].filter(Boolean).join(", ");
//           }
//         }
//       } catch {
//         console.warn("Location fetch failed.");
//       }

//       const evidence: EmergencyEvidence = {
//         photos: [compressed.uri],
//         timestamp: new Date().toISOString(),
//         location: coords,
//         address,
//       };

//       /** ✅ AI Classification */
//       const cls = await aiClassificationService.classifyImage(compressed.uri);
//       const label = cls.label?.toLowerCase();
//       const confidence = Math.round((cls.confidence ?? 0) * 100);

//       /** ✅ Only allow FIRE and ROAD */
//       const allowed = ["fire", "road"];

//       if (cls.action === "accept" && cls.status === "valid" && allowed.includes(label)) {
//         // ✅ Auto-submit
//         onAutoSubmit(evidence, cls);
//         return;
//       }

//       /** ❌ Rejected/Invalid/Non-allowed label */
//       CustomAlertManager.show({
//         title: `Photo Not Accepted`,
//         message:
//           `• Label: ${cls.label ?? "Unknown"}\n` +
//           `• Caption: ${cls.caption ?? "No caption"}\n` +
//           `• Confidence: ${confidence}%\n\n` +
//           `⚠️ Only fire or road incidents are recognized.\nPlease retake a clear photo.`,
//         type: "warning",
//         onConfirm: () => onReject(),
//       });

//     } catch (err) {
//       console.error(err);
//       CustomAlertManager.show({
//         title: "Capture Error",
//         message: "Something went wrong while capturing the image. Please try again.",
//         type: "error",
//         onConfirm: () => onReject(),
//       });
//     } finally {
//       setIsProcessing(false);
//     }
//   };

//   const toggleFacing = () => setFacing(prev => (prev === "back" ? "front" : "back"));

//   if (!permission?.granted) {
//     return (
//       <View style={{ flex: 1, backgroundColor: "black", justifyContent: "center", alignItems: "center" }}>
//         <Text style={{ color: "white", marginBottom: 12 }}>Camera permission is required.</Text>
//         <TouchableOpacity
//           onPress={requestPermission}
//           style={{ backgroundColor: "#dc2626", padding: 12, borderRadius: 8 }}
//         >
//           <Text style={{ color: "white", fontWeight: "600" }}>Grant Permission</Text>
//         </TouchableOpacity>
//       </View>
//     );
//   }

//   return (
//     <View style={{ flex: 1, backgroundColor: "black" }}>
//       <CameraView ref={cameraRef} style={{ flex: 1 }} facing={facing} />

//       {/* Top Controls */}
//       <View style={{ position: "absolute", top: 40, width: "100%", paddingHorizontal: 20, flexDirection: "row", justifyContent: "space-between" }}>
//         <TouchableOpacity onPress={onCancel} style={{ padding: 10, borderRadius: 50, backgroundColor: "rgba(0,0,0,0.4)" }}>
//           <X size={22} color="white" strokeWidth={1.5} />
//         </TouchableOpacity>

//         <TouchableOpacity onPress={toggleFacing} style={{ padding: 10, borderRadius: 50, backgroundColor: "rgba(0,0,0,0.4)" }}>
//           <RotateCcw size={22} color="white" strokeWidth={1.5} />
//         </TouchableOpacity>
//       </View>

//       {/* Capture Button + Processing */}
//       <View style={{ position: "absolute", bottom: 40, width: "100%", alignItems: "center" }}>
//         {isProcessing && (
//           <View style={{ backgroundColor: "rgba(255,255,255,0.15)", padding: 16, borderRadius: 12, marginBottom: 16 }}>
//             <ActivityIndicator size="large" color="#fff" />
//             <Text style={{ color: "white", marginTop: 8 }}>Analyzing image…</Text>
//           </View>
//         )}

//         <TouchableOpacity
//           onPress={takePicture}
//           disabled={isProcessing}
//           style={{
//             width: 90,
//             height: 90,
//             borderRadius: 50,
//             backgroundColor: isProcessing ? "#888" : "white",
//             justifyContent: "center",
//             alignItems: "center",
//             borderWidth: 5,
//             borderColor: isProcessing ? "#555" : "#dc2626",
//           }}
//         >
//           <CameraIcon size={30} color={isProcessing ? "#333" : "#dc2626"} strokeWidth={1.6} />
//         </TouchableOpacity>

//         <Text style={{ color: "white", marginTop: 14 }}>Take one clear photo — AI will auto-submit</Text>
//       </View>
//     </View>
//   );
// }

