interface RenderJob { priority: number; run: () => Promise<void>; signal?: AbortSignal; onAbort: () => void }
export class RenderQueue {
  private jobs: RenderJob[] = []
  private running = false
  enqueue<T>(operation: () => Promise<T>, priority = 0, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new DOMException('渲染任务已过期。', 'AbortError'))
    return new Promise<T>((resolve, reject) => {
      const job: RenderJob = {
        priority, signal,
        run: async () => { try { resolve(await operation()) } catch (error) { reject(error) } },
        onAbort: () => {
          const index = this.jobs.indexOf(job)
          if (index < 0) return
          this.jobs.splice(index, 1)
          signal?.removeEventListener('abort', job.onAbort)
          reject(new DOMException('渲染任务已过期。', 'AbortError'))
        },
      }
      this.jobs.push(job)
      signal?.addEventListener('abort', job.onAbort, { once: true })
      queueMicrotask(() => { void this.drain() })
    })
  }
  private async drain() {
    if (this.running) return
    this.running = true
    try {
      while (this.jobs.length) {
        this.jobs.sort((left, right) => right.priority - left.priority)
        const job = this.jobs.shift()!
        job.signal?.removeEventListener('abort', job.onAbort)
        // A running Mermaid render must finish before initialize/render is used
        // again. Only queued work is cancelled; callers ignore obsolete results.
        await job.run()
      }
    } finally { this.running = false }
  }
}
