export type DocumentBatchTaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type DocumentBatchWorker<TInput, TOutput> = (
  input: TInput,
  signal: AbortSignal
) => TOutput | PromiseLike<TOutput>;

export interface DocumentBatchOptions<TInput> {
  concurrency?: number;
  initialInputs?: Iterable<TInput>;
}

export interface DocumentBatchTask<TInput, TOutput> {
  readonly id: string;
  readonly input: TInput;
  readonly status: DocumentBatchTaskStatus;
  readonly output?: TOutput;
  readonly error?: unknown;
}

export interface DocumentBatchSnapshot<TInput, TOutput> {
  readonly tasks: ReadonlyArray<DocumentBatchTask<TInput, TOutput>>;
  readonly concurrency: number;
  readonly isRunning: boolean;
  readonly pendingCount: number;
  readonly runningCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly cancelledCount: number;
  readonly drainingCount: number;
  readonly isDraining: boolean;
}

export type DocumentBatchListener<TInput, TOutput> = (
  snapshot: DocumentBatchSnapshot<TInput, TOutput>
) => void | Promise<void>;

interface MutableDocumentBatchTask<TInput, TOutput> {
  id: string;
  input: TInput;
  status: DocumentBatchTaskStatus;
  output?: TOutput;
  error?: unknown;
  runSequence?: number;
  abortController?: AbortController;
}

interface ActiveDocumentBatchRun<TInput, TOutput> {
  sequence: number;
  queue: Array<MutableDocumentBatchTask<TInput, TOutput>>;
  inFlight: number;
  cancelled: boolean;
  promise: Promise<DocumentBatchSnapshot<TInput, TOutput>>;
  resolve: (snapshot: DocumentBatchSnapshot<TInput, TOutput>) => void;
}

const DEFAULT_CONCURRENCY = 2;
const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 3;

export class DocumentBatchService<TInput, TOutput> {
  private readonly tasks: Array<MutableDocumentBatchTask<TInput, TOutput>> = [];
  private readonly listeners = new Set<DocumentBatchListener<TInput, TOutput>>();
  private readonly concurrency: number;
  private nextTaskSequence = 1;
  private nextRunSequence = 1;
  private activeRun?: ActiveDocumentBatchRun<TInput, TOutput>;
  private activeWorkerCount = 0;

  constructor(
    private readonly worker: DocumentBatchWorker<TInput, TOutput>,
    options: DocumentBatchOptions<TInput> = {}
  ) {
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    if (
      !Number.isInteger(concurrency)
      || concurrency < MIN_CONCURRENCY
      || concurrency > MAX_CONCURRENCY
    ) {
      throw new RangeError('Document batch concurrency must be an integer from 1 to 3');
    }

    this.concurrency = concurrency;
    if (options.initialInputs) {
      for (const input of options.initialInputs) {
        this.appendTask(input);
      }
    }
  }

  add(input: TInput): DocumentBatchTask<TInput, TOutput> {
    const task = this.appendTask(input);
    const snapshot = this.createTaskSnapshot(task);
    this.notifyListeners();
    return snapshot;
  }

  addTasks(inputs: Iterable<TInput>): ReadonlyArray<DocumentBatchTask<TInput, TOutput>> {
    const added: Array<DocumentBatchTask<TInput, TOutput>> = [];
    for (const input of inputs) {
      added.push(this.createTaskSnapshot(this.appendTask(input)));
    }

    if (added.length > 0) this.notifyListeners();
    return Object.freeze(added);
  }

  start(): Promise<DocumentBatchSnapshot<TInput, TOutput>> {
    if (this.activeRun) return this.activeRun.promise;

    const queue = this.tasks.filter(task => task.status === 'pending');
    if (queue.length === 0) return Promise.resolve(this.getSnapshot());

    let resolveRun!: (snapshot: DocumentBatchSnapshot<TInput, TOutput>) => void;
    const promise = new Promise<DocumentBatchSnapshot<TInput, TOutput>>(resolve => {
      resolveRun = resolve;
    });
    const run: ActiveDocumentBatchRun<TInput, TOutput> = {
      sequence: this.nextRunSequence,
      queue,
      inFlight: 0,
      cancelled: false,
      promise,
      resolve: resolveRun
    };
    this.nextRunSequence += 1;
    this.activeRun = run;
    this.pump(run);
    return promise;
  }

  cancel(): DocumentBatchSnapshot<TInput, TOutput> {
    const run = this.activeRun;
    if (run) run.cancelled = true;

    const controllers: AbortController[] = [];
    let changed = false;
    for (const task of this.tasks) {
      if (task.status !== 'pending' && task.status !== 'running') continue;
      if (task.status === 'running' && task.abortController) {
        controllers.push(task.abortController);
      }
      task.status = 'cancelled';
      delete task.output;
      delete task.error;
      changed = true;
    }

    for (const controller of controllers) controller.abort();
    if (changed) this.notifyListeners();
    const snapshot = this.getSnapshot();
    if (run) this.finishRun(run, snapshot);
    return snapshot;
  }

