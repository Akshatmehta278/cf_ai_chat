/**
 * AI Agent - Handles intelligent conversation logic and workflow coordination
 */

import type { Env, Message, AgentConfig, AgentContext, AgentResponse, AIResponse } from './types';

export class AIAgent {
  private env: Env;
  private config: AgentConfig;

  constructor(env: Env, config?: Partial<AgentConfig>) {
    this.env = env;
    this.config = {
      model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      maxTokens: 1024,
      temperature: 0.7,
      systemPrompt: 'You are a helpful AI assistant powered by Cloudflare Workers AI.',
      ...config,
    };
  }

  /**
   * Process user message and generate response
   */
  async processMessage(context: AgentContext): Promise<AgentResponse> {
    try {
      // Step 1: Prepare conversation with system prompt
      const messages = this.prepareMessages(context);

      // Step 2: Call Workers AI
      const aiResponse = await this.callAI(messages);

      // Step 3: Process and validate response
      const content = this.extractContent(aiResponse);

      // Step 4: Determine if conversation should continue
      const shouldContinue = this.shouldContinueConversation(content, context);

      return {
        content,
        shouldContinue,
        metadata: {
          model: this.config.model,
          tokensUsed: content.length, // Approximate
        },
      };
    } catch (error) {
      console.error('Agent error:', error);
      throw new Error('Failed to process message');
    }
  }

  /**
   * Prepare messages with system prompt
   */
  private prepareMessages(context: AgentContext): Message[] {
    const messages: Message[] = [];

    // Add system prompt if configured
    if (this.config.systemPrompt) {
      messages.push({
        role: 'system',
        content: this.config.systemPrompt,
      });
    }

    // Add conversation history
    messages.push(...context.conversationHistory);

    // Add current user message
    messages.push({
      role: 'user',
      content: context.userMessage,
    });

    return messages;
  }

  /**
   * Call Workers AI with prepared messages (No external API needed!)
   */
  private async callAI(messages: Message[]): Promise<AIResponse> {
    // Using Cloudflare Workers AI - completely free, no API keys required
    const response = await this.env.AI.run(this.config.model as any, {
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    } as any);

    return response as AIResponse;
  }

  /**
   * Extract content from AI response
   */
  private extractContent(response: AIResponse): string {
    return response.response || response.result?.response || 'No response generated';
  }

  /**
   * Determine if conversation should continue (multi-turn logic)
   */
  private shouldContinueConversation(content: string, context: AgentContext): boolean {
    // Add your multi-turn conversation logic here
    // For example: check if AI is asking a follow-up question
    const hasQuestion = content.includes('?');
    const conversationLength = context.conversationHistory.length;
    
    // Continue if AI asks a question and conversation isn't too long
    return hasQuestion && conversationLength < 20;
  }

  /**
   * Analyze user intent (optional enhancement)
   */
  async analyzeIntent(message: string): Promise<string> {
    // Simple intent analysis
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('help') || lowerMessage.includes('how')) {
      return 'help_request';
    }
    if (lowerMessage.includes('thank')) {
      return 'gratitude';
    }
    if (lowerMessage.includes('bye') || lowerMessage.includes('goodbye')) {
      return 'farewell';
    }
    
    return 'general_query';
  }

  /**
   * Generate contextual system prompt based on conversation
   */
  generateContextualPrompt(context: AgentContext): string {
    const messageCount = context.conversationHistory.length;
    
    if (messageCount === 0) {
      return 'You are starting a new conversation. Be welcoming and helpful.';
    }
    
    if (messageCount > 10) {
      return 'This is an extended conversation. Be concise and reference previous context when relevant.';
    }
    
    return this.config.systemPrompt || '';
  }

  /**
   * Handle multi-step workflows
   */
  async executeWorkflow(steps: Array<() => Promise<any>>): Promise<any[]> {
    const results = [];
    
    for (const step of steps) {
      try {
        const result = await step();
        results.push(result);
      } catch (error) {
        console.error('Workflow step failed:', error);
        results.push({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
    
    return results;
  }

  /**
   * Summarize conversation (useful for long conversations)
   */
  async summarizeConversation(messages: Message[]): Promise<string> {
    const conversationText = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    const summaryMessages: Message[] = [
      {
        role: 'system',
        content: 'Summarize the following conversation in 2-3 sentences.',
      },
      {
        role: 'user',
        content: conversationText,
      },
    ];

    const response = await this.callAI(summaryMessages);
    return this.extractContent(response);
  }
}

/**
 * Factory function to create agent instances
 */
export function createAgent(env: Env, config?: Partial<AgentConfig>): AIAgent {
  return new AIAgent(env, config);
}