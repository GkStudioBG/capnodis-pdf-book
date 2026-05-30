# Higgsfield IMAGE Generation Prompts
# Capnodis PDF Book — Meta Ad Carousels (1080×1080)

Date: 2026-05-29
Platform: qualityais.com → Create → Image Generation
Output: 1080×1080px PNG/JPG (for carousel cards)
Color palette: dark green #263f2b, gold #cfb035, cream #fffaf1, clay #a66d42

---

## EXISTING ASSETS (use these first, crop to square)

Already available in `~/projects/capnodis-pdf-book/assets/`:

| File | Size | Use | Crop needed |
|------|------|-----|------------|
| `hero-almond-orchard.webp` | 1280×720 | Carousel 1 Card 1 | YES → center crop 1080×1080 |
| `root-damage-cutaway.webp` | 1280×720 | Carousel 1 Card 2 | YES → center crop 1080×1080 |
| `calendar-plan.webp` | 1280×853 | Carousel 1 Card 5, Carousel 3 Card 2 | YES → center crop |
| `book-mockup.webp` | 717×1115 | ALL carousels Card 4 | UPSCALE needed (too small) |
| `diagnosis-integrated-plan.webp` | 1280×720 | Carousel 2 Card 3, Carousel 3 Card 1, Card 3 | YES → center crop |
| `nematodes-biocontrol.webp` | 1280×853 | Carousel 2 Card 1 | YES → center crop |
| `trunk-barrier.webp` | 1280×960 | Carousel 3 Card 4 | YES → center crop |

**Recommendation:** Use existing webp assets for 10 of 15 cards. Generate only the missing/upscale images below.

---

## IMAGES TO GENERATE (5 needed)

### IMAGE 1 — "Root Damage Cross-Section" (upscaling alternative)
**Use for:** Carousel 1 Card 2 (root damage), Carousel 2 Card 4
**Size needed:** 1080×1080 (or larger for upscale)
**Style:** Technical agricultural illustration — underground cross-section of almond tree roots

**Prompt:**
```
Underground cross-section of an almond tree root system in dark soil. View from above showing the trunk base at center, main roots radiating outward, smaller root branches extending to edges. Some roots are healthy (light tan color, intact) and others show damage (dark brown/orange, with visible larval tunnels and bore holes). Glowing gold markers highlight the damaged zones near the crown. Tiny white eggs visible near the soil line at trunk base. Realistic agricultural illustration, not cartoon. Dark soil background (#1a1208), clean technical style, educational diagram aesthetic. Color palette: dark brown soil, tan healthy roots, orange-brown damaged roots, gold annotation markers. Sharp focus, professional, 1080×1080 square composition centered on root system.

NEGATIVE: cartoon, animation, blurry, low resolution, text, watermark, distorted roots.
```

---

### IMAGE 2 — "Lifecycle Diagram" (replaces missing SVG diagram)
**Use for:** Carousel 1 Card 3 (the cycle)
**Size needed:** 1080×1080

**Prompt:**
```
Agricultural infographic showing the annual lifecycle of Capnodis tenebrionis (gusano cabezudo) in four stages arranged in a square grid. Clockwise from top-left: (1) Adult beetles emerging from soil in spring with temperature indicator "20°C+". (2) Eggs laid near almond tree trunk base in summer, shown as tiny golden dots in soil. (3) Larvae tunneling through roots underground, cross-section view showing damaged root system. (4) Tree decline shown as yellowing/dead almond tree in summer. Arrows connect the stages in a cycle. Bottom text bar: "El ciclo se repite cada año." Clean flat vector style, dark green (#263f2b) background, gold (#cfb035) icons and text, white labels. Professional agricultural diagram, 1080×1080 square.

NEGATIVE: cartoon characters, photo, blurry, low quality, text spelling errors, cheerful colors (must be serious/moody).
```

---

### IMAGE 3 — "Book Mockup Cover" (generate higher resolution version)
**Use for:** All carousels — the product shot (Card 4 in each carousel)
**Size needed:** 1080×1080 or larger (current version is only 717px wide)

**Prompt:**
```
Professional digital product mockup: A PDF guide cover for Spanish farmers about Capnodis tenebrionis pest in almond orchards. Cover design shows: dark green (#263f2b) background with gold (#cfb035) border, title "GUÍA PRÁCTICA" at top in bold white, subtitle "Contra el Gusano Cabezudo en Almendro" in smaller gold text, illustration of almond tree roots with visible damage on left side, small almond nut icon bottom-right. Clean modern design, professional, trustworthy. NOT a real book — it's a digital PDF mockup. White text on dark green, gold accents. 1080×1080 square, flat lay or angled presentation, slight shadow for depth. No text spelling errors.

NEGATIVE: cartoon, blurry, low resolution, text errors, cheap looking, unprofessional, crooked.
```

---

### IMAGE 4 — "Calendar Grid Preview" (alternative to existing calendar-plan.webp)
**Use for:** Carousel 1 Card 5, Carousel 3 Card 2 (bonus showcase)
**Size needed:** 1080×1080

**Prompt:**
```
Agricultural planning calendar displayed on screen or paper. Grid layout showing 12 months (January to December) in a 4×3 grid. Each month cell has a small icon:January shows thermometer, March shows beetle, April-May show eye/inspection, June-July show water drop, August shows tree. Month labels in Spanish. Gold headers on dark green background rows. Clean professional design, flat lay from above. Color palette: dark green (#263f2b), gold (#cfb035), white text, cream paper background. "Calendario de manejo integrado" title at top. Sharp focus, 1080×1080 square, readable text, no blurry.

NEGATIVE: cartoon, blurry, low quality, wrong language, handwritten style, cluttered.
```

