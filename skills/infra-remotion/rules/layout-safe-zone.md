# Layout & Safe Zone Guidelines

## Canvas & Safe Zone

Standard video canvas is 1920x1080. When adding subtitles (typically at `bottom: 60px`, ~120px height), content must stay within a safe zone:

```typescript
export const CANVAS_W = 1920;
export const CANVAS_H = 1080;
export const SAFE_BOTTOM = 200; // subtitle overlay clearance
export const CONTENT_BOTTOM = CANVAS_H - SAFE_BOTTOM; // 880px
```

**Rule: All content elements must have their bottom edge ≤ 880px (or your defined safe zone).**

## Layout Verification Checklist

When designing or modifying scene layouts, calculate the vertical extent of every element:

1. **Title block**: `top + fontSize + marginTop + subtitleFontSize` = bottom edge
2. **Content blocks**: `top + padding + content heights + padding` = bottom edge
3. **Bottom insights/quotes**: `top + padding + lineHeight × lines + padding` = bottom edge

### Common formula for bottom insight boxes:

```
bottom = top + paddingTop + (fontSize × lineHeight × numLines) + paddingBottom
```

For Chinese text at fontSize=28, lineHeight=1.7:
- Each line height ≈ 48px
- Characters per line ≈ canvasWidth / fontSize (e.g., 1400px / 28px ≈ 50 chars)
- Count total characters → estimate line count → calculate total height

**Always verify**: `bottom ≤ CONTENT_BOTTOM (880px)`

## Font Size Guidelines

Minimum readable font sizes for 1920x1080 video:

| Element | Minimum | Recommended |
|---------|---------|-------------|
| Main title | 56px | 64-72px |
| Subtitle | 28px | 32-36px |
| Section headers | 32px | 36-44px |
| Body text | 24px | 28-32px |
| Labels | 20px | 22-26px |
| Small/muted text | 16px | 18-22px |
| Metric numbers | 64px | 72-84px |

**Centralize font sizes in a theme file** to enable global adjustments:

```typescript
export const F = {
  title: 72,
  subtitle: 34,
  sectionTitle: 40,
  body: 28,
  label: 24,
  small: 20,
};
```

## Spacing Between Elements

- Title → content: minimum 24px gap
- Content sections: minimum 20px gap
- Content → bottom insight: minimum 40px gap
- Adjacent cards/bars: minimum 16px gap

## Horizontal Layout

- Content should not extend beyond `x + width > 1880px` (40px right margin)
- Left margin: minimum 60px
- For split layouts (before/after), ensure separator has ≥ 60px clearance on each side

## Common Pitfalls

1. **Bottom overflow**: Multi-line text boxes at bottom of canvas easily exceed safe zone. Always calculate total height including padding.
2. **Font enlargement cascade**: Increasing font sizes globally requires rechecking ALL vertical positions — larger text takes more space and pushes content down.
3. **Animation displacement**: `slideUp` and `translateY` add temporary displacement during entrance. Verify layout at the **final frame** (all animations complete), not mid-animation.
4. **Flexbox column overflow**: `flex-direction: column` with many items can exceed container bounds. Calculate total height of all items + gaps.
