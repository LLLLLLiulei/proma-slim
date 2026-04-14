import { exportDemoPages } from '../export/export-command'
import { exportOutputDir } from '../shared/paths'

const writtenPaths = await exportDemoPages()

console.log(`Exported ${writtenPaths.length} demo page(s) to ${exportOutputDir}`)
for (const filePath of writtenPaths) {
  console.log(`- ${filePath}`)
}
