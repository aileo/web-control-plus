import type { DeviceInfo, HubInfo } from './types';

type HubSignature = Pick<HubInfo, 'type'>;
type SignatureDevices = ReadonlyMap<string, Pick<DeviceInfo, 'type'>>;
type HubMap = ReadonlyMap<string, HubInfo>;
type DeviceInventory = ReadonlyMap<string, ReadonlyMap<string, DeviceInfo>>;

// Build a stable signature from a hub's connected device ports and types.
function deviceSignature(devices: SignatureDevices): string[] {
  return [...devices]
    .filter(([port, device]) => port.trim().length > 0 && device.type.num !== 0)
    .map(([port, device]) => JSON.stringify([port, device.type.num]))
    .sort();
}

// Compare hub models and device inventories to identify the same physical hub.
export function hasSameHubSignature(
  firstHub: HubSignature,
  firstDevices: SignatureDevices,
  secondHub: HubSignature,
  secondDevices: SignatureDevices
): boolean {
  if (firstHub.type.num !== secondHub.type.num) return false;
  const first = deviceSignature(firstDevices);
  const second = deviceSignature(secondDevices);
  return (
    first.length === second.length &&
    first.every((device, index) => device === second[index])
  );
}

// Find disconnected hubs that match a newly connected hub's inventory.
export function matchingOfflineHubUuids(
  newUuid: string,
  hubs: HubMap,
  devices: DeviceInventory
): string[] {
  const newHub = hubs.get(newUuid);
  const inventory = devices.get(newUuid);
  if (!newHub?.online || !inventory) return [];
  const newDevices = new Map(
    [...inventory].filter(([, device]) => device.connected)
  );
  return [...hubs.values()]
    .filter((candidate) => {
      if (candidate.uuid === newUuid || candidate.online) return false;
      const candidateDevices = devices.get(candidate.uuid) || new Map();
      if ([...candidateDevices.values()].some((device) => device.connected))
        return false;
      return hasSameHubSignature(
        candidate,
        candidateDevices,
        newHub,
        newDevices
      );
    })
    .map((candidate) => candidate.uuid);
}
