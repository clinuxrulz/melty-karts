import { Accessor, createMemo, createRoot, getOwner, getObserver, onCleanup, runWithOwner } from "solid-js";

export function createRcMemo<T>(
  calc: (prev: T) => T,
  value: T,
): Accessor<T>;

export function createRcMemo<T>(
  calc: (prev: T | undefined) => T,
  value?: undefined,
): Accessor<T>;

export function createRcMemo<T>(
  calc: (prev: T | undefined) => T,
  value?: T,
): Accessor<T> {
  let existing:
    | {
        memo: Accessor<T>;
        dispose: () => void;
        refCount: number;
      }
    | undefined = undefined;
  let lastSeenValue: T | undefined = value;
  // For capturing context
  const owner = getOwner();
  //
  return () => {
    if (getObserver() === null) {
      if (existing === undefined) {
        return calc(undefined);
      } else {
        return existing.memo();
      }
    } else {
      if (existing === undefined) {
        runWithOwner(owner, () => {
          existing = createRoot(dispose => {
            return {
              memo: createMemo(
                () => {
                  let result = calc(lastSeenValue);
                  lastSeenValue = result;
                  return result;
                },
              ),
              dispose,
              refCount: 1,
            };
          });
        });
      } else {
        existing.refCount++;
      }
      let existing2 = existing!;
      onCleanup(() => {
        existing2.refCount--;
        if (existing2.refCount === 0) {
          queueMicrotask(() => {
            if (existing2.refCount === 0) {
              existing2.dispose();
              existing = undefined;
            }
          });
        }
      });
      return existing2.memo();
    }
  };
}
