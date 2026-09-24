// export interface ClassificationResult {
//   label: 'medical' | 'fire' | 'accident' | 'crime' | 'natural' | 'other';
//   confidence: number;
//   status: 'valid' | 'invalid' | 'uncertain';
//   action: 'accept' | 'reject';
//   reason: string;
//   caption: string;
//   requiresManualVerification: boolean;
// }

// export interface EmergencyEvidence {
//   photos: string[];
//   video?: string;
//   timestamp: string;
//   location?: { latitude: number; longitude: number };
// }

// class AIClassificationService {
//   private readonly API_ENDPOINT = process.env.API_ENDPOINT_AI || 'https://image-ai-classifier-1.onrender.com/predict';
//   private readonly CONFIDENCE_THRESHOLD = 0.75;
//   private readonly TIMEOUT = 10000; // 10 seconds

//   async classifyImage(imageUri: string): Promise<ClassificationResult> {
//     const controller = new AbortController();
//     const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

//     try {
//       // Prepare form data for your API
//       const formData = new FormData();
//       formData.append('image', {
//         uri: imageUri,
//         type: 'image/jpeg',
//         name: 'emergency.jpg',
//       } as any);

//       // Call your actual API endpoint
//       const response = await fetch(this.API_ENDPOINT, {
//         method: 'POST',
//         body: formData,
//         headers: {
//           'Content-Type': 'multipart/form-data',
//         },
//         signal: controller.signal,
//       });

//       clearTimeout(timeoutId);

//       if (!response.ok) {
//         throw new Error(`API request failed: ${response.status}`);
//       }

//       const apiResult = await response.json();
      
//       // Transform your API response to our format
//       return this.transformAPIResponse(apiResult);
//     } catch (error) {
//       clearTimeout(timeoutId);
//       console.error('AI Classification failed:', error);
      
//       // Fallback to mock classification for development
//       return await this.mockAIClassification(imageUri);
//     }
//   }

//   private transformAPIResponse(apiResult: any): ClassificationResult {
//     // Map your API response to our classification format
//     const requiresManualVerification = 
//       apiResult.confidence < this.CONFIDENCE_THRESHOLD || 
//       apiResult.action === 'reject' ||
//       apiResult.status === 'uncertain';

//     return {
//       label: this.mapLabelToType(apiResult.label),
//       confidence: apiResult.confidence,
//       status: apiResult.status,
//       action: apiResult.action,
//       reason: apiResult.reason,
//       caption: apiResult.caption,
//       requiresManualVerification,
//     };
//   }

//   private mapLabelToType(label: string): ClassificationResult['label'] {
//     // Map your API labels to our emergency types
//     const labelMap: Record<string, ClassificationResult['label']> = {
//       'fire': 'fire',
//       'medical': 'medical',
//       'accident': 'accident',
//       'vehicle_accident': 'accident',
//       'crime': 'crime',
//       'natural_disaster': 'natural',
//       'flood': 'natural',
//       'earthquake': 'natural',
//       'other': 'other',
//     };

//     return labelMap[label.toLowerCase()] || 'other';
//   }

//   private async mockAIClassification(imageUri: string): Promise<ClassificationResult> {
//     // Simulate API delay
//     await new Promise(resolve => setTimeout(resolve, 2000));
    
