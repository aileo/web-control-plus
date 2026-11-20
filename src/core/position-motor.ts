import PositionLimits from './position-limits.ts';

export type Endpoint = 'left' | 'right';

// Only an adapter explicitly verified for a particular connection may supply
// this interface. The operation must honor abort before starting motion.
export type PositionDriver = {
  referenceValid: () => boolean;
  onReferenceLost: (listener: () => void) => () => void;
  seekEndpoint: (
    endpoint: Endpoint,
    options: { signal: AbortSignal; maxPower: number; maxDurationMs: number }
  ) => Promise<{ kind: 'endpoint'; position: number }>;
  moveTo: (position: number, signal: AbortSignal) => Promise<void>;
  stop: () => Promise<void>;
};

export type PositionState = {
  stage: 'uncalibrated' | 'left' | 'right' | 'ready';
  active: boolean;
  target: number | null;
  fraction: number | null;
  error: string | null;
};

const maxDurationMs = 5000;
const maxPower = 15;

export default class PositionMotor {
  private limits = new PositionLimits();

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
    stage: 'uncalibrated',
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
      !this.driver.referenceValid()
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
    this.limits.invalidate();
    this.set({ stage: 'uncalibrated', target: null, fraction: null });
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
    if (this.state.stage === 'left' || this.state.stage === 'right') {
      this.limits = new PositionLimits();
      this.set({ stage: 'uncalibrated' });
    }
    try {
      await this.stopDriver();
      if (generation === this.generation) this.set({ active: false });
    } catch (error) {
      this.failure(error);
      throw error;
    }
  }

  async calibrate(): Promise<void> {
    this.limits = new PositionLimits();
    this.set({ stage: 'uncalibrated', target: null, fraction: null });
    const pendingStop = this.stop();
    const { generation } = this;
    await pendingStop;
    this.check(generation);
    const controller = new AbortController();
    this.controller = controller;
    this.set({ stage: 'left', active: true, target: null, error: null });
    try {
      // Mechanical endpoints must be measured sequentially.
      // eslint-disable-next-line no-restricted-syntax
      for (const endpoint of ['left', 'right'] as const) {
        this.check(generation);
        this.set({ stage: endpoint });
        let timer: ReturnType<typeof setTimeout>;
        let abort: () => void = () => undefined;
        const interrupted = new Promise<never>((_, reject) => {
          abort = () => reject(new Error('Position operation cancelled'));
          controller.signal.addEventListener('abort', abort, { once: true });
          timer = setTimeout(() => {
            reject(new Error('Endpoint detection timed out'));
            controller.abort();
          }, maxDurationMs);
        });
        let result: { kind: 'endpoint'; position: number };
        try {
          // eslint-disable-next-line no-await-in-loop
          result = await Promise.race([
            this.driver.seekEndpoint(endpoint, {
              signal: controller.signal,
              maxPower,
              maxDurationMs,
            }),
            interrupted,
          ]);
        } finally {
          clearTimeout(timer!);
          controller.signal.removeEventListener('abort', abort);
        }
        this.check(generation);
        if (result.kind !== 'endpoint' || !Number.isFinite(result.position))
          throw new Error('Endpoint detection failed');
        // eslint-disable-next-line no-await-in-loop
        await this.stopDriver();
        this.check(generation);
        if (endpoint === 'left') this.limits.captureLeft(result.position);
        else this.limits.captureRight(result.position);
      }
      this.set({ stage: 'ready', active: false });
    } catch (error) {
      if (generation === this.generation) {
        this.limits = new PositionLimits();
        this.set({ stage: 'uncalibrated', active: false });
        controller.abort();
        try {
          await this.stopDriver();
        } catch (stopError) {
          this.failure(stopError);
          throw stopError;
        }
        this.failure(error);
      }
      throw error;
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  async moveFraction(fraction: number): Promise<void> {
    if (!Number.isFinite(fraction)) throw new Error('Invalid position target');
    const { left, right } = this.limits.endpoints();
    const target = this.limits.clamp(left + (right - left) * fraction);
    const pendingStop = this.stop();
    const { generation } = this;
    await pendingStop;
    this.check(generation);
    const controller = new AbortController();
    this.controller = controller;
    this.set({
      active: true,
      target,
      fraction: Math.max(0, Math.min(1, fraction)),
      error: null,
    });
    let abort: () => void = () => undefined;
    try {
      const interrupted = new Promise<never>((_, reject) => {
        abort = () => reject(new Error('Position operation cancelled'));
        controller.signal.addEventListener('abort', abort, { once: true });
      });
      await Promise.race([
        this.driver.moveTo(target, controller.signal),
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
