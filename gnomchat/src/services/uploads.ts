import { config } from '@/config';
import { ensureFreshVoceChatToken } from '@/services/session';

// VoceChat file upload flow (mirrors the VoceChat web client):
//   1) POST /api/resource/file/prepare { content_type, filename }  -> file_id (text)
//   2) POST /api/resource/file/upload  (multipart: file_id, chunk_data, chunk_is_last)
//      -> { path, size, hash } on the last chunk
// We upload the whole file as a single chunk (chunk_is_last=true), which is fine
// for the photo/file sizes a phone produces.

export interface UploadedFile {
  path: string;
  size: number;
  contentType: string;
  name: string;
  width?: number;
  height?: number;
}

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  width?: number;
  height?: number;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await ensureFreshVoceChatToken();
  if (!token) throw new Error('Not authenticated');
  return { 'X-API-Key': token };
}

async function prepareUpload(contentType: string, filename: string): Promise<string> {
  const res = await fetch(`${config.vocechatHost}/api/resource/file/prepare`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_type: contentType, filename }),
  });
  if (!res.ok) throw new Error(`prepare failed: HTTP ${res.status}`);
  const text = (await res.text()).trim();
  // file_id may come back as a raw token or a JSON-quoted string.
  return text.startsWith('"') ? (JSON.parse(text) as string) : text;
}

/** Uploads a picked file and returns its stored path + metadata. */
export async function uploadFile(file: PickedFile): Promise<UploadedFile> {
  const contentType = file.mimeType || 'application/octet-stream';
  const fileId = await prepareUpload(contentType, file.name);

  const form = new FormData();
  form.append('file_id', fileId);
  // React Native FormData file part: { uri, name, type }.
  form.append('chunk_data', { uri: file.uri, name: file.name, type: contentType } as unknown as Blob);
  form.append('chunk_is_last', 'true');

  const res = await fetch(`${config.vocechatHost}/api/resource/file/upload`, {
    method: 'POST',
    headers: await authHeaders(), // let fetch set the multipart boundary
    body: form,
  });
  if (!res.ok) throw new Error(`upload failed: HTTP ${res.status}`);

  const { path, size } = (await res.json()) as { path: string; size: number; hash?: string };
  return {
    path,
    size: size ?? file.size ?? 0,
    contentType,
    name: file.name,
    width: file.width,
    height: file.height,
  };
}