---

### IMAGE 5 — "Checklist de Diagnóstico" (bonus material preview)
**Use for:** Carousel 3 Card 3 (checklist as bonus)
**Size needed:** 1080×1080

**Prompt:**
```
Agricultural field diagnostic checklist document displayed on a tablet or paper. Shows a list with checkboxes (some checked in gold, some empty). Text items visible in Spanish: "Revisar tronco y cuello", "Observar adultos en brotes", "Confirmar galerías en raíces", "Evaluar nivel de daño". Clean professional medical/agricultural checklist aesthetic. White background with dark green header bar, gold checkmarks. Top: "CHECKLIST DE DIAGNÓSTICO" in bold. Bottom right: small almond tree icon. Flat lay, sharp focus, 1080×1080 square, readable text, professional quality.

NEGATIVE: cartoon, blurry, low quality, handwritten, messy, text errors.
```

---

## BONUS IMAGES (optional — for A/B testing)

### IMAGE 6 — "Dry Almond Tree Close-Up" (alternative hero image)
**Use for:** Carousel 1 Card 1 alternative, Video 1 thumbnail
**Size needed:** 1080×1080

**Prompt:**
```
Single distressed almond tree in a Spanish orchard. Mid-shot framing, tree slightly off-center to show cracked dry soil around the base. Tree has yellowing leaves from bottom up, some dead branches, but green leaves still at top — showing stress but not completely dead. Sun-scorched golden hour light, dust in air. Dry cracked earth around trunk. Realistic photography style, not illustration. Warm Mediterranean palette: golden yellow soil, dark green shadows, cream highlights. Moody, tense, honest. Shot on 50mm lens, shallow depth of field, background slightly blurred. 1080×1080 square composition.

NEGATIVE: cartoon, illustration, AI-looking, oversaturated, snowy/winter, fully dead tree, blurry, low quality.
```

---

### IMAGE 7 — "Comparison: Tree with vs without barrier"
**Use for:** Carousel 3 Card 4 alternative, Prevention angle
**Size needed:** 1080×1080

**Prompt:**
```
Split comparison image of two young almond trees side by side. Left side: tree WITHOUT physical barrier — visible root damage, yellowing leaves, stressed appearance. Right side: tree WITH barrier (dark polyethylene sheet wrapped around trunk base) — healthy green leaves, vigorous growth. Vertical divider line in dark green. Below each tree: small label "Sin barrera" and "Con barrera". Underground cross-section overlay on left tree showing larval damage in roots. Clean agricultural comparison, flat vector illustration style, serious tone. Dark green (#263f2b) background, gold (#cfb035) labels, white text. Professional, 1080×1080 square.

NEGATIVE: cartoon, photo, blurry, low quality, cheerful colors, text spelling errors.
```

---

### IMAGE 8 — "Nematodes Application Diagram"
**Use for:** Carousel 2 Card 2 (conditions for nematodes)
**Size needed:** 1080×1080

**Prompt:**
```
Agricultural technical diagram showing conditions for applying entomopathogenic nematodes against Capnodis larvae. Three condition meters/gauge icons arranged horizontally: (1) Soil moisture meter showing ">40%" with wet soil illustration, (2) Temperature gauge showing "15-30°C" with thermometer icon, (3) Application timing icon showing larvae visible. Each icon in a rounded square with gold border. Dark green (#263f2b) background, white labels, gold (#cfb035) icons and meters. Clean technical infographic style, educational, professional. Title at top: "Condiciones para nematodos" in white. 1080×1080 square, sharp text, no blurry.

NEGATIVE: cartoon, blurry, low quality, text errors, wrong units, cheerful/playful style.
```

---

## IMAGE GENERATION GUIDE

### Steps (qualityais.com)
1. Go to qualityais.com → Create → Image Generation
2. Paste the prompt (everything in ``` ```)
3. Select: 1024×1024 or 1080×1080 output
4. Generate → download as PNG
5. Crop/resize to exact 1080×1080 if needed

### Cropping existing assets to 1080×1080 (use CapCut or PIL)

For existing webp images that are 1280×720 or 1280×853:
- Open in CapCut → Smart Resize → 1080×1080 (center crop)
- Or use: `python3 -c "from PIL import Image; img = Image.open('file.webp'); img.resize((1080,1080)).save('output.jpg')"`

### Upscaling book-mockup.webp (717×1115 → 1080×1080)
- Use CapCut's "Enhance" tool or qualityais.com upscaler
- Or regenerate using Image 3 prompt above

---

## IMAGE SUMMARY TABLE

| Image | Prompt name | Use for | Priority |
|-------|-------------|---------|----------|
| 1 | Root Damage Cross-Section | Carousel 1 Card 2 | HIGH |
| 2 | Lifecycle Diagram | Carousel 1 Card 3 | HIGH |
| 3 | Book Mockup Cover | ALL Carousels Card 4 | HIGH |
| 4 | Calendar Grid | Carousel 1 Card 5, C3 Card 2 | MEDIUM |
| 5 | Diagnostic Checklist | Carousel 3 Card 3 | MEDIUM |
| 6 | Dry Almond Tree | Hero alternative | LOW (use existing) |
| 7 | Barrier Comparison | Prevention angle | LOW |
| 8 | Nematodes Conditions | Carousel 2 Card 2 | MEDIUM |

---

## FILE
Location: `/home/kalinyordanov/agency-os/projects/capnodis-pdf-market-validation/ads/higgsfield-image-prompts-v1.md`