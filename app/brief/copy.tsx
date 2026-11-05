"use client";
export default function CopyBrief({ text }: { text: string }) {
  return (
    <button
      className="bulk copybtn"
      onClick={() => navigator.clipboard.writeText(text)}
    >
      Copy for Discord
    </button>
  );
}
