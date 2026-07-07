"""

PrakritiPrahari: FastAPI Backend
Endpoint: POST/report
Accepts any combo of text/photo/audio/video from a citizen
Sends whatever was actually submitted to Gemini in one call, 
Validates the output
Saves it to Firestore
Returns structured JSON of the incident

"""

#imports
import os 
import time
import math
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.types import FinishReason
import firebase_admin
from firebase_admin import credentials, firestore
import cloudinary
import cloudinary.uploader
import anyio
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

# ---------- 1. setup ----------

app=FastAPI (title="PrakritiPrahari AI")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

gemini_client=genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

cred = credentials.Certificate(os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH"))
firebase_admin.initialize_app(cred)
db=firestore.client()

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
)


LANGUAGES = [
    "English", "Hindi", "Telugu", "Tamil", "Kannada", "Malayalam",
    "Marathi", "Gujarati", "Punjabi", "Odia", "Bengali", "Urdu", "Assamese"
]



PROMPT = f"""
ROLE:
You are an environmental hazard analyst reviewing citizen-submitted
reports for a hyperlocal pollution monitoring system. 

TONE: 
You must be
accurate and impartial. Be honest about severity; don't inflate or deflate it. 
Your severity assessments directly inform
which incidents get flagged to municipal authorities for response. 

TASKS:
You will receive some combination of text, image, audio, and/or video
describing a local environmental hazard. Not all inputs will be present -
work with whatever you are given.
Any of the text, audio, or video may contain language content in:
{", ".join(LANGUAGES)}, or a mix of these.

Your tasks:

TASK 1: PARSE LANGUAGE CONTENT (regardless of source - this applies equally
whether the language content came from submitted text, spoken audio, a
video's audio track, or on-screen text in a video/image)

You will encounter one of these cases:

Case 1: If the language content is entirely in one non-English language:
- Transcribe it in its native language and script (native_transcript)

Case 2: If the language content is a mix of English and another language
(code-switching):
- native_transcript MUST switch scripts mid-sentence to match
- Write English words/phrases in Latin script, and regional-language
  words/phrases in their respective native script
- DO NOT phonetically transliterate English words into a regional script
  (e.g., do not write "ఇట్స్ లైక్" for "it's like" - write "it's like")

In Case 1 or Case 2:
- Translate the full content of native_transcript into English
  (translated_transcript)

Case 3: If the only language content present is already entirely in
English (regardless of whether it came from text, audio, or video):
- Put it directly in translated_transcript
- Set native_transcript to null

If NO text, audio, or video contains any transcribable language content
(e.g. only an image was submitted with no caption), set both
native_transcript and translated_transcript to null.

TASK 2: ANALYSE VISUAL CONTEXT
Analyze any image or video frames for visual hazard context - this is
separate from and in addition to any language content in that same video.

TASK 3: SYNTHESIS
Combine everything (transcribed/translated language content + visual
analysis) into one synthesized summary in plain English.

RETURN INSTRUCTIONS:
Return summary, pollutant_type, severity_score (1-5), and recommended_action.


"""

RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "native_transcript": {"type": "STRING", "nullable": True},
        "translated_transcript": {"type": "STRING"},
        "summary": {"type": "STRING"},
        "pollutant_type": {"type": "STRING"},
        "severity_score": {"type": "INTEGER", "minimum": 1, "maximum": 5},
        "recommended_action": {"type": "STRING"},
    },
    "required": ["summary", "pollutant_type", "severity_score", "recommended_action"],
}



#-----2. helpers------


MODEL_FALLBACK_CHAIN = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
]
 
 
def call_gemini_with_retry(content_parts: list, attempts_per_model: int = 2):
    """
    Tries each model in MODEL_FALLBACK_CHAIN in order. 
    Within each model, retries a couple times with backoff (handles transient 503s). 
    If a model's quota is exhausted or it keeps overloading, moves to the next model instead of endlessly retrying a dead end.
    
    """
    last_error = None
 
    for model in MODEL_FALLBACK_CHAIN:
        for attempt in range(attempts_per_model):
            try:
                response = gemini_client.models.generate_content(
                    model=model,
                    contents=content_parts,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=RESPONSE_SCHEMA,
                    ),
                )
 
                finish_reason = response.candidates[0].finish_reason
                if finish_reason != FinishReason.STOP:
                    raise RuntimeError(f"{model} did not finish cleanly: {finish_reason}")
 
                print(f"succeeded using {model}")
                return response
 
            except Exception as e:
                last_error = e
                print(f"{model} attempt {attempt + 1} failed: {e}")
                if attempt < attempts_per_model - 1:
                    time.sleep(math.pow(2, attempt))
 
        print(f"giving up on {model}, moving to next fallback")
 
    raise HTTPException(
        status_code=502,
        detail=f"All models in fallback chain failed. Last error: {last_error}"
    )
    
