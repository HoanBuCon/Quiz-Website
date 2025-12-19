import { useState, useCallback } from 'react';

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export function useUndoRedo<T>(initialState: T) {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: []
  });

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const undo = useCallback(() => {
    setHistory(curr => {
      if (curr.past.length === 0) return curr;

      const previous = curr.past[curr.past.length - 1];
      const newPast = curr.past.slice(0, curr.past.length - 1);

      return {
        past: newPast,
        present: previous,
        future: [curr.present, ...curr.future]
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory(curr => {
      if (curr.future.length === 0) return curr;

      const next = curr.future[0];
      const newFuture = curr.future.slice(1);

      return {
        past: [...curr.past, curr.present],
        present: next,
        future: newFuture
      };
    });
  }, []);

  const set = useCallback((newState: T | ((prev: T) => T)) => {
    setHistory(curr => {
      // Handle functional update
      const nextState =
        typeof newState === "function"
          ? (newState as (prev: T) => T)(curr.present)
          : newState;

      if (curr.present === nextState) return curr;
      
      return {
        past: [...curr.past, curr.present],
        present: nextState,
        future: []
      };
    });
  }, []);

  // Update present without adding to history (for transient updates if needed, though usually strict set is better)
  // Or force strict mode.
  
  return {
    state: history.present,
    set,
    undo,
    redo,
    canUndo,
    canRedo,
    history // exposed for debugging if needed
  };
}
