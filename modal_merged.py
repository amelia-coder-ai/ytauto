from io import BytesIO
from pathlib import Path
from typing import Optional, List
import base64
import tempfile
import os

import modal

image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.8.1-devel-ubuntu22.04",
        add_python="3.11",
    )
    .entrypoint([])
    .apt_install("git", "ffmpeg", "espeak-ng")
    .pip_install("uv")
    .run_commands(
        "uv pip install --system --compile-bytecode flask torch==2.7.1 --extra-index-url https://download.pytorch.org/whl/cu128"
    )
    .run_commands(
        "uv pip install --system --compile-bytecode 'diffusers>=0.36.0' git+https://github.com/Disty0/sdnq"
    )
    .run_commands(
        "uv pip install --system --compile-bytecode 'kokoro>=0.9.4' soundfile ffmpeg-python Pillow"
    )
    .add_local_dir("modal_overlays", "/overlays", copy=True)
)

MODEL_NAME = "Disty0/Z-Image-Turbo-SDNQ-uint4-svd-r32"

CACHE_DIR = "/cache"
cache_volume = modal.Volume.from_name("hf-hub-cache", create_if_missing=True)
volumes = {CACHE_DIR: cache_volume}

image = image.env({"HF_HOME": CACHE_DIR})

app = modal.App("explainer-videos")

with image.imports():
    import torch
    import diffusers
    from sdnq.loader import apply_sdnq_options_to_model
    from flask import Flask, request, jsonify, send_file
    import soundfile as sf
    import ffmpeg
    import numpy as np
    from PIL import Image as PILImage
    from kokoro import KPipeline

OVERLAY_CONFIG = {
    "particles": {"file": "/overlays/particles.mp4", "blend": "screen"},
    "old-film": {"file": "/overlays/old-film.mp4", "blend": "multiply"},
}


