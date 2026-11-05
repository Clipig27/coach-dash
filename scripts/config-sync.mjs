// On Railway the volume at /app/data hides the repo's data/ folder.
// build: snapshot the repo's roster + sidebar order. start: copy them onto the volume.
// The repo is the source of truth for these two files; everything else in data/ lives on the volume.
import fs from "fs";

const FILES = ["roster.md", "discord_channel_order.md"];
const SNAP = ".config-snapshot";
const mode = process.argv[2];

for (const f of FILES) {
  if (mode === "snapshot") {
    fs.mkdirSync(SNAP, { recursive: true });
    fs.copyFileSync(`data/${f}`, `${SNAP}/${f}`);
  } else if (mode === "restore" && fs.existsSync(`${SNAP}/${f}`)) {
    fs.mkdirSync("data", { recursive: true });
    fs.copyFileSync(`${SNAP}/${f}`, `data/${f}`);
  }
}
