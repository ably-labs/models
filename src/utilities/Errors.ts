import toString from 'lodash/toString';

export function toError(err: any) {
  return err instanceof Error ? err : new Error(toString(err));
}
