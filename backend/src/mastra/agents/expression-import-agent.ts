import { Agent } from '@mastra/core/agent'
import {
  createExpression,
  connectGitHubOAuth,
  watchGitHubRepo,
  importTwitterArchive,
  importBlueskyArchive,
} from '../tools/expression-import-tools'

export const expressionImportAgent = new Agent({
  id: 'expression_import_agent',
  name: 'expression_import_agent',
  instructions: `You are an agent responsible for importing user expressions from various platforms.

  Your responsibilities:
  - Handle GitHub OAuth connections
  - Watch GitHub repositories for markdown files
  - Import Twitter and Bluesky archives
  - Automatically trigger influence linking after imports
  
  Always:
  - Validate input data before importing
  - Generate embeddings for all imported expressions
  - Queue expressions for influence linking after import
  - Handle errors gracefully`,
  model: 'openai/gpt-4o-mini',
  tools: {
    createExpression,
    connectGitHubOAuth,
    watchGitHubRepo,
    importTwitterArchive,
    importBlueskyArchive,
  },
})
