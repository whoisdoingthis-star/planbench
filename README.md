# Planbench

A friendly CAD programme that runs in the web browser, on a laptop or a tablet.
It is for opening drawings, measuring them, and (in later stages) designing home
renovation layouts and concept sketches.

## Using it

Open <https://whoisdoingthis-star.github.io/planbench/> in a browser on a laptop
or tablet. Nothing needs installing. The site updates itself a few minutes after
every change to this repository.

## What it does today

- Opens **DXF** drawings (drag a file in, or press *Open a file*).
- Move around and zoom with a mouse, a finger, or a pencil.
- Switch **layers** on and off.
- Measure a **length**, an **area** or an **angle**. The pointer locks onto
  corners, middles, centres and crossings so measurements are exact.
- On a touch screen, a **magnifying glass** appears above your finger so you can
  see the point you are choosing. The point is placed when you lift your finger.
- Two ways of working, switchable at the top right:
  - **Simple**: large labelled buttons and plain-words hints.
  - **Pro**: a dark, compact CAD layout with a command bar (`DI`, `AA`, `ANG`,
    `Z`, `P`, `LA`, `OPEN`, `CLEAR`, `HELP`), snap toggles and a coordinate readout.

Everything is measured in millimetres and shown in mm, m and m².

## What is planned

| Stage | What it adds |
|---|---|
| 1 (in progress) | PDF and picture plans with a set-the-scale step, 3D files (STL, OBJ, STEP), DWG, notes on drawings, login and saving across devices |
| 2 | Tracing over a plan; smart walls, doors and windows; dimensions; 3D preview |
| 3 | Furniture and fixture library, room areas and material quantities, before/after options |
| 4 | Print-to-scale PDF, DXF export, quantities spreadsheet |
| 5 | Concept sketching for small objects |

## Running it on your own computer

You need [Node.js](https://nodejs.org) 20 or newer.

```
npm install
npm run dev      # start it, then open the address it prints
npm run check    # type-check, run the tests and build
npm run sample   # re-create the sample plan
```

## How the code is laid out

- `src/model` - the one internal drawing format (millimetres), geometry and number formatting
- `src/io` - file readers; each converts a file into the internal format
- `src/view` - the pan/zoom view and the canvas drawing code
- `src/tools` - snapping and measuring
- `src/ui` - the screen: Simple and Pro modes, pointer/touch handling
- `tests` - automatic tests

## Licence

GPL-3.0-or-later. The code is public, and DWG support (planned) relies on a
GPL-licensed library.
