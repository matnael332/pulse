// Ask the server again every few seconds while something is under way; pause while the tab is
// hidden, stop once it is done.
import { useEffect, useRef, useState } from "react";

export const POLL = { ms: 2000 };

export function usePoll<T>(
  load: () => Promise<T>,
  keepGoing: (value: T) => boolean,
  key: string = "",
) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  const keepRef = useRef(keepGoing);
  loadRef.current = load;
  keepRef.current = keepGoing;

  useEffect(() => {
    setValue(null); // another thing to follow (``key``): forget the last one's state
  }, [key]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function step() {
      if (document.hidden) {
        timer = setTimeout(step, POLL.ms);
        return;
      }
      try {
        const next = await loadRef.current();
        if (cancelled) return;
        setValue(next);
        setError(null);
        if (keepRef.current(next)) timer = setTimeout(step, POLL.ms);
      } catch (caught) {
        if (!cancelled) setError(caught);
      }
    }
    void step();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tick, key]);

  return { value, error, reload: () => setTick((n) => n + 1), setValue };
}
