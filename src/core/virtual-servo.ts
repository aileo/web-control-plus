import { validServoBounds, type ServoBounds } from './servo-bounds.ts';
import type { PositionState } from './position-motor.ts';

type AngleCommand = (degrees: number, signal: AbortSignal) => Promise<void>;

// node-poweredup normalizes gotoAngle targets outside this integer range.
const absoluteMin = -180;
const absoluteMax = 179;

export type ServoDriver =
  | {
      kind: 'absolute';
      origin: (signal: AbortSignal) => Promise<number>;
      gotoAngle: AngleCommand;
      rotate?: AngleCommand;
    }
  | { kind: 'relative'; rotate: AngleCommand };

export default class VirtualServo {
  private operation: AbortController | null = null;

  private zero: number | null = null;

  private reference = Symbol('Servo zero');

  private requested = 0;

  private disposed = false;

  lastMoveOwner: string | null = null;

  private readonly driver: ServoDriver;

  private readonly current: () => boolean;

  private readonly publish: (state: PositionState) => void;

  get hasReference(): boolean {
    return this.zero !== null;
  }

  constructor(
    driver: ServoDriver,
    current: () => boolean,
    publish: (state: PositionState) => void
  ) {
    this.driver = driver;
    this.current = current;
    this.publish = publish;
  }

  private update(active: boolean, requested = this.requested): void {
    this.publish({
      servoReference: this.reference,
      active,
      target: this.zero === null ? null : requested,
      fraction: null,
      error: null,
    });
  }

  private async run(
    action: (signal: AbortSignal) => Promise<void>
  ): Promise<void> {
    if (this.operation) throw new Error('Servo operation is in progress');
    if (this.disposed || !this.current())
      throw new Error('Servo connection lost');
    const controller = new AbortController();
    this.operation = controller;
    const { signal } = controller;
    const cancel = () => controller.abort();
    let timer: ReturnType<typeof setTimeout>;
    const interrupted = new Promise<never>((_, reject) => {
      signal.addEventListener(
        'abort',
        () => reject(new Error('Servo operation cancelled')),
        { once: true }
      );
      timer = setTimeout(() => {
        reject(
          new Error('Servo operation timed out; stop and reactivate Servo')
        );
        cancel();
      }, 10000);
    });
    try {
      this.update(true);
      await Promise.race([action(signal), interrupted]);
      signal.throwIfAborted();
      if (!this.current()) throw new Error('Servo connection lost');
    } catch (error) {
      if (this.operation === controller) this.zero = null;
      throw error;
    } finally {
      clearTimeout(timer!);
      if (this.operation === controller) {
        this.operation = null;
        this.update(false);
      }
    }
  }

  async activate(): Promise<void> {
    await this.run(async (signal) => {
      const { driver } = this;
      const zero = driver.kind === 'absolute' ? await driver.origin(signal) : 0;
      signal.throwIfAborted();
      if (
        !Number.isInteger(zero) ||
        (driver.kind === 'absolute' &&
          (zero < absoluteMin || zero > absoluteMax))
      )
        throw new Error('Servo zero is outside the absolute command range');
      this.zero = zero;
      this.reference = Symbol('Servo zero');
      this.requested = 0;
      this.lastMoveOwner = null;
    });
  }

  async moveFraction(fraction: number, bounds: ServoBounds): Promise<void> {
    if (!Number.isFinite(fraction)) throw new Error('Invalid Servo target');
    const { servoMin, servoMax } = bounds;
    await this.moveDegrees(
      servoMin + (servoMax - servoMin) * Math.max(0, Math.min(1, fraction)),
      bounds
    );
  }

  async moveStep(degrees: number): Promise<void> {
    if (
      !Number.isFinite(degrees) ||
      Math.abs(degrees) < 1 ||
      Math.abs(degrees) > 0x7fffffff
    )
      throw new Error('Unsupported step angle');
    const delta = Math.sign(degrees) * Math.round(Math.abs(degrees));
    await this.run(async (signal) => {
      const { driver } = this;
      if (driver.rotate) {
        await driver.rotate(delta, signal);
        return;
      }
      if (driver.kind !== 'absolute')
        throw new Error('Step angle command is unavailable');
      const position = await driver.origin(signal);
      signal.throwIfAborted();
      if (
        !Number.isInteger(position) ||
        position < absoluteMin ||
        position > absoluteMax
      )
        throw new Error('Step position is outside the absolute command range');
      const target = Math.max(
        absoluteMin,
        Math.min(absoluteMax, position + delta)
      );
      if (target !== position) await driver.gotoAngle(target, signal);
    });
  }

  async moveDegrees(degrees: number, bounds: ServoBounds): Promise<void> {
    if (!Number.isFinite(degrees)) throw new Error('Invalid Servo target');
    const { zero } = this;
    if (zero === null)
      throw new Error('Select Servo again to reset virtual zero');
    const { servoMin, servoMax } = bounds;
    if (!validServoBounds(servoMin, servoMax))
      throw new Error('Configure valid Servo bounds first');
    const requested = Math.round(
      Math.max(servoMin, Math.min(servoMax, degrees))
    );
    const target =
      this.driver.kind === 'absolute'
        ? Math.max(absoluteMin - zero, Math.min(absoluteMax - zero, requested))
        : requested;
    await this.run(async (signal) => {
      const { driver } = this;
      this.update(true, target);
      if (target !== this.requested) {
        if (driver.kind === 'absolute')
          await driver.gotoAngle(zero + target, signal);
        else await driver.rotate(target - this.requested, signal);
      }
      signal.throwIfAborted();
      this.requested = target;
    });
  }

  async stop(invalidate = false): Promise<void> {
    if (invalidate || this.operation) this.zero = null;
    this.lastMoveOwner = null;
    this.operation?.abort();
    this.operation = null;
    this.update(false);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.stop(true);
  }
}
