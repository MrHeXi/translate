import {
  DocumentBatchService,
  DocumentBatchTask
} from '../DocumentBatchService';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const flushPromises = async (): Promise<void> => {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
};

describe('DocumentBatchService', () => {
  it('keeps constructor and added tasks pending until an explicit start', async () => {
    const worker = jest.fn(async (input: string) => input.toUpperCase());
    const service = new DocumentBatchService(worker, {
      initialInputs: ['first', 'second']
    });

    const added = service.add('third');
    await flushPromises();

    expect(worker).not.toHaveBeenCalled();
    expect(added).toMatchObject({
      id: 'document-batch-task-3',
      input: 'third',
      status: 'pending'
    });
    expect(service.getSnapshot().tasks.map(task => [task.id, task.input, task.status])).toEqual([
      ['document-batch-task-1', 'first', 'pending'],
      ['document-batch-task-2', 'second', 'pending'],
      ['document-batch-task-3', 'third', 'pending']
    ]);

    const finalSnapshot = await service.start();

    expect(worker).toHaveBeenCalledTimes(3);
    expect(finalSnapshot.tasks.map(task => task.output)).toEqual(['FIRST', 'SECOND', 'THIRD']);
    expect(finalSnapshot.completedCount).toBe(3);
    expect(finalSnapshot.isRunning).toBe(false);
  });

  it('does not absorb tasks added during a run without another explicit start', async () => {
    const firstResult = deferred<string>();
    const worker = jest.fn((input: string) => (
      input === 'first' ? firstResult.promise : Promise.resolve('translated second')
    ));
    const service = new DocumentBatchService(worker, {
      concurrency: 1,
      initialInputs: ['first']
    });

    const firstRun = service.start();
    service.add('second');
    firstResult.resolve('translated first');
    const firstSnapshot = await firstRun;

    expect(worker).toHaveBeenCalledTimes(1);
    expect(firstSnapshot.tasks.map(task => task.status)).toEqual(['completed', 'pending']);

    await service.start();
    expect(worker).toHaveBeenCalledTimes(2);
    expect(service.getSnapshot().tasks.map(task => task.status)).toEqual([
      'completed',
      'completed'
    ]);
  });

  it('uses default concurrency two and rejects values outside integer range 1..3', () => {
    const worker = async (input: string): Promise<string> => input;

    expect(new DocumentBatchService(worker).getSnapshot().concurrency).toBe(2);
    expect(new DocumentBatchService(worker, { concurrency: 1 }).getSnapshot().concurrency).toBe(1);
    expect(new DocumentBatchService(worker, { concurrency: 3 }).getSnapshot().concurrency).toBe(3);
    expect(() => new DocumentBatchService(worker, { concurrency: 0 })).toThrow(RangeError);
    expect(() => new DocumentBatchService(worker, { concurrency: 4 })).toThrow(RangeError);
    expect(() => new DocumentBatchService(worker, { concurrency: 1.5 })).toThrow(RangeError);
  });

  it('never exceeds the configured concurrency', async () => {
    const pending = new Map<string, Deferred<string>>();
    let activeWorkers = 0;
    let maximumActiveWorkers = 0;
    const worker = jest.fn((input: string) => {
      const result = deferred<string>();
      pending.set(input, result);
      activeWorkers += 1;
      maximumActiveWorkers = Math.max(maximumActiveWorkers, activeWorkers);
      return result.promise.finally(() => {
        activeWorkers -= 1;
      });
    });
    const service = new DocumentBatchService(worker, {
      concurrency: 3,
      initialInputs: ['a', 'b', 'c', 'd', 'e']
    });

    const run = service.start();
    expect(worker).toHaveBeenCalledTimes(3);
    expect(service.getSnapshot().runningCount).toBe(3);

    pending.get('a')?.resolve('A');
    await flushPromises();
    expect(worker).toHaveBeenCalledTimes(4);
    expect(maximumActiveWorkers).toBe(3);

    pending.get('b')?.resolve('B');
    await flushPromises();
    expect(worker).toHaveBeenCalledTimes(5);
    expect(maximumActiveWorkers).toBe(3);

    pending.get('c')?.resolve('C');
    pending.get('d')?.resolve('D');
    pending.get('e')?.resolve('E');
    const finalSnapshot = await run;

    expect(maximumActiveWorkers).toBe(3);
    expect(finalSnapshot.runningCount).toBe(0);
    expect(finalSnapshot.completedCount).toBe(5);
  });

  it('keeps stable input order when workers resolve out of order', async () => {
    const pending = new Map<string, Deferred<string>>();
    const worker = jest.fn((input: string) => {
      const result = deferred<string>();
      pending.set(input, result);
      return result.promise;
    });
    const service = new DocumentBatchService(worker, {
      concurrency: 3,
      initialInputs: ['one', 'two', 'three']
    });

    const run = service.start();
    pending.get('three')?.resolve('THREE');
    pending.get('one')?.resolve('ONE');
    pending.get('two')?.resolve('TWO');
    const finalSnapshot = await run;

    expect(finalSnapshot.tasks.map(task => task.id)).toEqual([
      'document-batch-task-1',
      'document-batch-task-2',
      'document-batch-task-3'
    ]);
    expect(finalSnapshot.tasks.map(task => task.input)).toEqual(['one', 'two', 'three']);
    expect(finalSnapshot.tasks.map(task => task.output)).toEqual(['ONE', 'TWO', 'THREE']);
  });

  it('isolates a failed task and continues the rest of the queue', async () => {
    const failure = new Error('second task failed');
    const worker = jest.fn(async (input: string) => {
      if (input === 'two') throw failure;
      return input.toUpperCase();
    });
    const service = new DocumentBatchService(worker, {
      concurrency: 2,
      initialInputs: ['one', 'two', 'three']
    });

    const finalSnapshot = await service.start();

    expect(worker).toHaveBeenCalledTimes(3);
    expect(finalSnapshot.tasks.map(task => task.status)).toEqual([
      'completed',
      'failed',
      'completed'
    ]);
    expect(finalSnapshot.tasks[1].error).toBe(failure);
    expect(finalSnapshot.tasks[2].output).toBe('THREE');
  });

  it('returns one active promise for repeated start calls and never duplicates workers', async () => {
    const pending = new Map<string, Deferred<string>>();
    const worker = jest.fn((input: string) => {
      const result = deferred<string>();
      pending.set(input, result);
      return result.promise;
    });
    const service = new DocumentBatchService(worker, {
      concurrency: 1,
      initialInputs: ['one', 'two']
    });

    const firstStart = service.start();
    const secondStart = service.start();

    expect(secondStart).toBe(firstStart);
    expect(worker).toHaveBeenCalledTimes(1);

    pending.get('one')?.resolve('ONE');
    await flushPromises();
    expect(worker).toHaveBeenCalledTimes(2);
    pending.get('two')?.resolve('TWO');

    const firstResult = await firstStart;
    const secondResult = await secondStart;
    expect(secondResult).toBe(firstResult);
    expect(firstResult.completedCount).toBe(2);

    await service.start();
    expect(worker).toHaveBeenCalledTimes(2);
  });

  it('aborts running workers and cancels every unstarted task immediately', async () => {
    const signals: AbortSignal[] = [];
    const worker = jest.fn((_input: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<string>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    });
    const service = new DocumentBatchService(worker, {
      concurrency: 2,
      initialInputs: ['one', 'two', 'three', 'four']
    });

    const run = service.start();
    const cancelledSnapshot = service.cancel();

    expect(worker).toHaveBeenCalledTimes(2);
    expect(signals).toHaveLength(2);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(cancelledSnapshot.tasks.map(task => task.status)).toEqual([
      'cancelled',
      'cancelled',
      'cancelled',
      'cancelled'
    ]);
    expect(cancelledSnapshot.isRunning).toBe(false);

    const finalSnapshot = await run;
    expect(finalSnapshot.cancelledCount).toBe(4);
    expect(worker).toHaveBeenCalledTimes(2);
  });

  it('ignores a late worker result after cancellation', async () => {
    const lateResult = deferred<string>();
    let observedSignal: AbortSignal | undefined;
    const worker = jest.fn((_input: string, signal: AbortSignal) => {
      observedSignal = signal;
      return lateResult.promise;
    });
    const service = new DocumentBatchService(worker, {
      initialInputs: ['late']
    });

    const run = service.start();
    service.cancel();
    const repeatedStart = service.start();

    expect(observedSignal?.aborted).toBe(true);
    expect(repeatedStart).not.toBe(run);
    expect(service.getSnapshot().tasks[0].status).toBe('cancelled');

    const cancelledRunSnapshot = await run;
    const repeatedStartSnapshot = await repeatedStart;
    expect(cancelledRunSnapshot.cancelledCount).toBe(1);
    expect(repeatedStartSnapshot.cancelledCount).toBe(1);

    lateResult.resolve('must be ignored');
    await flushPromises();
    const finalSnapshot = service.getSnapshot();

    expect(finalSnapshot.tasks[0].status).toBe('cancelled');
    expect(Object.prototype.hasOwnProperty.call(finalSnapshot.tasks[0], 'output')).toBe(false);
  });

  it('keeps cancelled non-cooperative workers in the concurrency budget until they settle', async () => {
    const pending = new Map<string, Deferred<string>>();
    let activeWorkers = 0;
    let maximumActiveWorkers = 0;
    const worker = jest.fn((input: string) => {
      const result = deferred<string>();
      pending.set(input, result);
      activeWorkers += 1;
      maximumActiveWorkers = Math.max(maximumActiveWorkers, activeWorkers);
      return result.promise.finally(() => {
        activeWorkers -= 1;
      });
    });
    const service = new DocumentBatchService(worker, {
      concurrency: 2,
      initialInputs: ['old-one', 'old-two']
    });

    const cancelledRun = service.start();
    service.cancel();
    await cancelledRun;
    expect(service.getSnapshot()).toMatchObject({
      isRunning: false,
      isDraining: true,
      drainingCount: 2
    });

    service.addTasks(['new-one', 'new-two']);
    const nextRun = service.start();
    expect(worker).toHaveBeenCalledTimes(2);

    pending.get('old-one')?.resolve('ignored old one');
    await flushPromises();
    expect(worker).toHaveBeenCalledTimes(3);
    expect(maximumActiveWorkers).toBe(2);

    pending.get('old-two')?.resolve('ignored old two');
    await flushPromises();
    expect(worker).toHaveBeenCalledTimes(4);
    expect(maximumActiveWorkers).toBe(2);

    pending.get('new-one')?.resolve('NEW ONE');
    pending.get('new-two')?.resolve('NEW TWO');
    const finalSnapshot = await nextRun;
    expect(maximumActiveWorkers).toBe(2);
    expect(finalSnapshot).toMatchObject({ isDraining: false, drainingCount: 0 });
    expect(finalSnapshot.tasks.map(task => task.status)).toEqual([
      'cancelled',
      'cancelled',
      'completed',
      'completed'
    ]);
  });

  it('retries failed tasks only after another start and never retries cancelled tasks', async () => {
    const attempts = new Map<string, number>();
    const worker = jest.fn(async (input: string) => {
      const attempt = (attempts.get(input) || 0) + 1;
      attempts.set(input, attempt);
      if (input === 'failed' && attempt === 1) throw new Error('try again');
      return `${input}:${attempt}`;
    });
    const service = new DocumentBatchService(worker, {
      initialInputs: ['complete', 'failed']
    });

    await service.start();
    const originalIds = service.getSnapshot().tasks.map(task => task.id);
    service.add('cancelled');
    service.cancel();

    const retriedSnapshot = service.retryFailed();
    await flushPromises();

    expect(worker).toHaveBeenCalledTimes(2);
    expect(retriedSnapshot.tasks.map(task => task.status)).toEqual([
      'completed',
      'pending',
      'cancelled'
    ]);

    const finalSnapshot = await service.start();
    expect(worker).toHaveBeenCalledTimes(3);
    expect(finalSnapshot.tasks.map(task => task.status)).toEqual([
      'completed',
      'completed',
      'cancelled'
    ]);
    expect(finalSnapshot.tasks[1].output).toBe('failed:2');
    expect(finalSnapshot.tasks.slice(0, 2).map(task => task.id)).toEqual(originalIds);
  });

  it('returns immutable queue snapshots while preserving opaque input references', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const worker = jest.fn(async (input: Uint8Array) => input.byteLength);
    const service = new DocumentBatchService(worker, {
      initialInputs: [bytes]
    });
    const throwingListener = jest.fn(() => {
      throw new Error('listener failed');
    });
    const rejectingListener = jest.fn(async () => {
      throw new Error('async listener failed');
    });

    const unsubscribeThrowing = service.subscribe(throwingListener);
    const unsubscribeRejecting = service.subscribe(rejectingListener);
    const snapshot = service.getSnapshot();

    expect(snapshot.tasks[0].input).toBe(bytes);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.tasks)).toBe(true);
    expect(Object.isFrozen(snapshot.tasks[0])).toBe(true);
    expect(() => {
      (snapshot.tasks as Array<DocumentBatchTask<Uint8Array, number>>).push({
        id: 'external',
        input: bytes,
        status: 'failed'
      });
    }).toThrow(TypeError);
    expect(() => {
      (snapshot.tasks[0] as { status: string }).status = 'failed';
    }).toThrow(TypeError);
    expect(service.getSnapshot().tasks[0].status).toBe('pending');

    const finalSnapshot = await service.start();
    expect(finalSnapshot.tasks[0]).toMatchObject({
      id: 'document-batch-task-1',
      status: 'completed',
      output: 3
    });
    expect(throwingListener).toHaveBeenCalled();
    expect(rejectingListener).toHaveBeenCalled();

    unsubscribeThrowing();
    unsubscribeRejecting();
    const throwingCalls = throwingListener.mock.calls.length;
    service.add(new Uint8Array([4]));
    expect(throwingListener).toHaveBeenCalledTimes(throwingCalls);
  });
});
