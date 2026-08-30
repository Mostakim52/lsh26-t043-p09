import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { completeService, type CompletionInput } from '../engine/complete';
import type { Fleet } from '../engine/types';
import { backendConfigured, loadFleet, postCompletion, type FleetSource } from './api';

const STORAGE_KEY = 'servicedesk.completions.v1';

/**
 * Completed services are kept as a replayable log rather than a copy of the whole fleet.
 * It is a few hundred bytes instead of a megabyte, it survives the sample data being
 * regenerated, and clearing it is a clean reset back to the shipped demo.
 *
 * In backend mode this log is NOT replayed — the backend owns the state and the
 * frontend just refetches. The log is kept only for the offline sample fallback so
 * that a demo recorded in sample mode does not leak into live data.
 */
function readLog(): CompletionInput[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CompletionInput[]) : [];
  } catch {
    return [];
  }
}

function writeLog(log: CompletionInput[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    // A private window with storage blocked still works, it just forgets on reload.
  }
}

function replay(base: Fleet, log: CompletionInput[]): Fleet {
  return log.reduce((fleet, entry) => {
    try {
      return completeService(fleet, entry).fleet;
    } catch {
      // An entry for a vehicle or item that no longer exists is dropped rather than
      // taking the whole app down.
      return fleet;
    }
  }, base);
}

interface FleetContextValue {
  fleet: Fleet | null;
  source: FleetSource;
  loading: boolean;
  error: string | null;
  notice: string | null;
  /** Number of services recorded in this browser that are not on a backend. */
  localChanges: number;
  recordService: (input: CompletionInput) => Promise<void>;
  resetLocalChanges: () => void;
  /** Ask the provider to reload from the backend after a mutation. */
  reload: () => Promise<void>;
}

const FleetContext = createContext<FleetContextValue | null>(null);

export function FleetProvider({ children }: { children: ReactNode }) {
  const [base, setBase] = useState<Fleet | null>(null);
  const [log, setLog] = useState<CompletionInput[]>(() => readLog());
  const [source, setSource] = useState<FleetSource>('sample');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const doLoad = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadFleet();
      setBase(result.fleet);
      setSource(result.source);
      setNotice(result.notice ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void doLoad();
  }, [doLoad]);

  // In backend mode, fleet is the live fleet from the server (no local replay).
  // In sample mode, replay the local completion log so the offline demo feels interactive.
  const fleet = useMemo(() => {
    if (!base) return null;
    if (backendConfigured) return base;
    return replay(base, log);
  }, [base, log]);

  const recordService = useCallback(
    async (input: CompletionInput) => {
      if (backendConfigured) {
        // Backend is the source of truth — POST then refetch. No local replay.
        try {
          await postCompletion(input);
          await doLoad();
        } catch (e) {
          setNotice(
            `Backend did not accept the record: ${e instanceof Error ? e.message : String(e)}`,
          );
          throw e;
        }
        return;
      }

      // Offline sample mode — keep the local replay log.
      setLog((prev) => {
        const next = [...prev, input];
        writeLog(next);
        return next;
      });
    },
    [doLoad],
  );

  const resetLocalChanges = useCallback(() => {
    setLog([]);
    writeLog([]);
    setNotice(null);
  }, []);

  const value = useMemo<FleetContextValue>(
    () => ({
      fleet,
      source,
      loading,
      error,
      notice,
      localChanges: backendConfigured ? 0 : log.length,
      recordService,
      resetLocalChanges,
      reload: doLoad,
    }),
    [fleet, source, loading, error, notice, log.length, recordService, resetLocalChanges, doLoad],
  );

  return <FleetContext.Provider value={value}>{children}</FleetContext.Provider>;
}

export function useFleet(): FleetContextValue {
  const ctx = useContext(FleetContext);
  if (!ctx) throw new Error('useFleet must be used inside <FleetProvider>');
  return ctx;
}
