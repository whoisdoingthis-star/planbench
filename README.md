# Planbench

A renovation planner that runs in the web browser, on a phone, tablet or laptop.
It was started for a kitchen renovation: work out what everything costs, compare
choices, keep photos together, and measure from plans.

## Using it

Open <https://whoisdoingthis-star.github.io/planbench/> in a browser on a laptop
or tablet. Nothing needs installing. The site updates itself a few minutes after
every change to this repository.

## What it does today

**Costs**
- A kitchen list to start from (cabinetry, handles, benchtops, tiles, appliances,
  plumber, electrician...). Add, rename or delete anything.
- Each item has a quantity and any number of **options** you are choosing between,
  each with a price, fitting cost, one-off extras, shop, web link, notes and a photo.
- Pick one option per item and the **total updates straight away**, with an
  allowance for surprises and the GST shown. Each option says how much more or
  less it costs than your current choice.
- **Where the money stands**: for each shop or tradesperson, record whether you
  have gone ahead and what you have paid; see what is paid, still owed, and not
  yet committed.
- Save your choices as a **version** ("Budget", "Dream") and compare versions side by side.
- An option can carry its **real size and colour**. The Layout screen draws the
  chosen fridge at that size and says whether it fits its space, so swapping an
  appliance shows its effect on both cost and fit.
- Download the budget as a spreadsheet.
- **Save a project file** (the whole project with its photos in one file) as a
  backup, and **open a project file** to load one.

**Private links**
- A project can be placed on the site in locked (encrypted) form and opened with
  a private link. The key is the part of the link after the `#`, which is never
  sent to the server, so only people who have the link can read the project.
  `npm run seal -- "path/to/file.planbench.json"` creates the locked copy and prints the link ending.

**Layout**
- A **3D view** of the whole kitchen that you can turn and zoom, built from the
  wall lists. It uses the chosen door colour, handles and benchtop from the Costs
  screen, and photos of your tiles on the splashback and floor.
- **Realistic lighting** switch for the 3D view (ceiling, daylight through the
  windows, downlights, shadows) and a button to save the view as a picture.
- **The room from above**: floor areas, walls with windows and doors, the kitchen
  runs, and furniture you can drag about, turn and resize. The 3D view shows the
  same room, with buttons to look at the whole room or just the kitchen.
- Draw a wall to scale: list the units along the floor and on the wall.
- Compare height options side by side, such as splashback height and wall
  cabinet height. Each option shows whether tiles need cutting, how much space
  is left under the ceiling, and whether the cabinet tops line up with the pantry.

**Sharing**
- Without signing in, everything is saved in the browser on that one device.
- Sign in with an emailed link to share the project between devices and people.
  Add another person by their email address under *Sharing*; only invited
  addresses can sign in.
- Changes appear on the other devices within a moment. If two people change
  different things at the same time, both changes are kept. Changes made with
  no connection are sent when the connection returns.

**Photos**
- Keep photos of the kitchen as it is now, and of ideas you like.
- Open any photo in Plans to set its scale and measure on it.

**Plans**

- Opens **DXF** drawings, **PDF** plans (including several pages) and **pictures**
  of plans such as scans or photos (drag a file in, or press *Open a file*).
- **Set the scale** of a PDF or picture: mark a line whose real length you know
  and type that length, or for a PDF pick the scale printed on it (1:50, 1:100...).
  After that, measurements are in real sizes.
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

1. Using measurements from a plan as quantities (tile area, bench length).
2. Seeing the future look: trying finishes on a photo or simple 3D view.
3. More plan tools: walls, cabinets, 3D files, DWG, printing to scale.


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
- `src/ui` - the Plans screen: Simple and Pro modes, pointer/touch handling
- `src/budget` - the Costs, Layout and Photos screens, the budget sums, and saving
- `sql/schema.sql` - the shared database: tables and the rules for who may see what
- `tests` - automatic tests

## Licence

GPL-3.0-or-later. The code is public, and DWG support (planned) relies on a
GPL-licensed library.
