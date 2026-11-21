import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

export type PickedImage = { uri: string; dataUrl: string; width: number; height: number; base64: string; mimetype: string };

/** Picks a photo (library or camera), scales it down and returns it as a JPEG data URL. */
export async function pickImage({ camera = false, maxSize = 1600, quality = 0.8 } = {}): Promise<PickedImage | null> {
  const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error(camera ? 'GnomChat har ikke tilgang til kameraet.' : 'GnomChat har ikke tilgang til bildene dine.');
  const result = camera
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled || !result.assets[0]) return null;
  return resizeImage(result.assets[0].uri, result.assets[0].width, result.assets[0].height, maxSize, quality);
}

export async function resizeImage(uri: string, width: number, height: number, maxSize = 1600, quality = 0.8): Promise<PickedImage> {
  const scale = Math.min(1, maxSize / Math.max(width || maxSize, height || maxSize));
  const actions = scale < 1 ? [{ resize: { width: Math.round(width * scale), height: Math.round(height * scale) } }] : [];
  const out = await ImageManipulator.manipulateAsync(uri, actions, { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  return { uri: out.uri, width: out.width, height: out.height, base64: out.base64 ?? '', mimetype: 'image/jpeg', dataUrl: `data:image/jpeg;base64,${out.base64}` };
}
