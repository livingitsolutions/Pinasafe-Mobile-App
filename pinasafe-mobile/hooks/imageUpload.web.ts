import {
  AI_IMAGE_FILENAME,
  AI_IMAGE_MIME_TYPE,
  PreparedImageUpload,
} from "./imageUpload.types";

export async function prepareImageUpload(
  imageUri: string
): Promise<PreparedImageUpload> {
  const imageResponse = await fetch(imageUri);

  if (!imageResponse.ok) {
    throw new Error("Unable to read the selected image.");
  }

  const sourceBlob = await imageResponse.blob();
  const image = sourceBlob.type
    ? sourceBlob
    : sourceBlob.slice(0, sourceBlob.size, AI_IMAGE_MIME_TYPE);

  return { image, filename: AI_IMAGE_FILENAME };
}
