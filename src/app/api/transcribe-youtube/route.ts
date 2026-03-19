import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const cacheRoot = path.join(process.cwd(), ".cache", "huggingface");

const stripWarnings = (text: string) =>
  text
    .split(/\r?\n/)
    .filter(
      (line) =>
        !line.includes("Intel MKL WARNING") &&
        !line.includes("oneAPI Math Kernel Library") &&
        !line.includes("Support of Intel")
    )
    .join("\n")
    .trim();

const isYouTubeUrl = (value: string) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return host === "youtu.be" || host.endsWith("youtube.com");
  } catch {
    return false;
  }
};

export async function POST(request: Request) {
  let tempDir: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url || !isYouTubeUrl(url)) {
      return NextResponse.json(
        { error: "Please provide a valid YouTube URL." },
        { status: 400 }
      );
    }

    try {
      await execFileAsync("yt-dlp", ["--version"]);
    } catch {
      return NextResponse.json(
        {
          error:
            "Missing yt-dlp. Install yt-dlp (and ffmpeg for mp3 conversion) on the server.",
        },
        { status: 500 }
      );
    }

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-audio-"));
    const outputTemplate = path.join(tempDir, "audio.%(ext)s");
    const args = [
      "--no-playlist",
      "-f",
      "bestaudio",
      "-x",
      "--audio-format",
      "mp3",
      "-o",
      outputTemplate,
      url,
    ];

    await execFileAsync("yt-dlp", args, { timeout: 1000 * 60 * 5 });

    const audioPath = path.join(tempDir, "audio.mp3");
    const stats = await fs.stat(audioPath);
    const maxSize = 25 * 1024 * 1024;
    if (stats.size > maxSize) {
      return NextResponse.json(
        { error: "Audio file exceeds 25MB. Please use a shorter clip." },
        { status: 413 }
      );
    }
    const pythonPath = path.join(process.cwd(), ".venv", "bin", "python");
    const scriptPath = path.join(process.cwd(), "scripts", "transcribe_local.py");

    await fs.mkdir(cacheRoot, { recursive: true });

    const { stdout } = await execFileAsync(
      pythonPath,
      [scriptPath, audioPath],
      {
        timeout: 1000 * 60 * 10,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          HF_HOME: cacheRoot,
          XDG_CACHE_HOME: path.join(process.cwd(), ".cache"),
          TRANSFORMERS_CACHE: cacheRoot,
          KMP_WARNINGS: "0",
          MKL_VERBOSE: "0",
        },
      }
    );

    return NextResponse.json({ text: stripWarnings(stdout) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}
