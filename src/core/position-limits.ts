// One instance belongs to one live position reference. Never restore it from
// persisted data; invalidate it when that reference or connection is lost.
export default class PositionLimits {
  private left: number | null = null;

  private right: number | null = null;

  private valid = true;

  captureLeft(position: number): void {
    this.assertValid();
    this.left = null;
    this.right = null;
    if (!Number.isFinite(position)) throw new Error('Invalid left endpoint');
    this.left = position;
  }

  captureRight(position: number): void {
    this.assertValid();
    if (
      this.left === null ||
      this.right !== null ||
      !Number.isFinite(position) ||
      position <= this.left
    ) {
      this.left = null;
      this.right = null;
      throw new Error('Invalid right endpoint');
    }
    this.right = position;
  }

  clamp(position: number): number {
    this.assertValid();
    if (this.left === null || this.right === null)
      throw new Error('Position limits are not calibrated');
    if (!Number.isFinite(position)) throw new Error('Invalid position target');
    return Math.max(this.left, Math.min(this.right, position));
  }

  endpoints(): { left: number; right: number } {
    this.assertValid();
    if (this.left === null || this.right === null)
      throw new Error('Position limits are not calibrated');
    return { left: this.left, right: this.right };
  }

  invalidate(): void {
    this.left = null;
    this.right = null;
    this.valid = false;
  }

  private assertValid(): void {
    if (!this.valid) throw new Error('Position reference is no longer valid');
  }
}
