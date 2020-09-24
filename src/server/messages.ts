import cluster from 'cluster';
import {
  WorkerMessage,
  TestMessage,
  WebpackMessage,
  ProcessMessage,
  WorkerHandler,
  TestHandler,
  WebpackHandler,
  ShutdownHandler,
} from '../types';

function emitMessage<T>(message: T): boolean {
  if (cluster.isWorker && !process.connected) return false;
  return (
    process.send?.(message) ??
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    // NOTE wrong typings `process.emit` return boolean
    process.emit('message', message)
  );
}

export function emitWorkerMessage(message: WorkerMessage): boolean {
  return emitMessage({ scope: 'worker', ...message });
}

export function emitTestMessage(message: TestMessage): boolean {
  return emitMessage({ scope: 'test', ...message });
}

export function emitWebpackMessage(message: WebpackMessage): boolean {
  return emitMessage({ scope: 'webpack', ...message });
}

export function emitShutdownMessage(): boolean {
  return emitMessage({ scope: 'shutdown' });
}

interface Handlers {
  worker: Set<WorkerHandler>;
  test: Set<TestHandler>;
  webpack: Set<WebpackHandler>;
  shutdown: Set<ShutdownHandler>;
}

const handlers: Handlers = Object.assign(Object.create(null) as unknown, {
  worker: new Set<WorkerHandler>(),
  test: new Set<TestHandler>(),
  webpack: new Set<WebpackHandler>(),
  shutdown: new Set<ShutdownHandler>(),
});

const handler = (message: ProcessMessage): void => {
  switch (message.scope) {
    case 'worker':
      return handlers.worker.forEach((h) => h(message));
    case 'test':
      return handlers.test.forEach((h) => h(message));
    case 'webpack':
      return handlers.webpack.forEach((h) => h(message));
    case 'shutdown':
      return handlers.shutdown.forEach((h) => h(message));
  }
};
process.on('message', handler);

export function sendTestMessage(target: NodeJS.Process | cluster.Worker, message: TestMessage): void {
  target.send?.({ scope: 'test', ...message });
}
export function sendShutdownMessage(target: NodeJS.Process | cluster.Worker): void {
  target.send?.({ scope: 'shutdown' });
}

export function subscribeOn(scope: 'worker', handler: WorkerHandler): () => void;
export function subscribeOn(scope: 'test', handler: TestHandler): () => void;
export function subscribeOn(scope: 'webpack', handler: WebpackHandler): () => void;
export function subscribeOn(scope: 'shutdown', handler: ShutdownHandler): () => void;
export function subscribeOn(
  scope: 'worker' | 'test' | 'webpack' | 'shutdown',
  handler: WorkerHandler | TestHandler | WebpackHandler | ShutdownHandler,
): () => void;

export function subscribeOn(
  scope: 'worker' | 'test' | 'webpack' | 'shutdown',
  handler: WorkerHandler | TestHandler | WebpackHandler | ShutdownHandler,
): () => void {
  switch (scope) {
    case 'worker': {
      const workerHandler = handler as WorkerHandler;
      handlers.worker.add(workerHandler);
      return () => handlers.worker.delete(workerHandler);
    }
    case 'test': {
      const testHandler = handler as TestHandler;
      handlers.test.add(testHandler);
      return () => handlers.test.delete(testHandler);
    }
    case 'webpack': {
      const webpackHandler = handler as WebpackHandler;
      handlers.webpack.add(webpackHandler);
      return () => handlers.webpack.delete(webpackHandler);
    }
    case 'shutdown': {
      const shutdownHandler = handler as ShutdownHandler;
      handlers.shutdown.add(shutdownHandler);
      return () => handlers.shutdown.delete(shutdownHandler);
    }
  }
}
