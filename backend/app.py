from flask import Flask, request, jsonify,send_from_directory, abort
from google import genai
from dotenv import load_dotenv
import os
import re
import random
import shutil
import datetime
from gradio_client import Client
from moviepy import ImageClip, AudioFileClip, concatenate_videoclips
from flask_cors import CORS   # ✅ Add this line


load_dotenv()

app = Flask(__name__)
CORS(app) 

# Access your keys
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_KEY:
    raise ValueError("❌ GEMINI_API_KEY is missing! Please add it to your .env file.")


genie_client = genai.Client(api_key=GEMINI_KEY)
sd_client = Client("stabilityai/stable-diffusion")         # Stable Diffusion Gradio endpoint
tts_client = Client("NihalGazi/Text-To-Speech-Unlimited")  # Your TTS Gradio endpoint


def ensure_output_folder():
    today = datetime.date.today().isoformat()
    out = os.path.join(os.getcwd(), today)
    os.makedirs(out, exist_ok=True)
    return out


def normalize_sd_result(raw_result):
    """
    Normalize SD predict result into a list of {'image': path} dicts.
    Handles common return shapes:
    - a tuple where first element is list/dict
    - a list of dicts already
    - a single dict with 'image' key
    - a single string path (wrap into list)
    """
    # Unpack tuple-like
    if isinstance(raw_result, tuple) or isinstance(raw_result, list) and len(raw_result) == 2 and isinstance(raw_result[0], str) and isinstance(raw_result[1], str):
        # This might be TTS-like; return a single path
        return [{"image": raw_result[0]}]

    if isinstance(raw_result, tuple):
        raw_result = raw_result[0]

    # If it's a string path
    if isinstance(raw_result, str):
        return [{"image": raw_result}]

    # If it's a dict with 'image'
    if isinstance(raw_result, dict):
        if "image" in raw_result:
            return [ {"image": raw_result["image"]} ]
        # maybe nested
        return [ {"image": str(raw_result)} ]

    # If it's already a list (common case)
    if isinstance(raw_result, list):
        out = []
        for item in raw_result:
            if isinstance(item, dict) and "image" in item:
                out.append({"image": item["image"]})
            elif isinstance(item, str):
                out.append({"image": item})
            else:
                # fallback to string representation
                out.append({"image": str(item)})
        return out

    # Fallback
    return [{"image": str(raw_result)}]

@app.route("/generate-story", methods=["POST"])
def generate_story():
    try:
        data = request.get_json()
        mode = data.get("mode", "new")
        text = data.get("text", "").strip()

        if not text:
            return jsonify({"error": "Field 'text' is required."}), 400

        # Build the prompt dynamically
        if mode == "new":
            prompt = f"""
            Write a short epic story of about 200 words. it does not have to end in this part but if it is not ending, it should end at a cliffhanger. 
            Use vivid, cinematic descriptions and dramatic narration. Avoid dialogue.
            Story keywords/themes: {text}
            """
        elif mode == "continue":
            prompt = f"""
            Continue the following epic story in the same tone and style, adding about 200 more words:

            {text}

            Make sure the continuation feels natural and builds on what’s already written.
            """
        else:
            return jsonify({"error": "Invalid mode. Must be 'new' or 'continue'."}), 400

        # Call Gemini API
        print("[INFO] Requesting story from Gemini...")
        story_res = genie_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )
        story = story_res.text.strip()

        return jsonify({"story": story})

    except Exception as e:
        print("[ERROR] Exception in /generate-story:", e)
        return jsonify({"error": str(e)}), 500

