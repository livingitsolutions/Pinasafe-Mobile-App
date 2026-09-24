export const AI_IMAGE_FIELD_NAME = "file";
export const AI_IMAGE_MIME_TYPE = "image/jpeg";
export const AI_IMAGE_FILENAME = "emergency.jpg";

export interface NativeMultipartImage {
  uri: string;
  type: string;
  name: string;
}

export type MultipartImage = Blob | NativeMultipartImage;

export interface PreparedImageUpload {
  image: MultipartImage;
  filename?: string;
}
