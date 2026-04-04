export type ImageSlot = {
  slot: number;
  version?: string;
  hash?: Uint8Array;
  bootable?: boolean;
  pending?: boolean;
  confirmed?: boolean;
  active?: boolean;
  permanent?: boolean;
};

export type ImageInfo = {
  version: string;
  imageSize: number;
  hash: string;
};

export type UploadProgress = {
  percentage: number;
};
