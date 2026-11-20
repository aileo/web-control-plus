import { CONSTS } from './clients/lego';
import type { RawDevice, RawHub } from './types';
import type { ServoDriver } from './virtual-servo';

const commandSpeed = 15;
// TachoMotor ROTATION is the encoder coordinate used by gotoAngle, not APOS.
const rotationMode = 2;

export default function makeServoDriver(
  hub: RawHub,
  device: RawDevice,
  current: () => boolean,
  markActive: () => void,
  recordMode: (mode: number) => void
): ServoDriver | undefined {
  if (
    hub.type === CONSTS.HubType.WEDO2_SMART_HUB ||
    typeof device.setSpeed !== 'function'
  )
    return undefined;
  const { gotoAngle, rotateByDegrees } = device;
  const check = (signal: AbortSignal) => {
    signal.throwIfAborted();
    if (!current()) throw new Error('Servo motor disconnected');
  };
  const complete = async (result: Promise<number> | undefined) => {
    if ((await result) !== CONSTS.CommandFeedback.EXECUTION_COMPLETED)
      throw new Error('Motor did not acknowledge a completed angle command');
  };
  const rotate =
    typeof rotateByDegrees === 'function'
      ? async (delta: number, signal: AbortSignal) => {
          check(signal);
          markActive();
          await complete(
            rotateByDegrees.call(
              device,
              Math.abs(delta),
              Math.sign(delta) * commandSpeed,
              true
            )
          );
        }
      : undefined;

  if (
    typeof gotoAngle === 'function' &&
    typeof device.requestUpdate === 'function'
  ) {
    return {
      kind: 'absolute',
      rotate,
      origin: (signal) => {
        check(signal);
        let clean = () => {};
        const pending = new Promise<number>((resolve, reject) => {
          const aborted = () => {
            reject(signal.reason);
          };
          const received = ({ degrees }: { degrees: number }) => {
            resolve(degrees);
          };
          clean = () => {
            device.removeListener('rotate', received);
            signal.removeEventListener('abort', aborted);
          };
          device.on('rotate', received);
          signal.addEventListener('abort', aborted, { once: true });
          Promise.resolve()
            .then(() => {
              check(signal);
              recordMode(rotationMode);
              return hub.subscribe(device.portId, device.type, rotationMode);
            })
            .then(() => {
              check(signal);
              device.requestUpdate?.();
            })
            .catch(reject);
        });
        return pending.finally(clean);
      },
      gotoAngle: async (target, signal) => {
        check(signal);
        markActive();
        await complete(gotoAngle.call(device, target, commandSpeed, true));
      },
    };
  }
  return rotate ? { kind: 'relative', rotate } : undefined;
}
