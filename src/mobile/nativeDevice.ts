import { Capacitor } from '@capacitor/core';
import {
  Camera,
  CameraResultType,
  CameraSource,
  type GalleryPhoto,
  type Photo,
} from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';

type CameraFileSource = Pick<Photo, 'webPath' | 'path' | 'format'> | Pick<GalleryPhoto, 'webPath' | 'path' | 'format'>;

export type DevicePosition = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

function nativePluginAvailable(name: string) {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(name);
}

export function hasNativeCamera() {
  return nativePluginAvailable('Camera');
}

export function hasNativeGeolocation() {
  return nativePluginAvailable('Geolocation');
}

function extensionFor(format: string | undefined, mime: string) {
  const normalized = String(format ?? '').trim().toLowerCase();
  if (normalized === 'jpg' || normalized === 'jpeg') return 'jpg';
  if (normalized === 'png') return 'png';
  if (normalized === 'heic' || normalized === 'heif') return 'heic';
  if (mime.includes('png')) return 'png';
  if (mime.includes('heic') || mime.includes('heif')) return 'heic';
  return 'jpg';
}

async function nativePhotoToFile(
  photo: CameraFileSource,
  prefix: string,
  index = 0,
): Promise<File> {
  const uri =
    photo.webPath ||
    (photo.path ? Capacitor.convertFileSrc(photo.path) : '');

  if (!uri) {
    throw new Error('Fotoğraf dosyası okunamadı.');
  }

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Fotoğraf dosyası açılamadı.');
  }

  const blob = await response.blob();
  const format = String(photo.format ?? '').trim().toLowerCase();
  const mime =
    blob.type ||
    (format === 'png'
      ? 'image/png'
      : format === 'heic' || format === 'heif'
        ? 'image/heic'
        : 'image/jpeg');

  const extension = extensionFor(format, mime);
  const timestamp = Date.now();

  return new File(
    [blob],
    `${prefix}-${timestamp}-${index + 1}.${extension}`,
    {
      type: mime,
      lastModified: timestamp,
    },
  );
}

export async function takeNativePhotoFile(): Promise<File> {
  if (!hasNativeCamera()) {
    throw new Error('Native kamera kullanılamıyor.');
  }

  const photo = await Camera.getPhoto({
    source: CameraSource.Camera,
    resultType: CameraResultType.Uri,
    quality: 88,
    allowEditing: false,
    saveToGallery: false,
    correctOrientation: true,
  });

  return nativePhotoToFile(photo, 'tarla');
}

export async function pickNativeImageFiles(limit = 3): Promise<File[]> {
  if (!hasNativeCamera()) {
    throw new Error('Native fotoğraf seçici kullanılamıyor.');
  }

  const result = await Camera.pickImages({
    quality: 88,
    limit: Math.max(1, Math.min(10, Math.round(limit))),
  });

  return Promise.all(
    result.photos.map((photo, index) =>
      nativePhotoToFile(photo, 'galeri', index),
    ),
  );
}

export function isNativePickerCancellation(error: unknown) {
  const message = String(
    error instanceof Error ? error.message : error ?? '',
  ).toLowerCase();

  return (
    message.includes('cancel') ||
    message.includes('cancelled') ||
    message.includes('canceled')
  );
}

export async function getCurrentDevicePosition(): Promise<DevicePosition> {
  if (!hasNativeGeolocation()) {
    throw new Error('Native konum servisi kullanılamıyor.');
  }

  const currentPermission = await Geolocation.checkPermissions();

  if (currentPermission.location !== 'granted') {
    const requested = await Geolocation.requestPermissions({
      permissions: ['location'],
    });

    if (requested.location !== 'granted') {
      const denied = new Error('Konum izni verilmedi.');
      denied.name = 'LocationPermissionDenied';
      throw denied;
    }
  }

  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 15000,
  });

  return {
    latitude: Number(position.coords.latitude),
    longitude: Number(position.coords.longitude),
    accuracy: Math.max(0, Number(position.coords.accuracy) || 0),
  };
}

export function isLocationPermissionDenied(error: unknown) {
  if (error instanceof Error && error.name === 'LocationPermissionDenied') {
    return true;
  }

  const message = String(
    error instanceof Error ? error.message : error ?? '',
  ).toLowerCase();

  return message.includes('permission') || message.includes('denied') || message.includes('izin');
}
