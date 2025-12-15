
export function cleanupMessages(messages) {
  return messages.filter((m) => m.parts && m.parts.length > 0);
}
export async function processToolCalls({ messages }) {
  return messages;
}
