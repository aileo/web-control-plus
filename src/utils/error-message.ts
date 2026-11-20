// Convert an unknown failure value into a user-displayable message.
export default function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
