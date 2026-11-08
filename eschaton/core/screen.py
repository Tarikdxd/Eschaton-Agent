import io
import base64
from typing import Tuple
from PIL import Image, ImageDraw
import mss


class ScreenCapturer:
    """
    Robust screen capture engine.
    Attempts hardware BitBlt via mss, and falls back to a dummy canvas if headless/session-locked.
    """

    def __init__(self, monitor_idx: int = 1):
        self.monitor_idx = monitor_idx
        try:
            self._sct = mss.mss()
        except Exception:
            self._sct = None

    def get_monitor_geometry(self) -> dict:
        if self._sct:
            monitors = self._sct.monitors
            if self.monitor_idx < len(monitors):
                return monitors[self.monitor_idx]
            return monitors[1] if len(monitors) > 1 else monitors[0]
        return {"left": 0, "top": 0, "width": 1920, "height": 1080}

    def capture(self, scale: float = 1.0) -> Tuple[Image.Image, Tuple[int, int]]:
        """Captures the screen and optionally scales it down. Returns (PIL.Image, (orig_width, orig_height))."""
        img = None
        orig_size = (1920, 1080)

        if self._sct:
            try:
                geom = self.get_monitor_geometry()
                sct_img = self._sct.grab(geom)
                img = Image.frombytes("RGB", sct_img.size, sct_img.bgra, "raw", "BGRX")
                orig_size = (img.width, img.height)
            except Exception:
                img = None

        if img is None:
            # Fallback for headless environments or locked desktop sessions
            img = Image.new("RGB", orig_size, color=(30, 30, 30))
            draw = ImageDraw.Draw(img)
            draw.text((100, 100), "Desktop Environment (Mock / Headless Session)", fill=(255, 255, 255))

        if scale != 1.0 and 0.1 <= scale < 1.0:
            new_width = int(img.width * scale)
            new_height = int(img.height * scale)
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

        return img, orig_size

    def capture_base64(self, scale: float = 1.0, format: str = "PNG") -> Tuple[str, Tuple[int, int]]:
        """Captures screen and returns base64 string for direct LLM multimodal payload."""
        img, orig_size = self.capture(scale=scale)
        buffered = io.BytesIO()
        img.save(buffered, format=format)
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        return img_str, orig_size

    def close(self):
        if self._sct:
            try:
                self._sct.close()
            except Exception:
                pass