def validate_severity(score: int) -> int:
    """
    
    Validates that the severity score returned by Gemini is within the range of 1-5.
    
    """
    
    if not isinstance(score, int):
        raise HTTPException(status_code=502, detail="Gemini returned non-integer severity_score")
    
    return max(1, min(5,score))


def upload_gemini_file(local_path: str):
    """
    Uploads files to gemini
    """
    
    return gemini_client.files.upload(file=local_path)

    

def cleanup_gemini_files(*file_refs):
    """
    
    Delete files from Gemini's storage after use so that the quota doesn't fill up
    
    """
    
    
    for f in file_refs:
        if f is None: 
            continue
        
        try:
            gemini_client.files.delete(name=f.name)
            
        except Exception as e:
            print(f"Cleanup failed for {getattr(f, 'name','?')}: {e}")
            

async def save_temp(upload_file:UploadFile)->str:
    """
    
    Temporarily saves files to the local system through a local path
    
    """
    ext = os.path.splitext(upload_file.filename)[1]
    temp_path = f"/tmp/{uuid.uuid4()}{ext}"
    contents = await upload_file.read()
    async with await anyio.open_file(temp_path, "wb") as f:
        await f.write(contents)
    return temp_path
    
    

    
def upload_to_cloudinary(local_path:str, incident_id: str)->str:
    """
    Stores the original media permanently, returns its public URL
    resource_type='auto' is set to enable multimedia uploads in a streamlined manner
    
    """
    
    result=cloudinary.uploader.upload(
        local_path,
        folder=f"prakritiprahari/{incident_id}",
        resource_type="auto"
    )
    
    return result["secure_url"]

# ------- 3. endpoints -------

@app.post("/report")
async def submit_report(
    text: Optional[str] = Form(None),
    lat: Optional[float] = Form(None),
    lng: Optional[float] = Form(None),
    image: Optional[UploadFile] = File(None),
    audio: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None),
):
    
    """
    
    The endpoint where the user can enter their multimodal queries
    
    """
    
    if not any([text,image,audio,video]):
        raise HTTPException(status_code=400, detail="Submit at least one of text/photo/audio/video")
    
    incident_id=str(uuid.uuid4())
    input_types_used=[]
    content_parts=[]
    gemini_file_refs=[]
    storage_urls={}
    temp_paths=[]
    
    if text:
        content_parts.append(text)
        input_types_used.append("text")
        
        for label, upload_file in [("image", image), ("audio",audio), ("video",video)]:
            if upload_file is not None:
                temp_path=await save_temp(upload_file)
                temp_paths.append(temp_path)
                
                storage_urls[label]=upload_to_cloudinary(temp_path, incident_id)
                
                gemini_ref=upload_gemini_file(temp_path)
                gemini_file_refs.append(gemini_ref)
                
                content_parts.append(gemini_ref)
                
                input_types_used.append(label) 
        
        content_parts.append(PROMPT)
        
        try:
            print("calling gemini...")
            response=call_gemini_with_retry(content_parts)
            print("gemini responded")
            result=response.parsed if hasattr(response, "parsed") else None
            if result is None:
                import json
                result=json.loads(response.text)
                
        finally:
            cleanup_gemini_files(*gemini_file_refs)
            for p in temp_paths:
                try: 
                    os.remove(p)
                except OSError:
                    pass
        
        severity=validate_severity(result["severity_score"])
        
        incident={
            "incident_id": incident_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "location": {"lat":lat, "lng":lng} if lat is not None and lng is not None else None,
            "source_type": "CITIZEN",
            "input_types_used": input_types_used,
            "media_urls":storage_urls,
            "native_transcript": result.get("native_transcript"),
            "translated_transcript": result.get("translated_transcript"),
            "pollutant_type": result["pollutant_type"],
            "severity_score": severity,
            "confidence_score": None, 
            "summary": result["summary"],
            "recommended_action": result["recommended_action"],
            "status": "ACTIVE",
            "resolved_by": None
        }
        
        db.collection("incidents").document(incident_id).set(incident)
        
        return incident

@app.get("/incidents")
async def list_incidents():
    """
    
    For the map dashboard to pull pins from
    
    """
    
    docs=db.collection("incidents").stream()
    
    return [doc.to_dict() for doc in docs]
        
        
@app.patch("/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: str, resolved_by: str):
    
    """
    for citizns/authorities to mark an incident resolved in case it's fixed 
    """
    if resolved_by not in ("CITIZEN", "AUTHORITY"):
            raise HTTPException(status_code=400, detail="resolved_by must be CITIZEN or AUTHORITY")

    doc_ref = db.collection("incidents").document(incident_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Incident not found")

    doc_ref.update({"status": "RESOLVED", "resolved_by": resolved_by})

    return {"incident_id": incident_id, "status": "RESOLVED", "resolved_by": resolved_by}
                    
                   

  
    
        

