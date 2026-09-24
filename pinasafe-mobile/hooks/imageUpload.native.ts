import {
  AI_IMAGE_FILENAME,
  AI_IMAGE_MIME_TYPE,
  PreparedImageUpload,
} from "./imageUpload.types";

export async function prepareImageUpload(
  imageUri: string
): Promise<PreparedImageUpload> {
  return {
    image: {
      uri: imageUri,
      type: AI_IMAGE_MIME_TYPE,
      name: AI_IMAGE_FILENAME,
    },
  };
}
