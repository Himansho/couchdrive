import type os from 'node:os';
import { describe, expect, it } from 'vitest';
import { isPrivateIPv4, pickLanAddress } from '../electron/network';

const ipv4 = (address: string, internal = false) =>
  ({ address, family: 'IPv4', internal, netmask: '255.255.255.0', mac: '00:00:00:00:00:00', cidr: null }) as os.NetworkInterfaceInfo;
const ipv6 = (address: string) =>
  ({ address, family: 'IPv6', internal: false, netmask: 'ffff::', mac: '00:00:00:00:00:00', cidr: null, scopeid: 0 }) as os.NetworkInterfaceInfo;

describe('pickLanAddress', () => {
  it('prefers the WiFi adapter over virtual ones', () => {
    const { best, all } = pickLanAddress({
      'vEthernet (WSL)': [ipv4('172.20.16.1')],
      'Wi-Fi 3': [ipv6('fe80::1'), ipv4('192.168.31.106')],
      'Loopback Pseudo-Interface 1': [ipv4('127.0.0.1', true)],
    });
    expect(best).toEqual({ interfaceName: 'Wi-Fi 3', address: '192.168.31.106' });
    expect(all.map((a) => a.address)).toEqual(['192.168.31.106', '172.20.16.1']);
  });

  it('falls back to Ethernet when there is no WiFi', () => {
    const { best } = pickLanAddress({
      'VirtualBox Host-Only Network': [ipv4('192.168.56.1')],
      Ethernet: [ipv4('10.0.0.12')],
    });
    expect(best?.address).toBe('10.0.0.12');
  });

  it('finds the address a phone hotspot hands out', () => {
    expect(pickLanAddress({ 'Wi-Fi': [ipv4('10.163.48.21')] }).best?.address).toBe('10.163.48.21');
  });

  it('returns nothing when offline', () => {
    const { best, all } = pickLanAddress({
      'Wi-Fi': [ipv4('169.254.10.20'), ipv6('fe80::2')],
      'Loopback Pseudo-Interface 1': [ipv4('127.0.0.1', true)],
    });
    expect(best).toBeNull();
    expect(all).toEqual([]);
  });
});

describe('isPrivateIPv4', () => {
  it.each([
    ['10.0.0.1', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['192.168.1.5', true],
    ['172.32.0.1', false],
    ['169.254.1.1', false],
    ['8.8.8.8', false],
    ['127.0.0.1', false],
  ])('%s → %s', (address, expected) => {
    expect(isPrivateIPv4(address)).toBe(expected);
  });
});
