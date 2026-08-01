from pypdf import PdfReader
from PIL import Image
from faster_whisper import WhisperModel
import subprocess,os,git

# whisper_model = WhisperModel("base", device="cpu", compute_type="int8")

def extract_pdf(path):
    reader = PdfReader(path)
    return "\n".join(p.extract_text() or "" for p in reader.pages)

def extract_image(path):
    import pytesseract
    return pytesseract.image_to_string(Image.open(path))

def extract_audio(path):
    segments, info = whisper_model.transcribe(path)
    return " ".join(s.text for s in segments)

def extract_video(path):
    audio_path = path + '.wav'
    subprocess.run(["ffmpeg", "-i", path, "-ar", "16000",
                    "-ac", "1", audio_path, "-y"], check=True)
    return extract_audio(audio_path)

def extract_git_repo(repo_url, dest="/tmp/repos"):
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

def route_extract(path,filename):
    ext = filename.lower().split(".")[-1]
    if ext == "pdf": return extract_pdf(path)
    if ext in ("png", "jpg", "jpeg"): return extract_image(path)
    if ext in ("mp3", "wav", "m4a"): return extract_audio(path)
    if ext in ("mp4", "mov", "mkv"): return extract_video(path)
    return open(path, errors="ignore").read()