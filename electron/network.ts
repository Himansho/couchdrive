import os from 'node:os';
import type { LanAddress } from '../shared/types';

const WIFI = /wi-?fi|wlan|wireless/i;
const VIRTUAL =
  /vethernet|virtual|vmware|vbox|hyper-v|wsl|docker|loopback|pseudo|bluetooth|tailscale|zerotier|hamachi|radmin|vpn|wireguard|tap-|tun/i;

/** 10.x, 172.16–31.x and 192.168.x: the ranges home routers and phone hotspots hand out. */
export function isPrivateIPv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * Finds the laptop's WiFi address (PRD D3). Prefers adapters named like WiFi,
 * then Ethernet, then anything else; virtual adapters (WSL, VPN, Hyper-V) come last.
 */
export function pickLanAddress(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces()): {
  best: LanAddress | null;
  all: LanAddress[];
} {
  const all: LanAddress[] = [];
  for (const [interfaceName, infos] of Object.entries(interfaces)) {
    for (const info of infos ?? []) {
      if (info.family === 'IPv4' && !info.internal && isPrivateIPv4(info.address)) {
        all.push({ interfaceName, address: info.address });
      }
    }
  }
  all.sort((x, y) => rank(y.interfaceName) - rank(x.interfaceName));
  return { best: all[0] ?? null, all };
}

function rank(interfaceName: string): number {
  if (VIRTUAL.test(interfaceName)) return 0;
  if (WIFI.test(interfaceName)) return 3;
  if (/ethernet/i.test(interfaceName)) return 2;
  return 1;
}
