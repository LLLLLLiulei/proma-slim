declare const Bun: {
  file(path: string): Blob
  serve(options: {
    port?: number
    idleTimeout?: number
    fetch: (request: Request) => Response | Promise<Response>
    error?: (error: Error) => Response
  }): {
    port: number
    stop(closeActiveConnections?: boolean): void
  }
}
