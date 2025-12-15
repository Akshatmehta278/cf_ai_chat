import { Agent } from "agents";

export interface AgentState {
  messages: { role: string; content: string }[];
}

export class ChatAgent extends Agent<AgentState> {
  async init() {
    await this.setState({ messages: [] });
  }

  async respond(input: string) {
    const state = (await this.getState()) ?? { messages: [] };
    state.messages.push({ role: "user", content: input });
    const reply = `You said: "${input}". I am your Web Performance Coach.`;
    state.messages.push({ role: "assistant", content: reply });
    await this.setState(state);
    return { reply, history: state.messages };
  }

  async analyzeWebsite(url: string) {
    return {
      url,
      performance_score: 90,
      notes: ["Compress images","Enable HTTP/2 or QUIC","Use CDN caching headers","Minify JavaScript and CSS"]
    };
  }
}
