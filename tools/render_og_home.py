#!/usr/bin/env python3
"""生成根路径分享图 assets/og-home.png（1200×630）。用现有图标，不使用 favicon 本身当 og:image。"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "og-home.png")
W, H = 1200, 630

def font(path, size):
    return ImageFont.truetype(path, size)

def main():
    bg = Image.new("RGBA", (W, H), (13, 13, 16, 255))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse((780, -220, 1460, 460), fill=(255, 106, 31, 42))
    g.ellipse((-260, 380, 460, 980), fill=(255, 106, 31, 26))
    bg.alpha_composite(glow.filter(ImageFilter.GaussianBlur(48)))
    mark = Image.open(os.path.join(ROOT, "icons", "favicon-512.png")).convert("RGBA")
    mark = mark.resize((196, 196), Image.Resampling.LANCZOS)
    bg.alpha_composite(mark, (84, (H - 196) // 2))

    draw = ImageDraw.Draw(bg)
    inter_b = font("/usr/share/fonts/truetype/macos/Inter-Bold.ttf", 72)
    inter_m = font("/usr/share/fonts/truetype/macos/Inter-Medium.ttf", 28)
    inter_r = font("/usr/share/fonts/truetype/macos/Inter-Regular.ttf", 22)
    cjk = font("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", 58)
    cjk_s = font("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", 30)
    cjk_xs = font("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", 24)

    x = 328
    draw.text((x, 132), "www.wakeloom.com", font=inter_r, fill=(107, 107, 115, 255))
    draw.text((x, 176), "Wakeloom", font=inter_b, fill=(237, 237, 240, 255))
    name_w = inter_b.getlength("Wakeloom")
    draw.text((x + name_w + 20, 186), "织迹", font=cjk, fill=(255, 106, 31, 255))
    draw.text((x, 286), "用于 Polymarket 的钱包分析与模拟盘", font=cjk_s, fill=(226, 226, 232, 255))
    draw.text((x, 338), "Wallet analytics and paper copy trading", font=inter_m, fill=(154, 154, 163, 255))
    draw.rounded_rectangle((x, 408, x + 72, 412), radius=2, fill=(255, 106, 31, 220))
    draw.text((x, 436), "公测前预览，尚未正式上线", font=cjk_xs, fill=(255, 106, 31, 255))
    draw.text((x, 478), "Preview only  ·  not yet launched", font=inter_r, fill=(154, 154, 163, 255))

    flat = Image.new("RGB", (W, H), (13, 13, 16))
    flat.paste(bg, mask=bg.split()[-1])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    flat.save(OUT, "PNG", optimize=True)
    print(OUT, flat.size)

if __name__ == "__main__":
    main()
