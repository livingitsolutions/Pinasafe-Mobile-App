import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEmergency } from "@/contexts/EmergencyContext";
import { useAuth } from "@/contexts/AuthContext";
import { CameraIcon, Image as ImageIcon } from "lucide-react-native";
import CameraCapture from "@/components/CameraCapture";

function ReportEmergency() {
  const { submitReport } = useEmergency();
  const { user } = useAuth();

  const [step, setStep] = useState<"form" | "camera">("form");
  const [isSubmitting, setIsSubmitting] = useState(false);

  /** ✅ Form Data */
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [contactNumber, setContactNumber] = useState('');

  /** ✅ From CameraCapture */
  const [capturedEvidence, setCapturedEvidence] = useState(null);
  const [capturedClassification, setCapturedClassification] = useState(null);

  /** ✅ Open Camera */
  const openCamera = () => {
    setStep("camera");
  };

  /** ✅ Camera auto-submit handler */
  const handleAutoSubmit = async (evidence : any, classification : any) => {
    setCapturedEvidence(evidence);
    setCapturedClassification(classification);

    // ✅ Proceed to backend submission immediately
    await finishSubmission(evidence, classification);
  };

  /** ✅ AI rejected — retake */
  const handleReject = () => {
    setCapturedEvidence(null);
    setCapturedClassification(null);
  };

  /** ✅ Cancel camera */
  const handleCancel = () => {
    setStep("form");
  };

  /** ✅ Final report creation */
  const finishSubmission = async (evidence:any, classification:any) => {
    try {

      if (!user) {
        Alert.alert('Error', 'You must be logged in to submit a report.');
        return;
      }

      if (!user.id) {
        Alert.alert('Error', 'Missing user id. Please re-login and try again.');
        return;
      }

      setIsSubmitting(true);

      const type = classification.label?.toLowerCase();

      const resolvedContactNumber = contactNumber || user.phone || '';
      if (!resolvedContactNumber) {
        Alert.alert('Missing Information', 'Please provide a contact number.');
        return;
      }

      const priority: "high" | "medium" | "low" | "critical" = type === "fire" || type === "road" ? "high" : "medium";

      const reportPayload = {
        type,
        description:
          description?.trim() !== ""
            ? description
            : classification.caption || "Emergency incident",
        location: location || evidence.address || "Unknown location",
        coordinates: evidence.location
          ? {
              latitude: evidence.location.latitude,
              longitude: evidence.location.longitude,
            }
          : undefined,
        contactNumber: resolvedContactNumber,
        reportedBy: user.id,
        priority,
        evidence,
        aiClassification: classification,
        useAIClassification: true,
      };

      const id = await submitReport(reportPayload);

      Alert.alert(
        "Report Submitted ✅",
        "Your emergency report has been successfully submitted.",
        [{ text: "OK", onPress: () => setStep("form") }]
      );

      // reset states
      setCapturedEvidence(null);
      setCapturedClassification(null);
      setDescription("");
      setLocation("");
      setContactNumber("");
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to submit report. Try again.");
    } finally {
      setIsSubmitting(false);
      setStep("form");
    }
  };

  if (step === "camera") {
    return (
      <CameraCapture
        onAutoSubmit={handleAutoSubmit}
        onReject={handleReject}
        onCancel={handleCancel}
      />
    );
  }

  // ✅ FORM SCREEN
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView className="flex-1 p-4">
        <Text className="text-2xl font-bold text-gray-900 mb-3">Report an Emergency</Text>

        <Text className="text-gray-600 mb-4">
          Take a clear photo of the incident — AI will validate and auto-submit.
        </Text>

        <View className="mb-6">
           <Text className="text-lg font-bold text-gray-900 mb-3">
             Description *
           </Text>
          <TextInput
            className="bg-white rounded-xl p-4 border border-gray-200 text-gray-900"
            placeholder="Describe the emergency situation in detail..."
            value={description}
            onChangeText={(text) => {
              setDescription(text);
            }}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Contact Number */}
        
        <View className="mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-3">Contact Number</Text>
          <TextInput
           className="bg-white rounded-xl p-4 border border-gray-200 text-gray-900"
            placeholder="Your phone number (optional)"
            value={contactNumber}
            onChangeText={setContactNumber}
            keyboardType="phone-pad"
          />
        </View>

        {/* Capture Button */}
        <TouchableOpacity
          onPress={openCamera}
          className="bg-red-600 py-4 rounded-xl flex-row items-center justify-center shadow-md"
        >
          <CameraIcon size={22} color="white" />
          <Text className="text-white text-lg font-semibold ml-2">Capture Incident Photo</Text>
        </TouchableOpacity>

        {isSubmitting && (
          <View className="mt-6 items-center">
            <ActivityIndicator size="large" color="#dc2626" />
            <Text className="text-gray-600 mt-2">Submitting Report...</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default React.memo(ReportEmergency);

// import React, { useState, useCallback } from 'react';
// import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Modal, Image } from 'react-native';
// import { SafeAreaView } from 'react-native-safe-area-context';
// import { router } from 'expo-router';
// import { AlertTriangle, MapPin, Phone, Camera, Mic, Send, Navigation, Eye } from 'lucide-react-native';
// import { useEmergency } from '@/contexts/EmergencyContext';
// import { useAuth } from '@/contexts/AuthContext';
// import EmergencyCameraCapture from '@/components/CameraCapture';
// import { ClassificationResult, EmergencyEvidence } from '@/hooks/AIClassificationService';

// const emergencyTypes = [
//   // { id: 'medical', name: 'Medical Emergency', color: 'bg-red-500', icon: '🚑' },
//   { id: 'fire', name: 'Fire Accident', color: 'bg-orange-500', icon: '🔥' },
//   // { id: 'crime', name: 'Crime/Security', color: 'bg-blue-500', icon: '🚔' },
//   { id: 'road', name: 'Road Accident', color: 'bg-yellow-500', icon: '🚗' },
//   // { id: 'natural', name: 'Natural Disaster', color: 'bg-green-500', icon: '🌊' },
//   // { id: 'other', name: 'Other', color: 'bg-gray-500', icon: '⚠️' },
// ];

// function ReportEmergency() {
//   const [selectedType, setSelectedType] = useState('');
//   const [description, setDescription] = useState('');
//   const [location, setLocation] = useState('');
//   const [contactNumber, setContactNumber] = useState('');
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const [locationCoords, setLocationCoords] = useState<{ latitude: number; longitude: number } | null>(null);
//   const [showCamera, setShowCamera] = useState(false);
//   const [evidence, setEvidence] = useState<EmergencyEvidence | null>(null);
//   const [aiClassification, setAiClassification] = useState<ClassificationResult | null>(null);
//   const [useAIClassification, setUseAIClassification] = useState(false);
//   const [previewImage, setPreviewImage] = useState<string | null>(null);
  
//   const { submitReport, alertResponders } = useEmergency();
//   const { user } = useAuth();

//   const handleLocationSelect = useCallback((address: string, coords?: { latitude: number; longitude: number }) => {
//     setLocation(address);
//     setLocationCoords(coords || null);
//   }, []);

//   const handleCameraCapture = useCallback(() => {
//     setShowCamera(true);
//   }, []);

//   const handleEvidenceCollected = useCallback((collectedEvidence: EmergencyEvidence, classification: ClassificationResult) => {
//     setEvidence(collectedEvidence);
//     setAiClassification(classification);
//     setShowCamera(false);
    
//      // ✅ Prefer human-readable address if available
//     if (collectedEvidence.location) {
//       setLocationCoords(collectedEvidence.location);
//       setLocation( collectedEvidence.address ?? `${collectedEvidence.location.latitude}, ${collectedEvidence.location.longitude}`);
//     }

//     // Auto-select the AI classified type if confidence is high
//     if (classification.action === 'accept' && classification.status === 'valid') {
//       setSelectedType(classification.label);
//       setUseAIClassification(true);
//       setDescription(classification.caption);
//     }

//     Alert.alert(
//       'Evidence Collected',
//       `${collectedEvidence.photos.length} photos captured${collectedEvidence.video ? ' and 1 video recorded' : ''}.\n\nAI Result: ${classification.caption}\n\nStatus: ${classification.status} | Action: ${classification.action}`,
//       [{ text: 'Continue', style: 'default' }]
//     );
//   }, []);

//   const handleSubmit = useCallback(async () => {
//     if (!selectedType || !description || !location) {
//       Alert.alert('Missing Information', 'Please fill in all required fields.');
//       return;
//     }

//     if (!user) {
//       Alert.alert('Error', 'You must be logged in to submit a report.');
//       return;
//     }

//     if (!user.id) {
//       Alert.alert('Error', 'Missing user id. Please re-login and try again.');
//       return;
//     }

//     if (!locationCoords) {
//       Alert.alert('Missing Information', 'Please select a location from the picker.');
//       return;
//     }

//     setIsSubmitting(true);
//     try {
//       type Priority = 'high' | 'medium' | 'low' | 'critical';
//       const priority: Priority = (selectedType === 'medical' || selectedType === 'fire') ? 'high' : 'medium';
//       const resolvedContactNumber = contactNumber || user.phone || '';
//       if (!resolvedContactNumber) {
//         Alert.alert('Missing Information', 'Please provide a contact number.');
//         return;
//       }

//       const reportData = {
//         type: selectedType,
//         description,
//         location,
//         coordinates: locationCoords,
//         contactNumber: resolvedContactNumber,
//         priority,
//         reportedBy: user.id,
//         ...(evidence && { evidence }),
//         ...(aiClassification && { aiClassification }),
//         useAIClassification,
//       };

//       const reportId = await submitReport(reportData);

//       // Alert all responders immediately
//       await alertResponders(reportId, {
//         type: selectedType,
//         location,
//         priority: reportData.priority,
//         hasEvidence: !!evidence,
//         aiClassified: !!aiClassification && aiClassification.confidence > 0.75,
//       });

//       Alert.alert(
//         'Emergency Report Submitted',
//         `Your emergency report (#${reportId.slice(-6)}) has been submitted successfully.\n\n${evidence ? 'Evidence attached: ' + evidence.photos.length + ' photos' + (evidence.video ? ' + 1 video' : '') : 'No evidence attached'}\n\nEmergency responders have been alerted immediately.`,
//         [
//           { text: 'OK', onPress: () => router.push('/(tabs-citizen)/emergency-main') }
//         ]
//       );
//     } catch (error) {
//       Alert.alert('Error', 'Failed to submit emergency report. Please try again.');
//     } finally {
//       setIsSubmitting(false);
//     }
//   }, [aiClassification, alertResponders, description, evidence, location, locationCoords, selectedType, submitReport, useAIClassification, user, contactNumber]);

//   const getTypeFromId = useCallback((id: string) => {
//     return emergencyTypes.find(type => type.id === id);
//   }, []);

//   return (
//     <SafeAreaView className="flex-1 bg-gray-50"
//     edges={[ 'left', 'right',]}>
//       <ScrollView className="flex-1 px-6">
//         {/* Header */}
//         <View className="mt-4 mb-6">
//           <View className="flex-row items-center mb-2">
//             <AlertTriangle size={24} color="#DC2626" strokeWidth={1.5} />
//             <Text className="text-xl font-bold text-gray-900 ml-2">Report an Emergency</Text>
//           </View>
//           <Text className="text-gray-600">Use AI-powered classification or manual reporting</Text>
//         </View>

//         {/* AI Camera Capture */}
//         <View className="mb-6">
//           <Text className="text-lg font-bold text-gray-900 mb-3">Emergency Evidence{" "}
//               {aiClassification && useAIClassification ? (
//                 <Text className="font-bold text-gray-600">(AI Classified Report)</Text>
//               ) : (
//                 <Text className="font-bold text-amber-600 items-center">
//                   (Manual Incident Report)
//                 </Text>
//               )}

//           </Text>
//           <TouchableOpacity
//             onPress={handleCameraCapture}
//             className="bg-red-600 p-4 rounded-xl flex-row items-center justify-center mb-3"
//           >
//             <Camera size={24} color="#FFFFFF" strokeWidth={1.5} />
//             <Text className="text-white font-semibold text-lg ml-2">
//               {evidence ? 'Update Evidence' : 'Capture Live Evidence'}
//             </Text>
//           </TouchableOpacity>
          
//           {evidence && (
//             <View className="bg-green-50 border border-green-200 rounded-xl p-4">
//               <View className="flex-row items-center mb-2">
//                 <Eye size={16} color="#059669" strokeWidth={1.5} />
//                 <Text className="ml-2 text-green-800 font-medium">Evidence Collected</Text>
//               </View>
//               <Text className="text-green-700 text-sm">
//                 • {evidence.photos.length} photos captured
//                 {evidence.video && ' • 1 video recorded'}
//               </Text>
//                {/* ✅ Thumbnails */}
//                 <ScrollView horizontal showsHorizontalScrollIndicator={false}>
//                   {evidence.photos.map((uri, index) => (
//                     <TouchableOpacity
//                       key={index}
//                       onPress={() => setPreviewImage(uri)} // set image to preview
//                       className="mr-2"
//                     >
//                       <Image
//                         source={{ uri }}
//                         className="w-20 h-20 rounded-lg border border-gray-300"
//                         resizeMode="cover"
//                       />
//                     </TouchableOpacity>
//                   ))}
//                 </ScrollView>
             
//               {aiClassification && (
//                 <View className="mt-2 pt-2 border-t border-green-200">
//                   <Text className="text-green-800 font-medium">AI Classification:</Text>
//                   <Text className="text-green-700 text-sm">{aiClassification.caption}</Text>
//                   <Text className="text-green-600 text-xs">
//                     Confidence: {Math.round(aiClassification.confidence * 100)}%
//                   </Text>
//                 </View>
//               )}
//             </View>
//           )}
          
//           <Text className="text-gray-500 text-sm mt-2">
//             📸 AI will analyze your photos to classify the emergency type automatically
//           </Text>
//         </View>

//         {/* Emergency Type Selection */}
//         <View className="mb-6">
//           <Text className="text-lg font-bold text-gray-900 mb-3">
//             Emergency Type *{" "}
//               {aiClassification && useAIClassification ? (
//                 <Text className="font-normal text-gray-600">(AI Classified)</Text>
//               ) : (
//                 <Text className="font-semibold text-sm text-orange-600 items-center">
//                   (Please select an emergency type for this reported incident)
//                 </Text>
//               )}
//           </Text>
//           <View className="flex-row flex-wrap">
//             {emergencyTypes.map((type) => (
//               <TouchableOpacity
//                 key={type.id}
//                 onPress={() => {
//                   setSelectedType(type.id);
//                   setUseAIClassification(false);
//                 }}
//                 className={`w-[48%] p-4 rounded-xl mb-3 mr-2 border-2 ${
//                   selectedType === type.id 
//                     ? 'border-emergency-600 bg-emergency-50' 
//                     : 'border-gray-200 bg-white'
//                 }`}
//               >
//                 <Text className="text-2xl mb-1">{type.icon}</Text>
//                 <Text className={`font-medium ${
//                   selectedType === type.id ? 'text-emergency-600' : 'text-gray-900'
//                 }`}>
//                   {type.name}
//                 </Text>
//                 {aiClassification && type.id === aiClassification.label && (
//                   <Text className="text-xs text-green-600 mt-1">AI Suggested</Text>
//                 )}
//               </TouchableOpacity>
//             ))}
//           </View>
//         </View>

//         {/* Description */}
//         <View className="mb-6">
//           <Text className="text-lg font-bold text-gray-900 mb-3">
//             Description * {aiClassification && useAIClassification && '(AI Generated)'}
//           </Text>
//           <TextInput
//             className="bg-white rounded-xl p-4 border border-gray-200 text-gray-900"
//             placeholder="Describe the emergency situation in detail..."
//             value={description}
//             onChangeText={(text) => {
//               setDescription(text);
//               setUseAIClassification(false);
//             }}
//             multiline
//             numberOfLines={4}
//             textAlignVertical="top"
//           />
//         </View>

//         {/* Location */}
//         {/* <View className="mb-6">
//           <Text className="text-lg font-bold text-gray-900 mb-3">Location *</Text>
//           {location && (
//                   <View className="bg-green-50 border border-green-200 rounded-xl p-3">
//                     <View className="flex-row items-center">
//                       <MapPin size={16} color="#059669" strokeWidth={1.5} />
//                       <Text className="ml-2 text-green-800 font-medium">Current Location</Text>
//                     </View>
//                     <Text className="text-green-700 text-sm mt-1">
//                       {locationData.address || 'Location detected'}
//                     </Text>
//                     <Text className="text-green-600 text-xs mt-1">
//                       Accuracy: {locationData.coords.accuracy ? `${Math.round(locationData.coords.accuracy)}m` : 'Unknown'}
//                     </Text>
//                   </View>
//                 )} */}
//           {/* <LocationPicker
//             onLocationSelect={handleLocationSelect}
//             currentLocation={location}
//             placeholder="Enter specific location or address"
//             showCurrentLocationButton={true}
//           />
//           {!location && (
//             <TextInput
//               className="mt-3 bg-white rounded-xl p-4 border border-gray-200 text-gray-900"
//               placeholder="Or enter location manually"
//               value={location}
//               onChangeText={setLocation}
//             />
//           )} */}
//         {/* </View> */}


//         {/* Location */}
//         <View className="mb-6">
//           <Text className="text-lg font-bold text-gray-900 mb-3">Location *</Text>
          
//           {location && locationCoords ? (
//               <View className="bg-green-50 border border-green-200 rounded-xl p-3">
//                 <View className="flex-row items-center">
//                   <MapPin size={16} color="#059669" strokeWidth={1.5} />
//                   <Text className="ml-2 text-green-800 font-medium">Current Location</Text>
//                 </View>

//                 {/* Show address if available, else fallback to lat/lng */}
//                 <Text className="text-green-700 text-sm mt-1">
//                   {location ? location : `${locationCoords.latitude}, ${locationCoords.longitude}`}
//                 </Text>

//                 {/* Optional: show coords nicely */}
//                 <Text className="text-green-600 text-xs mt-1">
//                   Lat: {locationCoords.latitude.toFixed(5)}, Lng: {locationCoords.longitude.toFixed(5)}
//                 </Text>
//               </View>
//             ) : (
//               <View className="bg-orange-50 border border-orange-200 rounded-xl p-3">
//                 <View className="flex-row items-center">
//                   <MapPin size={16} color="red" strokeWidth={1.5} />
//                   <Text className="mx-auto text-red-800 font-medium">
//                     Please capture evidence to auto-detect location.
//                   </Text>
//                 </View>
//               </View>
//             )
//           }
              
//         </View>

//         {/* Contact Number */}
//         <View className="mb-6">
//           <Text className="text-lg font-bold text-gray-900 mb-3">Contact Number</Text>
//           <TextInput
//             className="bg-white rounded-xl p-4 border border-gray-200 text-gray-900"
//             placeholder="Your phone number (optional)"
//             value={contactNumber}
//             onChangeText={setContactNumber}
//             keyboardType="phone-pad"
//           />
//         </View>

//         {/* Submit Button */}
//         <TouchableOpacity
//           onPress={handleSubmit}
//           disabled={isSubmitting}
//           className={`py-4 rounded-xl mb-6 flex-row items-center justify-center ${
//             isSubmitting ? 'bg-gray-400' : 'bg-emergency-600'
//           }`}
//         >
//           <Send size={20} color="#FFFFFF" strokeWidth={1.5} />
//           <Text className="text-white font-bold text-lg ml-2">
//             {isSubmitting ? 'Submitting...' : 'Submit Emergency Report'}
//           </Text>
//         </TouchableOpacity>

//         {/* Emergency Notice */}
//         <View className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
//           <Text className="text-red-800 font-medium mb-1">⚠️ For Life-Threatening Emergencies</Text>
//           <Text className="text-red-700 text-sm">
//             If this is a life-threatening emergency, call 911 immediately instead of using this form.
//           </Text>
//         </View>
//       </ScrollView>

//       {/* Camera Modal */}
//       <Modal
//         visible={showCamera}
//         animationType="slide"
//         presentationStyle="fullScreen"
//       >
//         <EmergencyCameraCapture
//           onEvidenceCollected={handleEvidenceCollected}
//           onCancel={() => setShowCamera(false)}
//         />
//       </Modal>

//       {/* Preview Modal */}
//       <Modal
//         visible={!!previewImage}
//         transparent={true}
//         animationType="fade"
//         onRequestClose={() => setPreviewImage(null)}
//       >
//         <View className="flex-1 bg-black justify-center items-center">
//           <TouchableOpacity
//             onPress={() => setPreviewImage(null)}
//             className="absolute top-12 right-6 z-50 bg-black/60 p-2 rounded-full"
//           >
//             <Text className="text-white text-lg">✕</Text>
//           </TouchableOpacity>
//           <Image
//             source={{ uri: previewImage! }}
//             className="w-full h-full"
//             resizeMode="contain"
//           />
//         </View>
//       </Modal>
//     </SafeAreaView>
//   );
// }

// export default React.memo(ReportEmergency);


// reports.tsx
// import React, { useCallback, useState } from 'react';
// import {
//   View,
//   Text,
//   TouchableOpacity,
//   ScrollView,
//   Alert,
//   Modal,
//   Image,
//   ActivityIndicator,
// } from 'react-native';
// import { SafeAreaView } from 'react-native-safe-area-context';
// import { router } from 'expo-router';
// import { AlertTriangle, MapPin, Camera as CameraIcon, Eye } from 'lucide-react-native';
// import { useEmergency } from '@/contexts/EmergencyContext';
// import { useAuth } from '@/contexts/AuthContext';
// import CameraCapture from '@/components/CameraCapture';
// import { ClassificationResult, EmergencyEvidence } from '@/hooks/AIClassificationService';

// const emergencyTypes = [
//   { id: 'fire', name: 'Fire', icon: '🔥' },
//   { id: 'road', name: 'Road', icon: '🚗' },
// ];

// function ReportEmergency() {
//   const [showCamera, setShowCamera] = useState(false);
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const [previewImage, setPreviewImage] = useState<string | null>(null);

//   const { submitReport, alertResponders } = useEmergency();
//   const { user } = useAuth();

//   // Auto-submit handler called by CameraCapture when AI says valid
//   const handleAutoSubmit = useCallback(
//     async (evidence: EmergencyEvidence, classification: ClassificationResult) => {
//       if (!user) {
//         Alert.alert('Not logged in', 'You must be logged in to submit a report.');
//         setShowCamera(false);
//         return;
//       }
//       setIsSubmitting(true);

//       try {
//         // Map classification label to backend type (we only expect 'fire' or 'road')
//         const label = (classification.label || '').toLowerCase();
//         const type = label === 'fire' ? 'fire' : label === 'road' ? 'road' : 'other';

//         // Build report payload
//         const reportData: any = {
//           type,
//           description: classification.caption || `${type} incident reported`,
//           location: evidence.address || (evidence.location ? `${evidence.location.latitude}, ${evidence.location.longitude}` : 'Unknown location'),
//           coordinates: evidence.location || undefined,
//           contactNumber: user.phone || '',
//           priority: type === 'fire' ? 'high' : 'medium',
//           evidence,
//           aiClassification: {
//             label: classification.label,
//             caption: classification.caption,
//             confidence: classification.confidence,
//             action: classification.action,
//             status: classification.status,
//           },
//           useAIClassification: true,
//         };

//         // Submit report
//         const reportId = await submitReport(reportData);

//         // Alert responders right away
//         await alertResponders(reportId, {
//           type,
//           location: reportData.location,
//           priority: reportData.priority,
//           hasEvidence: !!evidence,
//           aiClassified: true,
//         });

//         // Success feedback
//         Alert.alert(
//           'Report Submitted',
//           `Your report (#${reportId.slice(-6)}) was submitted automatically. Responders were alerted.`,
//           [{ text: 'OK', onPress: () => router.push('/(tabs-citizen)/emergency-main') }]
//         );
//       } catch (err) {
//         console.error('Auto-submit failed', err);
//         Alert.alert('Submission failed', 'Unable to submit the report. Please try again.');
//       } finally {
//         setIsSubmitting(false);
//         setShowCamera(false);
//       }
//     },
//     [user, submitReport, alertResponders]
//   );

//   // Called when AI rejects or uncertain (force retake)
//   const handleReject = useCallback(() => {
//     // Keep camera open for retake and show short message
//     // Alert.alert('Photo Rejected', 'AI did not accept the photo. Please retake a clearer photo.');
//     // Camera remains open
//   }, []);

//   return (
//     <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
//       <ScrollView contentContainerStyle={{ padding: 16 }}>
//         <View style={{ marginBottom: 12 }}>
//           <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
//             <AlertTriangle size={20} color="#DC2626" strokeWidth={1.5} />
//             <Text style={{ fontSize: 18, fontWeight: '700', marginLeft: 8 }}>Report an Emergency</Text>
//           </View>
//           <Text style={{ color: '#6B7280' }}>Take one clear photo — AI will auto-submit if valid</Text>
//         </View>

//         {/* AI Camera Capture Trigger */}
//         <TouchableOpacity
//           onPress={() => setShowCamera(true)}
//           style={{ backgroundColor: '#DC2626', padding: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}
//         >
//           <CameraIcon size={18} color="#FFF" strokeWidth={1.5} />
//           <Text style={{ color: '#FFF', fontWeight: '700', marginLeft: 8 }}>Capture Evidence (Auto-submit)</Text>
//         </TouchableOpacity>

//         <View style={{ marginBottom: 16 }}>
//           <Text style={{ fontWeight: '700', marginBottom: 6 }}>Supported auto-types</Text>
//           <View style={{ flexDirection: 'row', gap: 8 }}>
//             {emergencyTypes.map((t) => (
//               <View key={t.id} style={{ padding: 10, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', marginRight: 8 }}>
//                 <Text style={{ fontSize: 20 }}>{t.icon}</Text>
//                 <Text style={{ fontWeight: '600', marginTop: 4 }}>{t.name}</Text>
//               </View>
//             ))}
//           </View>
//         </View>

//         {/* Evidence preview (if any) */}
//         {previewImage && (
//           <View style={{ marginBottom: 16 }}>
//             <Text style={{ fontWeight: '700', marginBottom: 8 }}>Preview</Text>
//             <Image source={{ uri: previewImage }} style={{ width: '100%', height: 220, borderRadius: 12 }} resizeMode="cover" />
//           </View>
//         )}

//         {/* Subtle note */}
//         <View style={{ backgroundColor: '#FEF3F2', borderColor: '#FECACA', borderWidth: 1, padding: 12, borderRadius: 12 }}>
//           <Text style={{ fontWeight: '600', color: '#B91C1C' }}>Automatic submission</Text>
//           <Text style={{ color: '#991B1B' }}>If the photo is classified as a valid fire or road incident, it will be submitted automatically.</Text>
//         </View>
//       </ScrollView>

//       {/* Camera Modal */}
//       <Modal visible={showCamera} animationType="slide" presentationStyle="fullScreen">
//         <View style={{ flex: 1 }}>
//           {isSubmitting ? (
//             <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
//               <ActivityIndicator size="large" color="#DC2626" />
//               <Text style={{ color: '#fff', marginTop: 12 }}>Submitting report...</Text>
//             </View>
//           ) : (
//             <CameraCapture
//               onAutoSubmit={handleAutoSubmit}
//               onReject={handleReject}
//               onCancel={() => setShowCamera(false)}
//             />
//           )}
//         </View>
//       </Modal>
//     </SafeAreaView>
//   );
// }

// export default React.memo(ReportEmergency);




// import React, { useState } from "react";
// import { ScrollView, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
// import { SafeAreaView } from 'react-native-safe-area-context';
// import CameraCapture from "@/components/CameraCapture";
// import { useEmergency } from "@/contexts/EmergencyContext";
// import { useAuth } from "@/contexts/AuthContext";
// import { CameraIcon } from "lucide-react-native";
// import { CustomAlert } from "@/components/CustomAlert";
// import { CustomAlertManager } from "@/utils/showAlert";
// import { router } from "expo-router";

// function ReportEmergency() {
//   const { submitReport } = useEmergency();
//   const { user } = useAuth();

//   const [step, setStep] = useState<"form" | "camera">("form");
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const [description, setDescription] = useState("");
//   const [location, setLocation] = useState("");
//   const [contactNumber, setContactNumber] = useState("");

//   const [alertOptions, setAlertOptions] = useState({ visible: false, title: "", message: "", type: "info" as any, onConfirm: undefined });
//   CustomAlertManager.register(setAlertOptions);

//   const [capturedEvidence, setCapturedEvidence] = useState<any>(null);
//   const [capturedClassification, setCapturedClassification] = useState<any>(null);

//   const openCamera = () => setStep("camera");

//   const handleAutoSubmit = async (evidence: any, classification: any) => {
//     setCapturedEvidence(evidence);
//     setCapturedClassification(classification);
//     await finishSubmission(evidence, classification);
//   };

//   const handleReject = () => {
//     setCapturedEvidence(null);
//     setCapturedClassification(null);
//   };

//   const handleCancel = () => setStep("form");

//   const finishSubmission = async (evidence: any, classification: any) => {
//     try {
//       if (!user?.id){
//         CustomAlertManager.show({title: "Error", message: "You must be logged in to submit a report.", type: "error" });
//         return;
//       } 

//       setIsSubmitting(true);

//       const type = classification.label?.toLowerCase();
//       const resolvedContactNumber = contactNumber || user.phone || '';
//       if (!resolvedContactNumber) {
//         CustomAlertManager.show({ title: "Missing Info", message: "Please provide a contact number", type: "warning" });
//         return;
//       }

//       const reportPayload = {
//         type,
//         description: description || classification.caption || "Emergency incident",
//         location: location || evidence.address || "Unknown location",
//         coordinates: evidence.location,
//         contactNumber: resolvedContactNumber,
//         reportedBy: user.id,
//         priority: (type === "fire" || type === "road") ? "high" : "medium",
//         evidence,
//         aiClassification: classification,
//         useAIClassification: true,
//       };

//       await submitReport(reportPayload);

//       CustomAlertManager.show({
//         title: "Report Submitted ✅",
//         message: "Your emergency report has been successfully submitted.",
//         type: "success",
//         onConfirm: () => setStep("form"),
//       });

//       setCapturedEvidence(null);
//       setCapturedClassification(null);
//       setDescription("");
//       setLocation("");
//       setContactNumber("");

//     } catch (err) {
//       CustomAlertManager.show({ title: "Error", message: "Failed to submit report. Try again.", type: "error" });
//     } finally {
//       setIsSubmitting(false);
//       router.back();
//     }
//   };

//   if (step === "camera") {
//     return (
//       <CameraCapture
//         onAutoSubmit={handleAutoSubmit}
//         onReject={handleReject}
//         onCancel={handleCancel}
//         showAlert={(title, message, onConfirm) => CustomAlertManager.show({ title, message, onConfirm })}
//       />
//     );
//   }

//   return (
//     <SafeAreaView className="flex-1 bg-gray-50">
//       <ScrollView className="flex-1 p-4">
//         <Text className="text-2xl font-bold text-gray-900 mb-3">Report an Emergency</Text>

//         <TextInput
//           placeholder="Description..."
//           value={description}
//           onChangeText={setDescription}
//           multiline
//           style={{ borderWidth: 1, borderColor: "#ccc", padding: 12, borderRadius: 8, marginBottom: 16 }}
//         />

//         <TextInput
//           placeholder="Contact Number..."
//           value={contactNumber}
//           onChangeText={setContactNumber}
//           keyboardType="phone-pad"
//           style={{ borderWidth: 1, borderColor: "#ccc", padding: 12, borderRadius: 8, marginBottom: 16 }}
//         />

//         <TouchableOpacity
//           onPress={openCamera}
//           style={{ backgroundColor: "#dc2626", padding: 16, borderRadius: 12, flexDirection: "row", justifyContent: "center", alignItems: "center" }}
//         >
//           <CameraIcon size={22} color="white" />
//           <Text style={{ color: "white", fontWeight: "bold", marginLeft: 8 }}>Capture Incident Photo</Text>
//         </TouchableOpacity>

//         {isSubmitting && (
//           <ActivityIndicator size="large" color="#dc2626" style={{ marginTop: 16 }} />
//         )}

//       </ScrollView>

//       <CustomAlert
//         visible={alertOptions.visible}
//         title={alertOptions.title}
//         message={alertOptions.message}
//         type={alertOptions.type}
//         onConfirm={alertOptions.onConfirm}
//       />
//     </SafeAreaView>
//   );
// }

// export default React.memo(ReportEmergency);