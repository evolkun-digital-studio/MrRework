import { AsyncLocalStorage } from "async_hooks";

export interface ParsingProgressEvent {
  passStarted?: boolean;
  bytesRead?: number;
  rowsProcessed?: number;
  statementsParsed?: number;
  table?: string;
}

type Reporter = (event: ParsingProgressEvent) => void;

const storage = new AsyncLocalStorage<Reporter>();

export function withParsingProgress<T>(reporter: Reporter, work: () => Promise<T>): Promise<T> {
  return storage.run(reporter, work);
}

export function reportParsingProgress(event: ParsingProgressEvent) {
  storage.getStore()?.(event);
}

export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
