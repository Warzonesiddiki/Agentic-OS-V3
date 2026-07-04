/**
 * card.ts — Standardized /.well-known/agent.json discovery card provider per Google A2A spec.
 */

import type { AgentCard } from './types.js';

export const defaultAgentCard: AgentCard = {
  name: 'Nexus Agentic OS V3 A2A Agent',
  description:
    'Google Gemini CLI A2A Inter-Agent Protocol Server for task creation, agent discovery, and real-time streaming.',
  url: 'http://localhost:3000/',
  provider: {
    organization: 'Nexus AI',
    url: 'https://nexus-ai.org',
  },
  protocolVersion: '0.3.0',
  version: '2.0.0',
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  securitySchemes: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
    },
  },
  security: [{ bearerAuth: [] }],
  defaultInputModes: ['text'],
  defaultOutputModes: ['text'],
  skills: [
    {
      id: 'agent_execution',
      name: 'Agent Execution',
      description: 'Executes complex tasks using local Agent Runtime and action registry.',
      tags: ['agent', 'execution', 'nexus', 'sdlc'],
      examples: [
        'Recall database parameters and run migration.',
        'Compile skill from successful pattern.',
      ],
      inputModes: ['text'],
      outputModes: ['text'],
    },
    {
      id: 'inter_agent_delegation',
      name: 'Inter-Agent Delegation',
      description: 'Discovers and delegates subtasks to peer remote A2A agents.',
      tags: ['a2a', 'delegation', 'protocol'],
      examples: ['Delegate security scan to external validator agent.'],
      inputModes: ['text'],
      outputModes: ['text'],
    },
  ],
  supportsAuthenticatedExtendedCard: false,
};

export function getAgentCard(baseUrl?: string): AgentCard {
  if (!baseUrl) return defaultAgentCard;
  const normalizedUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return {
    ...defaultAgentCard,
    url: normalizedUrl,
  };
}
