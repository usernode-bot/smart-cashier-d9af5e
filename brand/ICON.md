# Smart Cashier brand icons

One flat mark everywhere: a receipt with the app's scalloped top edge rising
out of a three-key register, with one four-point sparkle. No text, no
gradients, no filters, no strokes — flat fills only.

## Files

| File | Size | Look |
| --- | --- | --- |
| `icon.svg` → `icon.png` | 512×512 | black ground, cream mark, yellow sparkle (the app icon, referenced by `dapp.json`) |
| `featured-light.svg` → `featured-light.png` | 1600×900 | cream ground, black mark, black sparkle |
| `featured-dark.svg` → `featured-dark.png` | 1600×900 | black ground, cream mark, yellow sparkle |

The featured files reuse the icon's mark group with
`transform="translate(449 123) scale(1.25)"`.

## Colours

Only the Homeroom brand palette: Cream `#FFFEEA`, Yellow `#FFEE6F`, Black
`#000000` here (Cream + Black and Black + Yellow pairings). No other colour
may be added. On the cream light version the sparkle is black, because yellow
on cream would not show.

## Re-rendering

    rsvg-convert -w 512 -h 512 brand/icon.svg -o brand/icon.png
    rsvg-convert -w 1600 -h 900 brand/featured-light.svg -o brand/featured-light.png
    rsvg-convert -w 1600 -h 900 brand/featured-dark.svg -o brand/featured-dark.png

Any faithful SVG rasterizer works (`@resvg/resvg-js` was used originally).
`test/brand.test.js` guards the file sizes, dimensions and palette.
