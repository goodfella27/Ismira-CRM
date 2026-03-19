import os
import sys

from faster_whisper import WhisperModel


def format_timestamp(seconds: float) -> str:
    total_seconds = max(0, int(seconds))
    minutes, sec = divmod(total_seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{sec:02d}"
    return f"{minutes:02d}:{sec:02d}"


def main() -> int:
    if len(sys.argv) < 2:
        print("Missing audio file path", file=sys.stderr)
        return 1

    audio_path = sys.argv[1]
    if not os.path.exists(audio_path):
        print("Audio file not found", file=sys.stderr)
        return 1

    model_size = os.environ.get("WHISPER_MODEL", "base")
    device = os.environ.get("WHISPER_DEVICE", "cpu")
    compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
    language = os.environ.get("WHISPER_LANGUAGE") or None
    vad_filter = os.environ.get("WHISPER_VAD_FILTER", "true").lower() != "false"
    beam_size = int(os.environ.get("WHISPER_BEAM_SIZE", "5"))
    best_of = int(os.environ.get("WHISPER_BEST_OF", "5"))
    temperature = float(os.environ.get("WHISPER_TEMPERATURE", "0.0"))
    no_speech_threshold = float(os.environ.get("WHISPER_NO_SPEECH", "0.6"))
    log_prob_threshold = float(os.environ.get("WHISPER_LOGPROB", "-1.0"))
    compression_ratio = float(os.environ.get("WHISPER_COMPRESSION", "2.4"))

    model = WhisperModel(model_size, device=device, compute_type=compute_type)
    segments, _info = model.transcribe(
        audio_path,
        language=language,
        beam_size=beam_size,
        best_of=best_of,
        temperature=temperature,
        vad_filter=vad_filter,
        no_speech_threshold=no_speech_threshold,
        log_prob_threshold=log_prob_threshold,
        compression_ratio_threshold=compression_ratio,
        condition_on_previous_text=False,
    )

    parts = []
    for segment in segments:
        text = (segment.text or "").strip()
        if text:
            timestamp = format_timestamp(segment.start or 0)
            parts.append(f"[{timestamp}] {text}")

    transcript = "\n".join(parts)
    # Guard against noisy library warnings leaking into output.
    for noisy in [
        "Intel MKL WARNING",
        "oneAPI Math Kernel Library",
        "Support of Intel",
    ]:
        transcript = "\n".join(
            line for line in transcript.splitlines() if noisy not in line
        ).strip()
    print(transcript)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