@app.route("/generate-scenes", methods=["POST"])
def generate_scenes():
    try:
        data = request.get_json()
        story = data.get("story", "").strip()

        if not story:
            return jsonify({"error": "Field 'story' is required."}), 400

        meta_prompt = f"""
        You are an expert visual storyteller.

        Break the following story into smaller scenes for narration AND image generation.

        For each scene, provide:
        1. NARRATION: a few sentences of narration from the story (no dialogue).
        2. PROMPT: a detailed image prompt suitable for AI image generation (describe landscape, characters, lighting, mood, weather, and camera angle).

        Format strictly like this for each scene:
        &NARRATION: ...&
        %PROMPT: ...%

        Separate scenes by a line break.

        Make as many scenes as needed so that each scene has a clear visual focus.
        If you cannot follow the exact format, still label clearly with "NARRATION:" and "PROMPT:" so parsing is easy.
        
        Story:
        {story}
        """

        print("[INFO] Requesting scene breakdown from Gemini...")
        prompts_res = genie_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=meta_prompt
        )
        prompts_text = prompts_res.text.strip()
        print("[INFO] Raw scene breakdown:", prompts_text)

        # ✅ More fault-tolerant parsing logic
        # Handles missing & or %, or inconsistent labels
        pattern = r"&?NARRATION:(.*?)(?:&|%PROMPT:|$)\s*(?:%PROMPT:)?(.*?)(?=(?:&NARRATION:|$))"
        matches = re.findall(pattern, prompts_text, re.DOTALL | re.IGNORECASE)

        scenes = []
        for narration, prompt in matches:
            narration = narration.strip()
            prompt = prompt.strip()

            # Skip empty noise
            if not narration and not prompt:
                continue

            # Handle accidental merge cases
            if not prompt and "PROMPT:" in narration:
                parts = re.split(r"PROMPT:", narration, 1)
                narration = parts[0].strip()
                prompt = parts[1].strip() if len(parts) > 1 else ""

            # Fallback for missing prompts
            if not prompt:
                prompt = "Cinematic visualization of the scene described above."

            scenes.append({
                "narration": narration,
                "prompt": prompt
            })

        if not scenes:
            return jsonify({
                "error": "No scenes could be parsed from Gemini output.",
                "raw_output": prompts_text
            }), 500

        return jsonify({
            "scene_count": len(scenes),
            "scenes": scenes
        })

    except Exception as e:
        print("[ERROR] Exception in /generate-scenes:", e)
        return jsonify({"error": str(e)}), 500



@app.route("/generate-images", methods=["POST"])
def generate_images():
    try:
        data = request.get_json()
        scenes = data.get("scenes", [])

        if not scenes or not isinstance(scenes, list):
            return jsonify({"error": "Field 'scenes' (list) is required."}), 400

        # 1️⃣ Prepare output folder (date-based)
        out_dir = ensure_output_folder()

        results = []

        # 2️⃣ Generate images for each scene
        for idx, s in enumerate(scenes, start=1):
            prompt = s.get("prompt", "")
            narration = s.get("narration", "")

            if not prompt:
                continue

            print(f"[INFO] Generating image for scene {idx}...")

            try:
                sd_raw = sd_client.predict(
                    prompt=prompt + " --ar 9:16",
                    negative="bad quality",
                    scale=9,
                    api_name="/infer_1"
                )
            except Exception as e:
                print(f"[ERROR] Stable Diffusion failed for scene {idx}: {e}")
                sd_raw = None

            # 3️⃣ Save image(s)
            normalized = normalize_sd_result(sd_raw)
            scene_dir = os.path.join(out_dir, f"scene_{idx}")
            os.makedirs(scene_dir, exist_ok=True)
            image_paths = []

            for img_idx, item in enumerate(normalized, start=1):
                img_src = item.get("image")
                if not img_src:
                    continue

                dest_path = os.path.join(scene_dir, f"img_{img_idx}.jpg")

                # download or copy
                if img_src.startswith("http://") or img_src.startswith("https://"):
                    import requests
                    r = requests.get(img_src, stream=True)
                    with open(dest_path, "wb") as f:
                        for chunk in r.iter_content(1024):
                            f.write(chunk)
                else:
                    if os.path.exists(img_src):
                        shutil.copy(img_src, dest_path)

                image_paths.append(dest_path)
                print(f"[INFO] Scene {idx} image saved: {dest_path}")

            results.append({
                "scene_index": idx,
                "narration": narration,
                "prompt": prompt,
                "image_paths": image_paths
            })

        return jsonify({
            "scene_count": len(results),
            "output_folder": out_dir,
            "scenes": results
        })

    except Exception as e:
        print("[ERROR] Exception in /generate-images:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/generate-audio", methods=["POST"])
