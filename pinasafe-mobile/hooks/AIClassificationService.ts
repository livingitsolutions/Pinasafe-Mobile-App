import { prepareImageUpload } from "./imageUpload";
import { AI_IMAGE_FIELD_NAME } from "./imageUpload.types";

export interface ClassificationResult {
  label: "fire" | "road" | "other";
  confidence: number;
  status: "valid" | "invalid";
  action: "accept" | "reject" | "uncertain";
  reason: string;
  caption: string;
}

export interface EmergencyEvidence {
  photos: string[];
  video?: string;
  timestamp: string;
  location: { latitude: number; longitude: number } | null;
  address: string | null;
}

type ClassificationFailureKind =
  | "timeout"
  | "http-client"
  | "http-server"
  | "network"
  | "malformed-response"
  | "unknown";

class AIClassificationError extends Error {
  constructor(
    readonly kind: ClassificationFailureKind,
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "AIClassificationError";
  }
}

class AIClassificationService {
  // private readonly API_ENDPOINT =
  //   process.env.AI_ENDPOINT_URL ||
  //   "https://jubilant-journey-69rgxr695v6r35jrp-8000.app.github.dev/predict";
  
  private readonly API_ENDPOINT =
    process.env.EXPO_PUBLIC_AI_ENDPOINT_URL ||
    "https://image-ai-classifier-1.onrender.com/predict";

  private readonly CONFIDENCE_THRESHOLD = 0.75;
  private readonly TIMEOUT = 30000; // 30 seconds

  /** ✅ Main Classification Method */
  async classifyImage(imageUri: string): Promise<ClassificationResult> {
    const controller = new AbortController();
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, this.TIMEOUT);

