"use client";
/**
 * The agent on patrol (the suit in the cross aisle, Crowd index 0) and the one conversation he has. Walk up and press E:
 * he stops, turns to you and asks whether you have seen Ethan. Answer and he moves on. Plain object + version, read by
 * the crowd loop every frame and by the HUD card.
 */
import { useSyncExternalStore } from "react";

export const AGENT_LINE = "Have you seen Ethan?";
export const AGENT_REPLIES: Array<{ say: string; answer: string }> = [
  { say: "No, sorry.", answer: "Keep your eyes open. He was last seen near the arcade." },
  { say: "Who's Ethan?", answer: "That's classified. If you see him, you'll know." },
  { say: "Maybe…", answer: "Maybe isn't an answer. Enjoy the show, citizen." },
];

export const agent = {
  x: 0, z: 0,              // where he is, written by the crowd loop
  near: false,             // the walker is close enough to talk
  talking: false,          // he has stopped and is facing the walker
  line: "" as string,      // what his speech bubble says right now
  until: 0,                // ms: when the bubble (and the stop) ends
  asked: false,            // the question has been put this visit; a reply follows
  dist: Infinity,          // how far the walker is, for support ("he never notices me")
  version: 0,
};
if (typeof window !== "undefined") (window as unknown as { __fccAgent: typeof agent }).__fccAgent = agent;
const listeners = new Set<() => void>();
export function bumpAgent() { agent.version++; for (const l of listeners) l(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useAgent() { useSyncExternalStore(subscribe, () => agent.version, () => 0); return agent; }

/** Press E next to him: he stops and asks. */
export function talkToAgent() {
  if (!agent.near) return;
  agent.talking = true; agent.asked = true; agent.line = AGENT_LINE; agent.until = Date.now() + 12000; bumpAgent();
}
/** Pick an answer: he replies, then walks on. */
export function answerAgent(i: number) {
  const r = AGENT_REPLIES[i] ?? AGENT_REPLIES[0];
  agent.line = r.answer; agent.asked = false; agent.until = Date.now() + 6000; bumpAgent();
}
/** Called by the crowd loop when the bubble has run out or the walker left. */
export function agentDone() { if (!agent.talking && !agent.line) return; agent.talking = false; agent.asked = false; agent.line = ""; bumpAgent(); }
