/**
 * Constants for the Chat SDK
 */

export const MESSAGE_ROLES = {
  ASSISTANT: 'assistant', // this can be automated or LLM AI Agent response
  USER: 'user', // this is widget user
  SUPERVISOR: 'supervisor', // this is human supervisor (ex. Samespace Dock agent, or Resolve human agent)
  SYSTEM: 'system', // this is system message, for ex "Agent joined" / "Agent left"

  // Deprecated aliases for backwards compatibility (will be removed in v1.0)
  /** @deprecated Use ASSISTANT instead */
  BOT: 'assistant',
  /** @deprecated Use SUPERVISOR instead */
  AGENT: 'supervisor'
}