    try {
      const formData = new FormData();
      const upload = await prepareImageUpload(imageUri);

      if (upload.filename) {
        formData.append(
          AI_IMAGE_FIELD_NAME,
          upload.image as Blob,
          upload.filename
        );
      } else {
        formData.append(AI_IMAGE_FIELD_NAME, upload.image as any);
      }

      const response = await fetch(this.API_ENDPOINT, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new AIClassificationError(
          response.status >= 500 ? "http-server" : "http-client",
          `AI endpoint returned HTTP ${response.status}.`,
          response.status
        );
      }

      let apiResult: unknown;
      try {
        apiResult = await response.json();
      } catch {
        throw new AIClassificationError(
          "malformed-response",
          "AI endpoint returned invalid JSON."
        );
      }

      if (!apiResult || typeof apiResult !== "object") {
        throw new AIClassificationError(
          "malformed-response",
          "AI endpoint returned an unexpected response."
        );
      }

      return this.transformAPIResponse(apiResult);
    } catch (error: unknown) {
      const failure = this.classifyFailure(error, didTimeout);

      // Evidence, URIs, response bodies, and location are intentionally omitted.
      console.error("AI classification request failed", {
        kind: failure.kind,
        status: failure.status,
      });

      const reason =
        failure.kind === "timeout"
          ? "AI request timed out."
          : failure.kind === "http-client"
          ? failure.status === 422
            ? "AI service rejected the image upload (HTTP 422)."
            : `AI request was rejected (HTTP ${failure.status}).`
          : failure.kind === "http-server"
          ? "AI service is temporarily unavailable."
          : failure.kind === "network"
          ? "Network or browser connection to the AI service failed."
          : failure.kind === "malformed-response"
          ? "AI service returned an invalid response."
          : "AI classification failed.";

      return {
        label: "other",
        confidence: 0,
        status: "invalid",
        action: "uncertain",
        reason,
        caption: "Unable to classify the image.",
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private classifyFailure(
    error: unknown,
    didTimeout: boolean
  ): AIClassificationError {
    if (didTimeout) {
      return new AIClassificationError("timeout", "AI request timed out.");
    }

    if (error instanceof AIClassificationError) return error;

    if (error instanceof TypeError) {
      return new AIClassificationError(
        "network",
        "Network or CORS request failed."
      );
    }

    return new AIClassificationError("unknown", "AI classification failed.");
  }

  /** ✅ Convert API → internal standardized format */
  private transformAPIResponse(apiResult: Record<string, any>): ClassificationResult {
    return {
      label: this.mapLabelToType(apiResult.label),
      confidence: apiResult.confidence ?? 0,
      status: apiResult.status ?? "invalid",
      action: apiResult.action ?? "uncertain",
      reason: apiResult.reason ?? "",
      caption: apiResult.caption ?? "",
    };
  }

  /** ✅ FIXED — Road category properly handled */
  private mapLabelToType(label: string): ClassificationResult["label"] {
    const key = label?.toLowerCase();

    if (["fire"].includes(key)) return "fire";

    if (
      [
        "road",
        "accident",
        "collision",
        "vehicle_accident",
        "car_crash",
        "road_accident",
      ].includes(key)
    ) {
      return "road";
    }

    return "other";
  }

  /** ✅ Calculate priority level */
  getPriorityFromClassification(
    classification: ClassificationResult
  ): "low" | "medium" | "high" | "critical" {
    const { confidence, label } = classification;

    if (confidence > 0.9 && (label === "fire" || label === "road")) {
      return "critical";
    }

    if (confidence > 0.8) return "high";
    if (confidence > 0.6) return "medium";
    return "low";
  }

  /** ✅ Better readable text output */
  formatClassificationForDisplay(
    classification: ClassificationResult
  ): string {
    const map = {
      fire: "🔥 Fire Emergency",
      road: "🚗 Road Accident",
      other: "⚠️ Other Emergency",
    };

    return map[classification.label] ?? "⚠️ Emergency";
  }
}

export const aiClassificationService = new AIClassificationService();








// export interface ClassificationResult {
//   label: 'medical' | 'fire' | 'road' | 'crime' | 'natural' | 'other';
//   confidence: number;
//   status: 'valid' | 'invalid' ;
//   action: 'accept' | 'reject' | 'uncertain';
//   reason: string;
//   caption: string;
//   requiresManualVerification: boolean;
// }

// export interface EmergencyEvidence {
//   photos: string[];
//   video?: string;
//   timestamp: string;
//   location: { latitude: number; longitude: number } | null;
//   address: string | null;
// }

// class AIClassificationService {
//   private readonly API_ENDPOINT = process.env.AI_ENDPOINT_URL || 'https://jubilant-journey-69rgxr695v6r35jrp-8000.app.github.dev/predict'; 
//   private readonly CONFIDENCE_THRESHOLD = 0.75;
//   private readonly TIMEOUT = 30000; // 30 seconds

//   async classifyImage(imageUri: string): Promise<ClassificationResult> {
//     const controller = new AbortController();
//     const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

//     try {
//       // Prepare form data for your API
//       const formData = new FormData();
//       formData.append('file', {
//         uri: imageUri,
//         type: 'image/jpeg',
//         name: 'emergency.jpg',
//       } as any);

//       // Call your actual API endpoint
//       const response = await fetch(this.API_ENDPOINT, {
//         method: 'POST',
//         body: formData,
//         headers: {
//           // ⚠️ Do NOT manually set Content-Type when using FormData.
//           // fetch will handle proper multipart boundaries
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
//     } catch (error: any) {
//       clearTimeout(timeoutId);
//       console.error('AI Classification failed:', error);

//       // Check if it's a timeout/abort error
//       const isTimeoutError = error?.name === 'AbortError' || error?.message?.includes('aborted');
//       const isNetworkError = error?.message?.includes('Network') || error?.message?.includes('fetch');

//       // Return a "failed classification" result with appropriate reason
//       return {
//         label: 'other',
//         confidence: 0,
//         status: 'invalid',
//         action: 'uncertain',
//         reason: isTimeoutError 
//           ? 'Classification request timed out. Please try again or provide manual evidence.'
//           : isNetworkError
//           ? 'Network error. Please check your connection and try again.'
//           : 'Classification request failed. Manual review required.',
//         caption: 'Unable to classify image. Manual review required.',
//         requiresManualVerification: true,
//       };
//     }
//   }

//   private transformAPIResponse(apiResult: any): ClassificationResult {
//     const requiresManualVerification =
//       apiResult.confidence < this.CONFIDENCE_THRESHOLD ||
//       apiResult.action === 'reject' ||
//       apiResult.status === 'uncertain';

//     return {
//       label: this.mapLabelToType(apiResult.label),
//       confidence: apiResult.confidence ?? 0,
//       status: apiResult.status ?? 'invalid',
//       action: apiResult.action ?? 'reject',
//       reason: apiResult.reason ?? 'No reason provided',
//       caption: apiResult.caption ?? '',
//       requiresManualVerification,
//     };
//   }

//   private mapLabelToType(label: string): ClassificationResult['label'] {
//     const labelMap: Record<string, ClassificationResult['label']> = {
//       fire: 'fire',
//       medical: 'medical',
//       accident: 'road',
//       vehicle_accident: 'road',
//       crime: 'crime',
//       natural_disaster: 'natural',
//       flood: 'natural',
//       earthquake: 'natural',
//       other: 'other',
//     };

//     return labelMap[label?.toLowerCase()] || 'other';
//   }

//   async processEmergencyEvidence(evidence: EmergencyEvidence): Promise<{
//     classification: ClassificationResult;
//     evidenceProcessed: boolean;
//   }> {
//     try {
//       const primaryPhoto = evidence.photos[0] || '';
//       const classification = await this.classifyImage(primaryPhoto);

//       if (classification.action === 'reject' || classification.action === 'uncertain') {
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

//   getPriorityFromClassification(
//     classification: ClassificationResult
//   ): 'low' | 'medium' | 'high' | 'critical' {
//     if (
//       classification.confidence > 0.9 &&
//       (classification.label === 'fire' || classification.label === 'road')
//     ) {
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

//   formatClassificationForDisplay(classification: ClassificationResult): string {
//     const typeMap = {
//       fire: '🔥 Fire Emergency',
//       medical: '🚑 Medical Emergency',
//       road: '🚗 Accident',
//       crime: '🚔 Crime/Security',
//       natural: '🌊 Natural Disaster',
//       other: '⚠️ Other Emergency',
//     };

//     return typeMap[classification.label] || '⚠️ Emergency';
//   }
// }

// export const aiClassificationService = new AIClassificationService();