//     // Mock scenarios based on your API format
//     const scenarios = [
//       {
//         label: 'fire' as const,
//         confidence: 0.948,
//         status: 'valid' as const,
//         action: 'accept' as const,
//         reason: 'Valid fire incident detected',
//         caption: 'A fire burns in the middle of a residential area. This appears to involve a fire incident.',
//         requiresManualVerification: false,
//       },
//       {
//         label: 'medical' as const,
//         confidence: 0.892,
//         status: 'valid' as const,
//         action: 'accept' as const,
//         reason: 'Medical emergency detected',
//         caption: 'Person appears to be injured and requires medical attention. This appears to be a medical emergency.',
//         requiresManualVerification: false,
//       },
//       {
//         label: 'accident' as const,
//         confidence: 0.654,
//         status: 'uncertain' as const,
//         action: 'reject' as const,
//         reason: 'Low confidence - requires manual verification',
//         caption: 'Possible vehicle accident detected but confidence is low. Manual review recommended.',
//         requiresManualVerification: true,
//       },
//       {
//         label: 'other' as const,
//         confidence: 0.423,
//         status: 'uncertain' as const,
//         action: 'reject' as const,
//         reason: 'Unable to classify emergency type with confidence',
//         caption: 'Emergency situation detected but type unclear. Manual classification required.',
//         requiresManualVerification: true,
//       },
//     ];

//     // Return random scenario for demo
//     return scenarios[Math.floor(Math.random() * scenarios.length)];
//   }

//   async processEmergencyEvidence(evidence: EmergencyEvidence): Promise<{
//     classification: ClassificationResult;
//     evidenceProcessed: boolean;
//   }> {
//     try {
//       // Process the first photo for classification
//       const primaryPhoto = evidence.photos[0];
//       const classification = await this.classifyImage(primaryPhoto);

//       // Additional validation based on your API response
//       if (classification.action === 'reject' || classification.status === 'uncertain') {
//         classification.requiresManualVerification = true;
//       }

//       return {
//         classification,
//         evidenceProcessed: true,
//       };
//     } catch (error) {
//       console.error('Evidence processing failed:', error);
//       return {
//         classification: {
//           label: 'other',
//           confidence: 0,
//           status: 'invalid',
//           action: 'reject',
//           reason: 'Processing failed - manual review required',
//           caption: 'Unable to process evidence. Manual review required.',
//           requiresManualVerification: true,
//         },
//         evidenceProcessed: false,
//       };
//     }
//   }

//   // Utility method to get priority based on classification
//   getPriorityFromClassification(classification: ClassificationResult): 'low' | 'medium' | 'high' | 'critical' {
//     if (classification.confidence > 0.9 && (classification.label === 'fire' || classification.label === 'medical')) {
//       return 'critical';
//     }
    
//     if (classification.confidence > 0.8) {
//       return 'high';
//     }
    
//     if (classification.confidence > 0.6) {
//       return 'medium';
//     }
    
//     return 'low';
//   }

//   // Method to format classification for display
//   formatClassificationForDisplay(classification: ClassificationResult): string {
//     const typeMap = {
//       fire: '🔥 Fire Emergency',
//       medical: '🚑 Medical Emergency',
//       accident: '🚗 Accident',
//       crime: '🚔 Crime/Security',
//       natural: '🌊 Natural Disaster',
//       other: '⚠️ Other Emergency',
//     };

//     return typeMap[classification.label] || '⚠️ Emergency';
//   }
// }

// export const aiClassificationService = new AIClassificationService();


export interface ClassificationResult {
  label: 'medical' | 'fire' | 'road' | 'crime' | 'natural' | 'other';
  confidence: number;
  status: 'valid' | 'invalid' ;
  action: 'accept' | 'reject' | 'uncertain';
  reason: string;
  caption: string;
  requiresManualVerification: boolean;
}

export interface EmergencyEvidence {
  photos: string[];
  video?: string;
  timestamp: string;
  location: { latitude: number; longitude: number } | null;
  address: string | null;
}

class AIClassificationService {
  private readonly API_ENDPOINT = 'https://image-ai-classifier-1.onrender.com/predict';
  // private readonly API_ENDPOINT = 'https://jubilant-journey-69rgxr695v6r35jrp-8000.app.github.dev/predict';
  private readonly CONFIDENCE_THRESHOLD = 0.75;
  private readonly TIMEOUT = 30000; // 30 seconds

  async classifyImage(imageUri: string): Promise<ClassificationResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

    try {
      // Prepare form data for your API
      const formData = new FormData();
      formData.append('file', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'emergency.jpg',
      } as any);