def generate_audio():
    try:
        data = request.get_json()
        scenes = data.get("scenes", [])
        output_folder = data.get("output_folder")

        if not scenes or not isinstance(scenes, list):
            return jsonify({"error": "Field 'scenes' (list) is required."}), 400
        if not output_folder or not os.path.exists(output_folder):
            return jsonify({"error": "Field 'output_folder' is required and must exist."}), 400

        audio_paths = []

        for idx, scene in enumerate(scenes, start=1):
            narration = scene.get("narration", "")
            if not narration:
                audio_paths.append(None)
                continue

            print(f"[INFO] Generating TTS for scene {idx}... {narration}...")

            try:
                result = tts_client.predict(
                    prompt=narration,
                    voice="ballad",
                    emotion="cinematic, storytelling",
                    use_random_seed=True,
                    specific_seed=12345,
                    api_name="/text_to_speech_app"
                )
            except Exception as e:
                print(f"[ERROR] TTS generation failed for scene {idx}: {e}")
                audio_paths.append(None)
                continue

            # Extract audio path
            audio_src = None
            if isinstance(result, (tuple, list)) and len(result) > 0:
                audio_src = result[0]
            elif isinstance(result, str):
                audio_src = result

            if not audio_src:
                print(f"[WARN] No audio file returned for scene {idx}")
                audio_paths.append(None)
                continue

            dest_audio = os.path.join(output_folder, f"{idx}.mp3")

            # Download or copy audio file
            if audio_src.startswith("http://") or audio_src.startswith("https://"):
                import requests
                r = requests.get(audio_src, stream=True)
                with open(dest_audio, "wb") as f:
                    for chunk in r.iter_content(1024):
                        f.write(chunk)
                print(f"[INFO] Downloaded remote TTS -> {dest_audio}")
            else:
                if os.path.exists(audio_src):
                    shutil.copy(audio_src, dest_audio)
                    print(f"[INFO] Copied local TTS -> {dest_audio}")
                else:
                    print(f"[WARN] Missing local TTS file: {audio_src}")

            audio_paths.append(dest_audio)

        return jsonify({
            "audio_count": len(audio_paths),
            "output_folder": output_folder,
            "audio_paths": audio_paths
        })

    except Exception as e:
        print("[ERROR] Exception in /generate-audio:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/prepare-video-folder", methods=["POST"])
def prepare_video_folder():
    try:
        data = request.get_json()
        scenes = data.get("scenes", [])
        source_folder = data.get("source_folder")

        if not scenes or not isinstance(scenes, list):
            return jsonify({"error": "Field 'scenes' (list) is required."}), 400
        if not source_folder or not os.path.exists(source_folder):
            return jsonify({"error": "Field 'source_folder' is required and must exist."}), 400

        # Create a new output folder for the final video
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        final_folder = os.path.join(os.getcwd(), f"final_{timestamp}")
        os.makedirs(final_folder, exist_ok=True)

        print(f"[INFO] Preparing video folder: {final_folder}")

        for scene in scenes:
            idx = scene.get("scene_index")
            selected_indices = scene.get("selected_image_indices", [])
            all_images = scene.get("all_images", [])
            audio_url = scene.get("audio_url", "")

            # Create scene directory in final folder
            final_scene_dir = os.path.join(final_folder, f"scene_{idx}")
            os.makedirs(final_scene_dir, exist_ok=True)

            # Copy selected images (or all if none selected)
            if selected_indices and len(selected_indices) > 0:
                # Copy only selected images
                for img_idx, selected_img_idx in enumerate(selected_indices, start=1):
                    if selected_img_idx < len(all_images):
                        src_img = all_images[selected_img_idx]
                        if os.path.exists(src_img):
                            dest_img = os.path.join(final_scene_dir, f"img_{img_idx}.jpg")
                            shutil.copy(src_img, dest_img)
                            print(f"[INFO] Copied selected image {selected_img_idx} -> {dest_img}")
            else:
                # Copy all images if none selected
                source_scene_dir = os.path.join(source_folder, f"scene_{idx}")
                if os.path.exists(source_scene_dir):
                    for img_file in sorted(os.listdir(source_scene_dir)):
                        if img_file.lower().endswith(('.jpg', '.jpeg', '.png')):
                            src_img = os.path.join(source_scene_dir, img_file)
                            dest_img = os.path.join(final_scene_dir, img_file)
                            shutil.copy(src_img, dest_img)
                            print(f"[INFO] Copied all images: {dest_img}")

            # Copy audio file
            source_audio = os.path.join(source_folder, f"{idx}.mp3")
            if os.path.exists(source_audio):
                dest_audio = os.path.join(final_folder, f"{idx}.mp3")
                shutil.copy(source_audio, dest_audio)
                print(f"[INFO] Copied audio: {dest_audio}")
            else:
                print(f"[WARN] Audio file not found: {source_audio}")

        print(f"[INFO] ✅ Video folder prepared: {final_folder}")

        return jsonify({
            "output_folder": final_folder,
            "scene_count": len(scenes)
        })

    except Exception as e:
        print("[ERROR] Exception in /prepare-video-folder:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/create-video", methods=["POST"])
