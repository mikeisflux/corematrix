"use client";
/**
 * ConBot, the mascot: shared state between the robot in the scene, the player
 * (who gets near it) and the ConBot panel (which sends it commands).
 */
import { useSyncExternalStore } from "react";

export type BotCmd =
  | { kind: "emote"; clip: string }
  | { kind: "say"; text: string; clip?: string }
  | { kind: "lead"; x: number; z: number; text: string; arrive: string };

export const conbot = {
  x: 0, z: 0,             // where the robot is (written by the scene every frame)
  line: "", lineUntil: 0, // what it is saying right now (speech bubble + panel)
  cmd: null as BotCmd | null, cmdVersion: 0,
  version: 0,
};
const listeners = new Set<() => void>();
const emit = () => { conbot.version++; for (const l of listeners) l(); };
export function botSay(text: string, ms = 8000) { conbot.line = text; conbot.lineUntil = performance.now() + ms; emit(); }
export function botCommand(cmd: BotCmd) { conbot.cmd = cmd; conbot.cmdVersion++; emit(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** Re-renders when ConBot says or is told something. */
export function useConBot() { return useSyncExternalStore(subscribe, () => conbot.version, () => 0); }

/** Clips in robot.glb (RobotExpressive) that work as emotes. `loop` ones hold for a few seconds instead of playing once. */
export const BOT_EMOTES: { clip: string; label: string; icon: string; loop?: boolean }[] = [
  { clip: "Wave", label: "Wave", icon: "👋" },
  { clip: "Dance", label: "Dance", icon: "🕺", loop: true },
  { clip: "ThumbsUp", label: "Thumbs up", icon: "👍" },
  { clip: "Jump", label: "Jump", icon: "🦘" },
  { clip: "Yes", label: "Nod", icon: "✅" },
  { clip: "No", label: "Nope", icon: "🙅" },
  { clip: "Punch", label: "Hero punch", icon: "🥊" },
  { clip: "Sitting", label: "Sit down", icon: "🪑", loop: true },
  { clip: "Death", label: "Dramatic faint", icon: "💀" },
];

/** What it does at each corner of its rounds. */
export const TRICKS_ALL = ["Wave", "Dance", "ThumbsUp", "Jump", "Yes"];
export const GREETINGS = [
  "Hey there! Welcome to the show that never closes.",
  "Oh hi! Looking for anything? Press E and ask me.",
  "Beep boop. That's robot for welcome!",
  "New arrival! Say hi, I don't bite. No teeth.",
];
export const JOKES = [
  "Why did the comic book go to the doctor? It had too many issues.",
  "I asked a cosplayer for directions. They said 'follow the plot'.",
  "What do you call a robot who loves conventions? Me.",
  "I tried to read a comic in the dark. Couldn't see the point, so I turned on the panels.",
  "My favourite booth is the one with free samples. Of electricity.",
  "What's a superhero's favourite part of a comic con? The booth-tiful art.",
];
export const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
