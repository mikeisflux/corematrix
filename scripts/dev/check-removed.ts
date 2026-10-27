import { hallLayout, boothSpace } from "@/lib/hall/layout";
const all = hallLayout();
console.log("booths", all.length, "1706", boothSpace(all.find((b) => b.label === "1706")?.id ?? -1) ? "present" : "gone", "1805", all.some((b) => b.label === "1805") ? "present" : "gone", "1702 id", all.find((b) => b.label === "1702")?.id, "1708 id", all.find((b) => b.label === "1708")?.id);