      // Call your actual API endpoint
      const response = await fetch(this.API_ENDPOINT, {
        method: 'POST',
        body: formData,
        headers: {
          // ⚠️ Do NOT manually set Content-Type when using FormData.
          // fetch will handle proper multipart boundaries
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const apiResult = await response.json();

      // Transform your API response to our format
      return this.transformAPIResponse(apiResult);
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error('AI Classification failed:', error);

      // Check if it's a timeout/abort error
      const isTimeoutError = error?.name === 'AbortError' || error?.message?.includes('aborted');
      const isNetworkError = error?.message?.includes('Network') || error?.message?.includes('fetch');

      // Return a "failed classification" result with appropriate reason
      return {
        label: 'other',
        confidence: 0,
        status: 'invalid',
        action: 'uncertain',
        reason: isTimeoutError 
          ? 'Classification request timed out. Please try again or provide manual evidence.'
          : isNetworkError
          ? 'Network error. Please check your connection and try again.'
          : 'Classification request failed. Manual review required.',
        caption: 'Unable to classify image. Manual review required.',
        requiresManualVerification: true,
      };
    }
  }

  private transformAPIResponse(apiResult: any): ClassificationResult {
    const requiresManualVerification =
      apiResult.confidence < this.CONFIDENCE_THRESHOLD ||
      apiResult.action === 'reject' ||
      apiResult.status === 'uncertain';

    return {
      label: this.mapLabelToType(apiResult.label),
      confidence: apiResult.confidence ?? 0,
      status: apiResult.status ?? 'invalid',
      action: apiResult.action ?? 'reject',
      reason: apiResult.reason ?? 'No reason provided',
      caption: apiResult.caption ?? '',
      requiresManualVerification,
    };
  }

  private mapLabelToType(label: string): ClassificationResult['label'] {
    const labelMap: Record<string, ClassificationResult['label']> = {
      fire: 'fire',
      medical: 'medical',
      accident: 'road',
      vehicle_accident: 'road',
      crime: 'crime',
      natural_disaster: 'natural',
      flood: 'natural',
      earthquake: 'natural',
      other: 'other',
    };

    return labelMap[label?.toLowerCase()] || 'other';
  }

  async processEmergencyEvidence(evidence: EmergencyEvidence): Promise<{
    classification: ClassificationResult;
    evidenceProcessed: boolean;
  }> {
    try {
      const primaryPhoto = evidence.photos[0] || '';
      const classification = await this.classifyImage(primaryPhoto);

      if (classification.action === 'reject' || classification.action === 'uncertain') {
        classification.requiresManualVerification = true;
      }

      return {
        classification,
        evidenceProcessed: true,
      };
    } catch (error) {
      console.error('Evidence processing failed:', error);
      return {
        classification: {
          label: 'other',
          confidence: 0,
          status: 'invalid',
          action: 'reject',
          reason: 'Processing failed - manual review required',
          caption: 'Unable to process evidence. Manual review required.',
          requiresManualVerification: true,
        },
        evidenceProcessed: false,
      };
    }
  }

  getPriorityFromClassification(
    classification: ClassificationResult
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (
      classification.confidence > 0.9 &&
      (classification.label === 'fire' || classification.label === 'road')
    ) {
      return 'critical';
    }

    if (classification.confidence > 0.8) {
      return 'high';
    }

    if (classification.confidence > 0.6) {
      return 'medium';
    }

    return 'low';
  }

  formatClassificationForDisplay(classification: ClassificationResult): string {
    const typeMap = {
      fire: '🔥 Fire Emergency',
      medical: '🚑 Medical Emergency',
      road: '🚗 Accident',
      crime: '🚔 Crime/Security',
      natural: '🌊 Natural Disaster',
      other: '⚠️ Other Emergency',
    };

    return typeMap[classification.label] || '⚠️ Emergency';
  }
}

export const aiClassificationService = new AIClassificationService();
