import { compile } from '@vue/compiler-dom'
import * as Vue from 'vue'

export function compileIslandTemplate(template: string) {
  const renderFactory = new Function('Vue', compile(template, { mode: 'function' }).code) as (
    runtime: typeof Vue,
  ) => (ctx?: unknown, cache?: unknown) => unknown

  return renderFactory(Vue)
}
