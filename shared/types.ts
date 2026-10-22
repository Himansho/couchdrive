/** A LAN address the laptop could share on. */
export interface LanAddress {
  interfaceName: string;
  address: string;
}

/** What the desktop window shows. Sent from the main process over IPC. */
export interface ShareState {
  status: 'starting' | 'running' | 'no-network' | 'error';
  defaultPort: number;
  /** Full URL with the token, as encoded in the QR code. */
  url?: string;
  qrDataUrl?: string;
  host?: string;
  port?: number;
  interfaceName?: string;
  /** Other private addresses on this laptop, in case the wrong adapter was picked. */
  otherAddresses: LanAddress[];
  video: { name: string; size: number; isSample: boolean };
  error?: string;
}

/** API the preload script exposes to the desktop window as `window.couchdrive`. */
export interface CouchdriveApi {
  getState(): Promise<ShareState>;
  onState(callback: (state: ShareState) => void): void;
  restartSharing(): Promise<void>;
  chooseVideo(): Promise<void>;
  copyUrl(): Promise<void>;
}

/** Milestone 1 spike: one file the phone test page offers for download. */
export interface SpikeDownload {
  id: string;
  label: string;
  name: string;
  size: number;
  note?: string;
}

/** Milestone 1 spike: what `GET /spike/info` returns to the phone test page. */
export interface SpikeInfo {
  video: { name: string; size: number; version: string };
  downloads: SpikeDownload[];
}