def apply_zoompan(image_path, audio_path, clip_path, effect, width, height):
    import subprocess

    audio_duration = float(ffmpeg.probe(str(audio_path))["streams"][0]["duration"])
    num_frames = int(audio_duration * 30)
    n = max(num_frames - 1, 1)

    if effect == "none" or not effect:
        (
            ffmpeg.input(str(image_path), loop=1, t=audio_duration, framerate=30)
            .output(
                ffmpeg.input(str(audio_path)),
                str(clip_path),
                vcodec="libx264", acodec="aac", pix_fmt="yuv420p",
                shortest=None, **{"b:a": "192k"},
            )
            .overwrite_output()
            .run(quiet=True)
        )
        return

    if effect == "zoom-in":
        expr = f"z='1+0.3*on/{n}'"
    elif effect == "zoom-out":
        expr = f"z='1.3-0.3*on/{n}'"
    elif effect == "pan-left":
        max_x = round(width - width / 1.15, 2)
        expr = f"z=1.15:x='{max_x}-{max_x}*on/{n}'"
    elif effect == "pan-right":
        max_x = round(width - width / 1.15, 2)
        expr = f"z=1.15:x='{max_x}*on/{n}'"
    elif effect == "pan-up":
        max_y = round(height - height / 1.15, 2)
        expr = f"z=1.15:y='{max_y}-{max_y}*on/{n}'"
    elif effect == "pan-down":
        max_y = round(height - height / 1.15, 2)
        expr = f"z=1.15:y='{max_y}*on/{n}'"
    else:
        raise ValueError(f"Unknown effect: {effect}")

    zoompan = f"[0:v]zoompan={expr}:d={num_frames}:s={width}x{height}:fps=30[v]"

    print(f"Running zoompan filter: {zoompan}")
    cmd = [
        "ffmpeg",
        "-i", str(image_path),
        "-i", str(audio_path),
        "-filter_complex", zoompan,
        "-map", "[v]",
        "-map", "1:a",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-pix_fmt", "yuv420p",
        "-b:a", "192k",
        "-shortest",
        "-y",
        str(clip_path),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg stderr: {e.stderr}")
        raise


def apply_overlay(main_path, overlay_path, output_path, blend_mode, width, height, opacity=0.6):
    import subprocess

    filter_complex = (
        f"[0:v]format=yuv420p,extractplanes=y+u+v[my][mu][mv];"
        f"[1:v]scale={width}:{height},format=yuv420p,extractplanes=y[oy];"
        f"[my][oy]blend=all_mode={blend_mode}:all_opacity={opacity}[by];"
        f"[by][mu][mv]mergeplanes=0x001020:yuv420p[vout]"
    )

    cmd = [
        "ffmpeg",
        "-i", str(main_path),
        "-stream_loop", "-1", "-i", str(overlay_path),
        "-filter_complex", filter_complex,
        "-map", "[vout]",
        "-map", "0:a?",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-pix_fmt", "yuv420p",
        "-shortest",
        "-y",
        str(output_path),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        print(f"Overlay FFmpeg stderr: {e.stderr}")
        raise


@app.cls(
    image=image,
    gpu="L40s",
    volumes=volumes,
    scaledown_window=120,
    timeout=30 * 60,
)
class VideoGenerator:
    """Single container for both image generation and TTS - cost optimized."""

    @modal.enter()
    def enter(self):
        print("Loading ZImage model...")
        torch.set_float32_matmul_precision("high")

        self.pipe = diffusers.ZImagePipeline.from_pretrained(
            MODEL_NAME,
            torch_dtype=torch.float32,
            device_map="cuda",
            cache_dir=CACHE_DIR,
        )
        self.pipe.transformer = apply_sdnq_options_to_model(
            self.pipe.transformer, use_quantized_matmul=True
        )
        self.pipe.text_encoder = apply_sdnq_options_to_model(
            self.pipe.text_encoder, use_quantized_matmul=True
        )
        print("ZImage loaded!")

        print("Loading Kokoro TTS...")
        self.tts = KPipeline(lang_code="a")
        print("Kokoro loaded!")

        print("Both models ready!")

    def _generate_image(
        self,
        prompt: str,
        width: int = 1280,
        height: int = 720,
        num_inference_steps: int = 9,
        guidance_scale: float = 0.0,
        seed: Optional[int] = None,
    ) -> bytes:
        import random

        def adjust_dimensions(w, h, divisor=16, min_size=256):
            aspect_ratio = w / h
            for offset in range(0, max(w, 1000), divisor):
                for test_w in [w + offset, w - offset]:
                    if test_w < min_size:
                        continue
                    if test_w % divisor != 0:
                        continue
                    test_h = round(test_w / aspect_ratio)
                    if test_h < min_size:
                        continue
                    if test_h % divisor == 0:
                        return int(test_w), int(test_h)
            return (w // divisor) * divisor, (h // divisor) * divisor

        width, height = adjust_dimensions(width, height)

        if seed is None:
            seed = random.randint(0, 2**32 - 1)

        generator = torch.manual_seed(seed)

        print(f"Generating image: {prompt[:80]}...")
        print(f"Dimensions: {width}x{height}")

        img = self.pipe(
            prompt=prompt,
            height=height,
            width=width,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            generator=generator,
        ).images[0]

        byte_stream = BytesIO()
        img.save(byte_stream, format="PNG")
        return byte_stream.getvalue()

    def _generate_audio(
        self,
        text: str,
        voice: str = "af_heart",
        speed: float = 1.0,
    ) -> bytes:
        print(f"Generating audio: {text[:80]}...")

        audio_segments = []
        generator = self.tts(text, voice=voice, speed=speed)

        for i, (gs, ps, audio) in enumerate(generator):
            audio_segments.append(audio)

        if not audio_segments:
            raise ValueError("No audio generated")

        full_audio = np.concatenate(audio_segments)

        byte_stream = BytesIO()
        sf.write(byte_stream, full_audio, 24000, format="WAV")
        byte_stream.seek(0)
        return byte_stream.getvalue()

    @modal.method()
    def generate_video(
        self,
        scenes: List[dict],
        voice: str = "af_heart",
        tts_speed: float = 1.0,
        image_width: int = 1920,
        image_height: int = 1080,
        overlay_effect: str = "none",
    ) -> bytes:

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            clip_files = []

            for idx, scene in enumerate(scenes):
                print(f"\n{'='*50}")
                print(f"Processing scene {idx + 1}/{len(scenes)}")
                print(f"{'='*50}")

                narration = scene.get("narration", "")
                image_prompt = scene.get("image_prompt", "")
                effect = scene.get("effect", "none")

                if not narration or not image_prompt:
                    print(f"Skipping scene {idx + 1}: missing data")
                    continue

                # Generate audio directly - no .remote() call
                audio_bytes = self._generate_audio(
                    text=narration,
                    voice=voice,
                    speed=tts_speed,
                )

                audio_path = temp_path / f"scene_{idx}_audio.wav"
                with open(audio_path, "wb") as f:
                    f.write(audio_bytes)
                print(f"Audio saved: {audio_path}")

                # Generate image directly - no .remote() call
                image_bytes = self._generate_image(
                    prompt=image_prompt,
                    width=image_width,
                    height=image_height,
                )

                image_path = temp_path / f"scene_{idx}_image.png"
                with open(image_path, "wb") as f:
                    f.write(image_bytes)

                # Resize if needed
                adj_w = (image_width // 16) * 16
                adj_h = (image_height // 16) * 16
                if adj_w != image_width or adj_h != image_height:
                    img = PILImage.open(image_path)
                    img = img.resize((image_width, image_height), PILImage.Resampling.LANCZOS)
                    img.save(image_path)

                print(f"Image saved: {image_path}")

                # Get audio duration
                probe = ffmpeg.probe(str(audio_path))
                audio_duration = float(probe["streams"][0]["duration"])
                print(f"Audio duration: {audio_duration:.2f}s")

                # Create clip with optional camera effect
                clip_path = temp_path / f"scene_{idx}_clip.mp4"
                try:
                    apply_zoompan(
                        image_path, audio_path, clip_path,
                        effect, image_width, image_height,
                    )
                    print(f"Clip created: {clip_path}")
                    clip_files.append(str(clip_path))
                except ffmpeg.Error as e:
                    print(f"FFmpeg error: {e.stderr.decode() if e.stderr else str(e)}")
                    raise

            if not clip_files:
                raise ValueError("No video clips generated")

            print(f"\nMerging {len(clip_files)} clips...")

            final_video_path = temp_path / "final_video.mp4"

            if len(clip_files) == 1:
                import shutil
                shutil.copy(clip_files[0], final_video_path)
            else:
                concat_file = temp_path / "concat.txt"
                with open(concat_file, "w") as f:
                    for clip_file in clip_files:
                        f.write(f"file '{clip_file}'\n")

                try:
                    (
                        ffmpeg.input(str(concat_file), format="concat", safe=0)
                        .output(
                            str(final_video_path),
                            vcodec="libx264",
                            acodec="aac",
                            pix_fmt="yuv420p",
                        )
                        .overwrite_output()
                        .run(quiet=True)
                    )
                except ffmpeg.Error as e:
                    print(f"Concat error: {e.stderr.decode() if e.stderr else str(e)}")
                    raise

            # Apply overlay effect to the final video
            if overlay_effect and overlay_effect != "none" and overlay_effect in OVERLAY_CONFIG:
                print(f"\nApplying overlay effect: {overlay_effect}")

                overlay_info = OVERLAY_CONFIG[overlay_effect]
                overlay_file = overlay_info["file"]
                blend_mode = overlay_info["blend"]

                if os.path.exists(overlay_file):
                    overlaid_path = temp_path / "overlaid_video.mp4"
                    try:
                        apply_overlay(
                            final_video_path, overlay_file, overlaid_path,
                            blend_mode, image_width, image_height, opacity=0.6,
                        )
                        final_video_path = overlaid_path
                        print(f"Overlay applied: {overlaid_path}")
                    except Exception as e:
                        print(f"Overlay error: {e}")
                        raise
                else:
                    print(f"Overlay file not found: {overlay_file}, skipping overlay")

            print(f"Final video ready!")

            with open(final_video_path, "rb") as f:
                video_bytes = f.read()

            print(f"Video size: {len(video_bytes) / (1024*1024):.2f} MB")
            return video_bytes


@app.function(image=image, volumes=volumes, cpu=0.5, memory=2048, timeout=30 * 60)
@modal.wsgi_app()
def flask_app():
    web_app = Flask(__name__)

    @web_app.route("/")
    def health_check():
        return jsonify({"status": "alive"})

    @web_app.route("/generate-video", methods=["POST"])
    def generate_video():
        try:
            data = request.get_json(force=True)

            if isinstance(data, list):
                if len(data) == 0:
                    return jsonify({"error": "Empty input array"}), 400
                first_item = data[0]
                scenes = first_item.get("scenes", [])
                voice = first_item.get("voice", "af_heart")
                tts_speed = first_item.get("tts_speed", 1.0)
                image_width = first_item.get("image_width", 1920)
                image_height = first_item.get("image_height", 1080)
                return_base64 = first_item.get("return_base64", False)
                overlay_effect = first_item.get("overlay_effect", "none")
            else:
                scenes = data.get("scenes", [])
                voice = data.get("voice", "af_heart")
                tts_speed = data.get("tts_speed", 1.0)
                image_width = data.get("image_width", 1920)
                image_height = data.get("image_height", 1080)
                return_base64 = data.get("return_base64", False)
                overlay_effect = data.get("overlay_effect", "none")

            if not scenes:
                return jsonify({"error": "scenes array is required"}), 400

            for idx, scene in enumerate(scenes):
                if not scene.get("narration"):
                    return jsonify({"error": f"Scene {idx + 1} missing narration"}), 400
                if not scene.get("image_prompt"):
                    return jsonify({"error": f"Scene {idx + 1} missing image_prompt"}), 400

            print(f"Generating video with {len(scenes)} scenes...")
            print(f"Voice: {voice}, TTS Speed: {tts_speed}")
            print(f"Image dimensions: {image_width}x{image_height}")
            print(f"Overlay effect: {overlay_effect}")

            generator = VideoGenerator()
            video_bytes = generator.generate_video.remote(
                scenes=scenes,
                voice=voice,
                tts_speed=tts_speed,
                image_width=image_width,
                image_height=image_height,
                overlay_effect=overlay_effect,
            )

            if return_base64:
                video_base64 = base64.b64encode(video_bytes).decode("utf-8")
                return jsonify({
                    "video": video_base64,
                    "format": "mp4",
                    "size_bytes": len(video_bytes),
                })
            else:
                return send_file(
                    BytesIO(video_bytes),
                    mimetype="video/mp4",
                    as_attachment=True,
                    download_name="explainer_video.mp4",
                )

        except Exception as e:
            import traceback
            print(f"Error: {e}")
            print(traceback.format_exc())
            return jsonify({"error": str(e)}), 500

    return web_app
