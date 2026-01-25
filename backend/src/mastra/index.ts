// Mastra config - exports the Mastra instance
// The CLI looks for this file (src/mastra/index.ts) to export a Mastra instance
import { Mastra } from '@mastra/core/mastra'
import * as toolsModule from './tools'
import * as agentsModule from './agents'
import * as workflowsModule from './workflows'

// Helper function to safely check if an item is a valid Mastra entity
function isValidMastraEntity(item: any, requireId: boolean = true): boolean {
  try {
    if (!item || typeof item !== 'object') return false
    if (requireId) {
      return 'id' in item && typeof item.id === 'string' && item.id.length > 0
    }
    return ('id' in item && typeof item.id === 'string' && item.id.length > 0) ||
           ('name' in item && typeof item.name === 'string' && item.name.length > 0)
  } catch {
    return false
  }
}

// Helper to safely get values from a module, filtering out non-entity exports
function getModuleEntities(module: any): any[] {
  try {
    return Object.values(module).filter((item: any) => {
      if (!item || typeof item !== 'object') return false
      return 'id' in item || 'name' in item
    })
  } catch {
    return []
  }
}

// Extract actual tools, agents, and workflows from modules
const tools = getModuleEntities(toolsModule).filter(
  (item) => isValidMastraEntity(item, true)
) as any[]

const agents = getModuleEntities(agentsModule).filter(
  (item) => isValidMastraEntity(item, false)
) as any[]

const workflows = getModuleEntities(workflowsModule).filter(
  (item) => isValidMastraEntity(item, true)
) as any[]

// Create tools, agents, and workflows objects for Mastra
const toolsObj = tools.reduce((acc, tool) => {
  try {
    if (tool && typeof tool === 'object' && tool.id && typeof tool.id === 'string') {
      acc[tool.id] = tool
    }
  } catch {
    // Skip invalid tools
  }
  return acc
}, {} as Record<string, any>)

const agentsObj = agents.reduce((acc, agent) => {
  try {
    if (agent && typeof agent === 'object') {
      const key = (agent.id && typeof agent.id === 'string') ? agent.id : 
                  (agent.name && typeof agent.name === 'string') ? agent.name : null
      if (key) {
        acc[key] = agent
      }
    }
  } catch {
    // Skip invalid agents
  }
  return acc
}, {} as Record<string, any>)

const workflowsObj = workflows.reduce((acc, workflow) => {
  try {
    if (workflow && typeof workflow === 'object' && workflow.id && typeof workflow.id === 'string') {
      acc[workflow.id] = workflow
    }
  } catch {
    // Skip invalid workflows
  }
  return acc
}, {} as Record<string, any>)

// Export configured Mastra instance - this is what the CLI expects
export const mastra = new Mastra({
  tools: toolsObj,
  agents: agentsObj,
  workflows: workflowsObj,
})

// Export all tools, agents, and workflows
export * from './tools'
export * from './agents'
export * from './workflows'
