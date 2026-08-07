import os

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

from pypdf import PdfReader
from PIL import Image
from faster_whisper import WhisperModel
import subprocess
import git

# --- Lazy-loaded singleton, NOT loaded at import time ---
_whisper_model = None

def get_whisper():
    global _whisper_model
    if _whisper_model is None:
        _whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
    return _whisper_model


def extract_pdf(path):
    reader = PdfReader(path)
    pages = []
    for page_number, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""

        pages.append(
            f"\n\x0cPAGE:{page_number}\x0c\n{text}"
        )

    return "\n".join(pages)

def extract_image(path):
    import pytesseract
    return pytesseract.image_to_string(Image.open(path))


def extract_audio(path):
    model = get_whisper()
    segments, _ = model.transcribe(path)
    return " ".join(s.text for s in segments)


def extract_video(path):
    audio_path = path + ".wav"
    subprocess.run(
        ["ffmpeg", "-i", path, "-ar", "16000", "-ac", "1", audio_path, "-y"],
        check=True,
    )
    return extract_audio(audio_path)


def extract_github(repo_url, dest="/tmp/repos"):
    name = repo_url.rstrip("/").split("/")[-1]
    local = os.path.join(dest, name)
    if not os.path.exists(local):
        git.Repo.clone_from(repo_url, local)
    texts = []
    for root, _, files in os.walk(local):
        for f in files:
            if f.endswith((".py", ".js", ".ts", ".md", ".java", ".go")):
                with open(os.path.join(root, f), errors="ignore") as fh:
                    texts.append(fh.read())
    return "\n".join(texts)


def route_extract(path, filename):
    ext = filename.lower().split(".")[-1]
    if ext == "pdf":
        return extract_pdf(path)
    if ext in ("png", "jpg", "jpeg"):
        return extract_image(path)
    if ext in ("mp3", "wav", "m4a"):
        return extract_audio(path)
    if ext in ("mp4", "mov", "mkv"):
        return extract_video(path)
    return open(path, errors="ignore").read()