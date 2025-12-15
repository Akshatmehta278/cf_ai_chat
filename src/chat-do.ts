import { ChatAgent } from "./agent";
import { AgentDO } from "agents";

export class Chat extends AgentDO {
  constructor(state: DurableObjectState, env: any) {
    super(state, env, ChatAgent);
  }
}
