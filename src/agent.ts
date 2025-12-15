import { Agent } from "agents";

export interface AgentState {
  messages: { role: string; content: string }[];
}

export class ChatAgent extends Agent<AgentState> {
  async init() {
    await this.setState({ messages: [] });
  }

  async respond(message: string) {
    const state = (await this.getState()) ?? { messages: [] };

    state.messages.push({ role: "user", content: message });

    const reply = `WebPerfCoach here! You said: "${message}".`;

    state.messages.push({ role: "assistant", content: reply });

    await this.setState(state);

    return { reply, history: state.messages };
  }

  async analyzeWebsite(url: string) {
    return {
      url,
      performance_score: 92,
      recommendations: [
        "Enable compression",
        "Optimize images",
        "Use CDN caching",
      ],
    };
  }
}
