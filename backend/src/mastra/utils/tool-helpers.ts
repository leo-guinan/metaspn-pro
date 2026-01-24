/**
 * Helper function to safely execute Mastra tools
 * Handles ValidationError and extracts the result
 */
export async function safeExecuteTool<T>(
  tool: any,
  context: any
): Promise<T> {
  if (!tool || !tool.execute) {
    throw new Error('Tool is undefined or does not have execute method')
  }

  const result = await tool.execute({ context } as any)
  
  // Check if result is a ValidationError
  if (result && typeof result === 'object' && 'error' in result && result.error === true) {
    throw new Error(`Tool execution failed: ${(result as any).message || 'Unknown error'}`)
  }

  return result as T
}
