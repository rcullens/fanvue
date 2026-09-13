/**
 * Free TTS: prefer edge-tts (venv), fallback espeak-ng, then ffmpeg silence + captions-only.
 */
import { spawn } from "child_process";
import { promises as fs, accessSync, constants as fsConstants } from "fs";
import path from "path";
import { AUDIO_DIR, TMP_DIR, ensureMediaDirs, toMediaRel } from "./paths";

export type TtsVoice = {
  id: string;
  label: string;
  /** edge-tts voice name when using Edge */
  edgeVoice?: string;
  gender?: "female" | "male" | "neutral";
};

export const FREE_VOICES: TtsVoice[] = [
  {
    id: "en-US-AriaNeural",
    label: "Aria (US · female)",
    edgeVoice: "en-US-AriaNeural",
    gender: "female",
  },
  {
    id: "en-US-JennyNeural",
    label: "Jenny (US · female)",
    edgeVoice: "en-US-JennyNeural",
    gender: "female",
  },
  {
    id: "en-US-GuyNeural",
    label: "Guy (US · male)",
    edgeVoice: "en-US-GuyNeural",
    gender: "male",
  },
  {
    id: "en-GB-SoniaNeural",
    label: "Sonia (UK · female)",
    edgeVoice: "en-GB-SoniaNeural",
    gender: "female",
  },
  {
    id: "en-AU-NatashaNeural",
    label: "Natasha (AU · female)",
    edgeVoice: "en-AU-NatashaNeural",
    gender: "female",
  },
];

export type TtsResult = {
  audioPath: string; // absolute
  audioRel: string;
  engine: "edge-tts" | "espeak-ng" | "silence-placeholder";
  voiceId: string;
};

function run(
  cmd: string,
  args: string[],
  opts?: { cwd?: string }
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts?.cwd,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      resolve({ code: 127, stdout, stderr: String(err) });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function edgeTtsBin(): string | null {
  const venv = path.join(process.cwd(), ".venv-tts", "bin", "edge-tts");
  try {
    accessSync(venv, fsConstants.X_OK);
    return venv;
  } catch {
    /* try PATH / user install */
  }
  return "edge-tts";
}

export async function detectTtsEngine(): Promise<
  "edge-tts" | "espeak-ng" | "silence-placeholder"
> {
  const bin = edgeTtsBin();
  if (bin) {
    const probe = await run(bin, ["--version"]);
    if (probe.code === 0 || probe.stdout || probe.stderr.includes("edge-tts")) {
      // edge-tts --version may exit 0
      const list = await run(bin, ["--list-voices"]);
      if (list.code === 0 || list.stdout.includes("Neural")) {
        return "edge-tts";
      }
    }
  }
  const es = await run("espeak-ng", ["--version"]);
  if (es.code === 0) return "espeak-ng";
  const es2 = await run("espeak", ["--version"]);
  if (es2.code === 0) return "espeak-ng";
  return "silence-placeholder";
}

export async function synthesizeSpeech(opts: {
  text: string;
  voiceId?: string;
  jobId: string;
}): Promise<TtsResult> {
  await ensureMediaDirs();
  const voice =
    FREE_VOICES.find((v) => v.id === opts.voiceId) || FREE_VOICES[0];
  const outMp3 = path.join(AUDIO_DIR, `${opts.jobId}.mp3`);
  const outWav = path.join(AUDIO_DIR, `${opts.jobId}.wav`);
  const engine = await detectTtsEngine();

  const clean = opts.text.replace(/\s+/g, " ").trim().slice(0, 4000);
  if (!clean) {
    throw new Error("Script text is empty");
  }

  if (engine === "edge-tts") {
    const bin = edgeTtsBin()!;
    const r = await run(bin, [
      "--voice",
      voice.edgeVoice || voice.id,
      "--text",
      clean,
      "--write-media",
      outMp3,
    ]);
    if (r.code === 0) {
      try {
        await fs.access(outMp3);
        return {
          audioPath: outMp3,
          audioRel: toMediaRel(outMp3),
          engine: "edge-tts",
          voiceId: voice.id,
        };
      } catch {
        /* fall through */
      }
    }
    // fall through to next engines
  }

  if (engine === "espeak-ng" || engine === "edge-tts") {
    const espeak = (await run("espeak-ng", ["--version"])).code === 0
      ? "espeak-ng"
      : "espeak";
    const wavTmp = path.join(TMP_DIR, `${opts.jobId}-espeak.wav`);
    const r = await run(espeak, [
      "-v",
      "en",
      "-s",
      "150",
      "-w",
      wavTmp,
      clean,
    ]);
    if (r.code === 0) {
      const conv = await run("ffmpeg", [
        "-y",
        "-i",
        wavTmp,
        "-c:a",
        "libmp3lame",
        "-q:a",
        "4",
        outMp3,
      ]);
      if (conv.code === 0) {
        await fs.unlink(wavTmp).catch(() => undefined);
        return {
          audioPath: outMp3,
          audioRel: toMediaRel(outMp3),
          engine: "espeak-ng",
          voiceId: voice.id,
        };
      }
    }
  }

  // Silence placeholder (~max(4s, ~words/2.5)) so video still renders
  const words = clean.split(/\s+/).length;
  const dur = Math.max(4, Math.min(60, Math.ceil(words / 2.5)));
  const r = await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `anullsrc=r=44100:cl=mono`,
    "-t",
    String(dur),
    "-c:a",
    "libmp3lame",
    "-q:a",
    "9",
    outMp3,
  ]);
  if (r.code !== 0) {
    // last resort wav
    const r2 = await run("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=0:duration=${dur}`,
      outWav,
    ]);
    if (r2.code !== 0) {
      throw new Error(`TTS placeholder failed: ${r.stderr || r2.stderr}`);
    }
    return {
      audioPath: outWav,
      audioRel: toMediaRel(outWav),
      engine: "silence-placeholder",
      voiceId: voice.id,
    };
  }
  return {
    audioPath: outMp3,
    audioRel: toMediaRel(outMp3),
    engine: "silence-placeholder",
    voiceId: voice.id,
  };
}
