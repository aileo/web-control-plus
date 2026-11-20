// Only an adapter explicitly verified for a particular connection may supply
// this interface. The operation must honor abort before starting motion.
export type PositionDriver = {
  referenceValid: () => boolean;
  onReferenceLost: (listener: () => void) => () => void;
  absoluteAngle: {
    min: number;
    max: number;
    readPosition: (signal: AbortSignal) => Promise<number>;
    gotoAngle: (degrees: number, signal: AbortSignal) => Promise<void>;
  };
  finiteAngle?: {
    minDegrees: number;
    maxDegrees: number;
  };
  stop: () => Promise<void>;
};

export type PositionState = {
  servoReference?: symbol;
  active: boolean;
  target: number | null;
  fraction: number | null;
  error: string | null;
};

// Feedback and commands must share the same verified, non-wrapping reference.
export function hasAbsoluteAngle(driver?: PositionDriver): boolean {
  const range = driver?.absoluteAngle;
  return Boolean(
    range &&
    Number.isSafeInteger(range.min) &&
    Number.isSafeInteger(range.max) &&
    range.min < range.max &&
    typeof range.readPosition === 'function' &&
    typeof range.gotoAngle === 'function' &&
    typeof driver?.stop === 'function' &&
    typeof driver.onReferenceLost === 'function' &&
    driver?.referenceValid()
  );
}

export default class PositionMotor {
  private controller: AbortController | null = null;

  private generation = 0;

  private disposed = false;

  private referenceLost = false;

  private stops = new Set<Promise<void>>();

  private unsubscribe: () => void;

  private driver: PositionDriver;

  private current: () => boolean;

  private publish: (state: PositionState) => void;

  private state: PositionState = {
    active: false,
    target: null,
    fraction: null,
    error: null,
  };

  constructor(
    driver: PositionDriver,
    current: () => boolean,
    publish: (state: PositionState) => void,
    referenceLost: () => void = () => {}
  ) {
    this.driver = driver;
    this.current = current;
    this.publish = publish;
    this.unsubscribe = driver.onReferenceLost(() => {
      this.referenceLost = true;
      this.invalidate();
      this.stop().catch((error: unknown) => this.failure(error));
      referenceLost();
    });
  }

  snapshot(): PositionState {
    return { ...this.state };
  }

  private set(changes: Partial<PositionState>): void {
    this.state = { ...this.state, ...changes };
    if (!this.disposed) this.publish(this.snapshot());
  }

  private check(generation: number): void {
    if (
      this.disposed ||
      this.referenceLost ||
      generation !== this.generation ||
      !this.current() ||
      !hasAbsoluteAngle(this.driver)
    )
      throw new Error('Position reference or connection lost');
  }

  private failure(error: unknown): void {
    this.set({
      error:
        error instanceof Error ? error.message : 'Position operation failed',
    });
  }

  private invalidate(): void {
    this.set({ target: null, fraction: null });
  }

  private async stopDriver(): Promise<void> {
    const pending = Promise.resolve().then(() => this.driver.stop());
    this.stops.add(pending);
    pending.then(
      () => this.stops.delete(pending),
      () => this.stops.delete(pending)
    );
    await Promise.all([...this.stops]);
  }

  async stop(): Promise<void> {
    this.generation += 1;
    const { generation } = this;
    this.controller?.abort();
    this.controller = null;
    try {
      await this.stopDriver();
      if (generation === this.generation) this.set({ active: false });
    } catch (error) {
      this.failure(error);
      throw error;
    }
  }

  async moveFraction(fraction: number): Promise<void> {
    if (!Number.isFinite(fraction)) throw new Error('Invalid position target');
    const bounded = Math.max(0, Math.min(1, fraction));
    await this.move((_position, min, max) => min + (max - min) * bounded);
  }

  async moveStep(degrees: number): Promise<void> {
    const capability = this.driver.finiteAngle;
    if (
      !capability ||
      !Number.isFinite(capability.minDegrees) ||
      !Number.isFinite(capability.maxDegrees) ||
      capability.minDegrees <= 0 ||
      capability.maxDegrees < capability.minDegrees ||
      !Number.isFinite(degrees) ||
      Math.abs(degrees) < capability.minDegrees ||
      Math.abs(degrees) > capability.maxDegrees
    )
      throw new Error('Unsupported step angle');
    await this.move((position) => position + degrees);
  }

  private async move(
    resolveTarget: (position: number, min: number, max: number) => number
  ): Promise<void> {
    this.check(this.generation);
    const pendingStop = this.stop();
    const { generation } = this;
    await pendingStop;
    this.check(generation);
    const controller = new AbortController();
    this.controller = controller;
    this.set({ active: true, error: null });
    let abort: () => void = () => undefined;
    let feedbackDeadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const interrupted = new Promise<never>((_, reject) => {
        abort = () => reject(new Error('Position operation cancelled'));
        controller.signal.addEventListener('abort', abort, { once: true });
      });
      const { absoluteAngle } = this.driver;
      const { min, max } = absoluteAngle;
      const feedbackTimeout = new Promise<never>((_, reject) => {
        feedbackDeadline = setTimeout(
          () => reject(new Error('Absolute angle feedback timed out')),
          5000
        );
      });
      const position = await Promise.race([
        absoluteAngle.readPosition(controller.signal),
        interrupted,
        feedbackTimeout,
      ]);
      clearTimeout(feedbackDeadline);
      this.check(generation);
      if (
        absoluteAngle !== this.driver.absoluteAngle ||
        min !== absoluteAngle.min ||
        max !== absoluteAngle.max
      )
        throw new Error('Verified absolute angle range changed');
      if (!Number.isFinite(position) || position < min || position > max)
        throw new Error(
          'Position feedback is outside the verified angle range'
        );
      const target = Math.max(
        min,
        Math.min(max, Math.round(resolveTarget(position, min, max)))
      );
      this.set({ target, fraction: (target - min) / (max - min) });
      await Promise.race([
        absoluteAngle.gotoAngle(target, controller.signal),
        interrupted,
      ]);
      this.check(generation);
      this.set({ active: false });
    } catch (error) {
      if (generation === this.generation) {
        await this.stop();
        this.failure(error);
      }
      throw error;
    } finally {
      clearTimeout(feedbackDeadline);
      controller.signal.removeEventListener('abort', abort);
      if (this.controller === controller) this.controller = null;
    }
  }

  async dispose(): Promise<void> {
    this.invalidate();
    this.unsubscribe();
    this.disposed = true;
    await this.stop();
  }
}