def create_video():
    try:
        data = request.get_json()
        output_folder = data.get("output_folder")
        scenes = data.get("scenes", [])
        output_filename = data.get("output_filename", "final_story.mp4")

        if not output_folder or not os.path.exists(output_folder):
            return jsonify({"error": "Field 'output_folder' is required and must exist."}), 400
        if not scenes or not isinstance(scenes, list):
            return jsonify({"error": "Field 'scenes' (list) is required."}), 400

        all_scene_clips = []

        for scene in scenes:
            idx = scene.get("scene_index")
            scene_dir = os.path.join(output_folder, f"scene_{idx}")
            audio_path = os.path.join(output_folder, f"{idx}.mp3")

            if not os.path.exists(audio_path):
                print(f"[WARN] Missing audio for scene {idx}")
                continue

            audio_clip = AudioFileClip(audio_path)
            audio_duration = audio_clip.duration

            image_files = sorted(
                [os.path.join(scene_dir, f) for f in os.listdir(scene_dir) if f.lower().endswith(".jpg")]
            )
            if not image_files:
                print(f"[WARN] No images found for scene {idx}")
                continue

            duration_per_image = audio_duration / len(image_files)
            print(f"[INFO] Scene {idx}: {len(image_files)} images, {duration_per_image:.2f}s per image")

            scene_clips = []
            for img_path in image_files:
                img_clip = ImageClip(img_path).with_duration(duration_per_image)
                scene_clips.append(img_clip)

            scene_video = concatenate_videoclips(scene_clips, method="compose").with_audio(audio_clip)
            all_scene_clips.append(scene_video)

        if not all_scene_clips:
            return jsonify({"error": "No valid scenes or clips found."}), 500

        final_video = concatenate_videoclips(all_scene_clips, method="compose")
        output_path = os.path.join(output_folder, output_filename)
        final_video.write_videofile(output_path, fps=24, audio_codec="aac")

        print(f"[INFO] ✅ Final video created: {output_path}")

        return jsonify({
            "video_path": output_path,
            "output_folder": output_folder
        })

    except Exception as e:
        print("[ERROR] Exception in /create-video:", e)
        return jsonify({"error": str(e)}), 500


BASE_OUTPUT_DIR = r"D:\personal\ReelGenerater"  # ✅ your main output folder


@app.route('/get-image/<path:image_path>')
def get_image(image_path):
    """
    Serve an image from the generated scenes folder.
    Example: /get-image/2025-10-10/scene_1/img_1.jpg
    """
    full_path = os.path.join(BASE_OUTPUT_DIR, image_path)

    if not os.path.exists(full_path):
        print(f"❌ File not found: {full_path}")
        abort(404, description="Image not found")

    directory = os.path.dirname(full_path)
    filename = os.path.basename(full_path)
    return send_from_directory(directory, filename)


@app.route('/get-audio/<path:audio_path>')
def get_audio(audio_path):
    full_path = os.path.join(BASE_OUTPUT_DIR, audio_path)
    directory = os.path.dirname(full_path)
    filename = os.path.basename(full_path)
    return send_from_directory(directory, filename)

@app.route('/get-video/<path:video_path>')
def get_video(video_path):
    full_path = os.path.join(BASE_OUTPUT_DIR, video_path)
    directory = os.path.dirname(full_path)
    filename = os.path.basename(full_path)
    return send_from_directory(directory, filename)

if __name__ == "__main__":
    app.run(debug=True, port=5000)



# http://localhost:5000/get-image/2025-10-10/scene_1/img_1.jpg

# 2025-10-10\scene_1\img_2.jpg