  retryFailed(): DocumentBatchSnapshot<TInput, TOutput> {
    let changed = false;
    for (const task of this.tasks) {
      if (task.status !== 'failed') continue;
      task.status = 'pending';
      delete task.output;
      delete task.error;
      changed = true;
    }

    if (changed) this.notifyListeners();
    return this.getSnapshot();
  }

  getSnapshot(): DocumentBatchSnapshot<TInput, TOutput> {
    const tasks = Object.freeze(this.tasks.map(task => this.createTaskSnapshot(task)));
    const counts: Record<DocumentBatchTaskStatus, number> = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };
    for (const task of tasks) counts[task.status] += 1;

    return Object.freeze({
      tasks,
      concurrency: this.concurrency,
      isRunning: counts.running > 0,
      pendingCount: counts.pending,
      runningCount: counts.running,
      completedCount: counts.completed,
      failedCount: counts.failed,
      cancelledCount: counts.cancelled,
      drainingCount: Math.max(0, this.activeWorkerCount - counts.running),
      isDraining: this.activeWorkerCount > counts.running
    });
  }

  subscribe(listener: DocumentBatchListener<TInput, TOutput>): () => void {
    this.listeners.add(listener);
    this.callListener(listener, this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private appendTask(input: TInput): MutableDocumentBatchTask<TInput, TOutput> {
    const task: MutableDocumentBatchTask<TInput, TOutput> = {
      id: `document-batch-task-${this.nextTaskSequence}`,
      input,
      status: 'pending'
    };
    this.nextTaskSequence += 1;
    this.tasks.push(task);
    return task;
  }

  private pump(run: ActiveDocumentBatchRun<TInput, TOutput>): void {
    if (this.activeRun !== run) return;

    while (
      !run.cancelled
      && this.activeWorkerCount < this.concurrency
      && run.queue.length > 0
    ) {
      const task = run.queue.shift();
      if (!task || task.status !== 'pending') continue;
      this.runTask(run, task);
    }

    if (run.inFlight === 0 && (run.cancelled || run.queue.length === 0)) {
      this.finishRun(run);
    }
  }

  private runTask(
    run: ActiveDocumentBatchRun<TInput, TOutput>,
    task: MutableDocumentBatchTask<TInput, TOutput>
  ): void {
    const abortController = new AbortController();
    task.status = 'running';
    task.runSequence = run.sequence;
    task.abortController = abortController;
    run.inFlight += 1;
    this.activeWorkerCount += 1;

    let workerResult: Promise<TOutput>;
    try {
      workerResult = Promise.resolve(this.worker(task.input, abortController.signal));
    } catch (error) {
      workerResult = Promise.reject(error);
    }
    this.notifyListeners();

    void workerResult.then(
      output => this.settleTask(run, task, true, output),
      error => this.settleTask(run, task, false, error)
    );
  }

  private settleTask(
    run: ActiveDocumentBatchRun<TInput, TOutput>,
    task: MutableDocumentBatchTask<TInput, TOutput>,
    succeeded: boolean,
    value: TOutput | unknown
  ): void {
    run.inFlight -= 1;
    this.activeWorkerCount = Math.max(0, this.activeWorkerCount - 1);
    delete task.abortController;

    let changed = false;
    if (
      task.runSequence === run.sequence
      && task.status === 'running'
      && !run.cancelled
    ) {
      if (succeeded) {
        task.status = 'completed';
        task.output = value as TOutput;
        delete task.error;
      } else {
        task.status = 'failed';
        task.error = value;
        delete task.output;
      }
      changed = true;
    }
    if (task.runSequence === run.sequence) delete task.runSequence;

    if (changed || this.activeRun !== run) this.notifyListeners();
    if (this.activeRun === run) {
      this.pump(run);
    } else if (this.activeRun) {
      this.pump(this.activeRun);
    }
  }

  private finishRun(
    run: ActiveDocumentBatchRun<TInput, TOutput>,
    snapshot: DocumentBatchSnapshot<TInput, TOutput> = this.getSnapshot()
  ): void {
    if (this.activeRun !== run) return;
    this.activeRun = undefined;
    run.resolve(snapshot);
  }

  private createTaskSnapshot(
    task: MutableDocumentBatchTask<TInput, TOutput>
  ): DocumentBatchTask<TInput, TOutput> {
    const snapshot: DocumentBatchTask<TInput, TOutput> = {
      id: task.id,
      input: task.input,
      status: task.status,
      ...(task.status === 'completed' ? { output: task.output as TOutput } : {}),
      ...(task.status === 'failed' ? { error: task.error } : {})
    };
    return Object.freeze(snapshot);
  }

  private notifyListeners(): void {
    if (this.listeners.size === 0) return;
    const snapshot = this.getSnapshot();
    for (const listener of [...this.listeners]) {
      this.callListener(listener, snapshot);
    }
  }

  private callListener(
    listener: DocumentBatchListener<TInput, TOutput>,
    snapshot: DocumentBatchSnapshot<TInput, TOutput>
  ): void {
    try {
      const result = listener(snapshot);
      if (result) void Promise.resolve(result).catch(() => undefined);
    } catch {
      // A UI listener must never interfere with queue progress.
    }
  }
}
