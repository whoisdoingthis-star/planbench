# Changelog

## Unreleased

- Layout: a shade control to make the wall tiles in the 3D view lighter, warmer or cooler.
- The styling is now built into the page, so the app can no longer appear unstyled if it is opened while the site is updating. If the app fails to start, the page reloads itself once and then offers a reload button.
- Costs: each option can be given a colour, which the 3D view uses for doors, handles and benchtop.
- The app shows its version (build date and time) at the bottom of each screen.
- Layout: the benchtop pattern repeats without visible joins.
- Layout: the 3D benchtop can show a photo of the real surface.
- Layout: a 3D view of the kitchen (all walls, window, appliances, tiles from photos), following the current choices.
- Layout: walls can be placed in the room, have a window, and include a sink cupboard.
- Private links: open a project stored on the site in encrypted form, using a key carried in the link.
- Layout: the tile check now allows a few millimetres for grout lines, so a gap of 602 mm counts as four 150 mm rows.
- New **Layout** screen: a wall drawn to scale, with height options compared side by side (tile cuts, gap to ceiling, alignment with the pantry).
- Save the whole project, photos included, to one file, and open such a file to load a project.
- **Sharing**: sign in with an emailed link, invite another person by email, and the project (costs, choices, versions and photos) stays in step between devices. Simultaneous changes are merged; offline changes are sent later.
- Database set up in `sql/schema.sql` with access limited to invited email addresses.
- New **Costs** screen: kitchen item list, several priced options per item, live totals with allowance and GST, saved versions and side-by-side comparison, spreadsheet download.
- New **Photos** screen: current kitchen and ideas, with captions; any photo can be opened in Plans to measure.
- The drawing tools now live under a **Plans** tab.
- Open PDF plans (with page-by-page buttons) and pictures of plans (PNG, JPG, WebP).
- New *Set the scale* tool: mark a known length and type its real size, or pick a printed scale such as 1:100 for PDFs. It also corrects DXF drawings that open at the wrong size.
- The app is published automatically to GitHub Pages whenever `main` changes.
- First version: open DXF drawings, pan and zoom with mouse, touch or pencil.
- Layers panel to show and hide layers.
- Measure length, area and angle, with snapping to corners, middles, centres and crossings.
- Magnifying glass for choosing points by touch.
- Simple and Pro modes, with a command bar and snap toggles in Pro.
- A sample flat plan to try.
