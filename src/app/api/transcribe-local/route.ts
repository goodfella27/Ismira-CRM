import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const cacheRoot = path.join(process.cwd(), ".cache", "huggingface");
const uploadRoot = path.join(os.tmpdir(), "ismira_uploads");

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

function getPythonPath() {
  const envPython = (process.env.TRANSCRIBE_PYTHON_PATH ?? "").trim();
  if (envPython) return envPython;

  const venvCandidates = [
    path.join(process.cwd(), ".venv", "bin", "python3"),
    path.join(process.cwd(), ".venv", "bin", "python"),
  ];
  for (const candidate of venvCandidates) {
    if (fsSync.existsSync(candidate)) return candidate;
  }

  return "python3";
}

function getScriptPath() {
  return path.join(process.cwd(), "scripts", "transcribe_local.py");
}

export async function POST(request: Request) {
  let cleanupPath: string | null = null;
  let cleanupIsDir = false;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let filePath: string | null = null;

    if (contentType.includes("application/json")) {
      const payload = await request.json().catch(() => null);
      const fileId =
        payload && typeof payload.fileId === "string" ? payload.fileId : null;
      if (!fileId || !/^[a-zA-Z0-9-]+$/.test(fileId)) {
        return NextResponse.json({ error: "Missing file id" }, { status: 400 });
      }
      const files = await fs.readdir(uploadRoot).catch(() => []);
      const match = files.find((name) => name.startsWith(`${fileId}__`));
      if (!match) {
        return NextResponse.json(
          { error: "Uploaded file not found" },
          { status: 404 }
        );
      }
      filePath = path.join(uploadRoot, match);
      cleanupPath = filePath;
      cleanupIsDir = false;
    } else {
      const form = await request.formData();
      const file = form.get("file");
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: "Missing audio file" },
          { status: 400 }
        );
      }

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-whisper-"));
      filePath = path.join(tempDir, file.name || "audio");
      const bytes = await file.arrayBuffer();
      await fs.writeFile(filePath, Buffer.from(bytes));
      cleanupPath = tempDir;
      cleanupIsDir = true;
    }

    const pythonPath = getPythonPath();
    const scriptPath = getScriptPath();

    await fs.mkdir(cacheRoot, { recursive: true });

    if (!filePath) {
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
    }

    const { stdout } = await execFileAsync(pythonPath, [scriptPath, filePath], {
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
    });

    return NextResponse.json({ text: stripWarnings(stdout) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (cleanupPath) {
      if (cleanupIsDir) {
        await fs.rm(cleanupPath, { recursive: true, force: true });
      } else {
        await fs.rm(cleanupPath, { force: true });
      }
    }
  }
}
