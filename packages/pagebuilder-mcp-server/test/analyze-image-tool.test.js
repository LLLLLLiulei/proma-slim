import test from 'node:test';
import assert from 'node:assert/strict';
import { registerGeneralImageAnalysisTool } from '../src/tools/general-image.js';

function captureRegisteredTool(options) {
  let captured;
  const server = {
    tool(name, description, schema, handler) {
      captured = { name, description, schema, handler };
    }
  };
  registerGeneralImageAnalysisTool(server, options);
  return captured;
}

test('analyze_image can resolve pagebuilder workspace image sources before analysis', async () => {
  const calls = [];
  const tool = captureRegisteredTool({
    imageSourceResolver: async (imageSource) => {
      calls.push(['resolve', imageSource]);
      return 'https://cdn.example/resolved-workspace-image.png';
    },
    analyzeImage: async (imageSource, prompt) => {
      calls.push(['analyze', imageSource, prompt]);
      return `analyzed ${imageSource} with ${prompt}`;
    }
  });

  const result = await tool.handler({
    image_source: './assets/reference.png',
    prompt: 'describe the visual style'
  });

  assert.equal(tool.name, 'analyze_image');
  assert.deepEqual(calls, [
    ['resolve', './assets/reference.png'],
    ['analyze', 'https://cdn.example/resolved-workspace-image.png', 'describe the visual style']
  ]);
  assert.equal(result.content[0].text, 'analyzed https://cdn.example/resolved-workspace-image.png with describe the visual style');
});
