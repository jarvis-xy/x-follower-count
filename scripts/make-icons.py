"""Render the extension icons (blue rounded square, white person + rising bars).

icon128 follows the Chrome Web Store spec (96px artwork centred in 128px).

Usage: python3 scripts/make-icons.py   (needs Pillow)
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "extension" / "icons"
S = 1024  # draw large, downsample for anti-aliasing
BLUE = (29, 155, 240, 255)
WHITE = (255, 255, 255, 255)


def draw_master() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.22), fill=BLUE)

    # person: head + shoulders, left of centre
    cx = int(S * 0.40)
    head_r = int(S * 0.13)
    head_cy = int(S * 0.36)
    d.ellipse((cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r), fill=WHITE)
    body_w = int(S * 0.24)
    body_top = int(S * 0.54)
    d.pieslice((cx - body_w, body_top, cx + body_w, body_top + int(S * 0.44)), 180, 360, fill=WHITE)

    # three rising bars on the right
    bar_w = int(S * 0.065)
    gap = int(S * 0.035)
    base = int(S * 0.76)
    x = int(S * 0.66)
    for h in (0.16, 0.26, 0.38):
        d.rounded_rectangle((x, base - int(S * h), x + bar_w, base), radius=bar_w // 2, fill=WHITE)
        x += bar_w + gap
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    master = draw_master()
    for size in (16, 32, 48):
        master.resize((size, size), Image.LANCZOS).save(OUT / f"icon{size}.png")
    # Chrome Web Store spec: 128x128 canvas, 96x96 artwork, 16px transparent padding.
    canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    canvas.paste(master.resize((96, 96), Image.LANCZOS), (16, 16))
    canvas.save(OUT / "icon128.png")
    print("wrote icon16/32/48.png (full bleed) and icon128.png (96px art + 16px padding) to", OUT)


if __name__ == "__main__":
    main()
