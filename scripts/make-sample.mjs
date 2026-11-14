// Writes a small made-up flat plan as a DXF file, used by the "Try a sample" button and the tests.
import { writeFileSync } from 'node:fs';

const out = [];
const g = (code, value) => out.push(String(code), String(value));

const line = (layer, x1, y1, x2, y2) => {
  g(0, 'LINE'); g(8, layer); g(10, x1); g(20, y1); g(30, 0); g(11, x2); g(21, y2); g(31, 0);
};
const poly = (layer, pts, closed = true) => {
  g(0, 'POLYLINE'); g(8, layer); g(66, 1); g(70, closed ? 1 : 0); g(10, 0); g(20, 0); g(30, 0);
  for (const [x, y, bulge] of pts) {
    g(0, 'VERTEX'); g(8, layer); g(10, x); g(20, y); g(30, 0);
    if (bulge) g(42, bulge);
  }
  g(0, 'SEQEND'); g(8, layer);
};
const rect = (layer, x, y, w, h) => poly(layer, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
const arc = (layer, cx, cy, r, a0, a1) => {
  g(0, 'ARC'); g(8, layer); g(10, cx); g(20, cy); g(30, 0); g(40, r); g(50, a0); g(51, a1);
};
const circle = (layer, cx, cy, r) => {
  g(0, 'CIRCLE'); g(8, layer); g(10, cx); g(20, cy); g(30, 0); g(40, r);
};
const text = (layer, x, y, h, s) => {
  g(0, 'TEXT'); g(8, layer); g(10, x); g(20, y); g(30, 0); g(40, h); g(1, s);
};
const insert = (layer, name, x, y, rot = 0) => {
  g(0, 'INSERT'); g(8, layer); g(2, name); g(10, x); g(20, y); g(30, 0); g(50, rot);
};

g(0, 'SECTION'); g(2, 'HEADER');
g(9, '$ACADVER'); g(1, 'AC1009');
g(9, '$INSUNITS'); g(70, 4);
g(0, 'ENDSEC');

const layers = [['0', 7], ['WALLS', 7], ['DOORS', 1], ['WINDOWS', 5], ['FURNITURE', 3], ['TEXT', 2], ['DIMENSIONS', 6]];
g(0, 'SECTION'); g(2, 'TABLES');
g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length);
for (const [name, color] of layers) {
  g(0, 'LAYER'); g(2, name); g(70, 0); g(62, color); g(6, 'CONTINUOUS');
}
g(0, 'ENDTAB'); g(0, 'ENDSEC');

g(0, 'SECTION'); g(2, 'BLOCKS');
g(0, 'BLOCK'); g(8, '0'); g(2, 'BED'); g(70, 0); g(10, 0); g(20, 0); g(30, 0); g(3, 'BED');
rect('0', 0, 0, 1500, 2000);
rect('0', 100, 1500, 600, 400);
rect('0', 800, 1500, 600, 400);
g(0, 'ENDBLK'); g(8, '0');
g(0, 'BLOCK'); g(8, '0'); g(2, 'SOFA'); g(70, 0); g(10, 0); g(20, 0); g(30, 0); g(3, 'SOFA');
rect('0', 0, 0, 2200, 900);
rect('0', 0, 700, 2200, 200);
g(0, 'ENDBLK'); g(8, '0');
g(0, 'ENDSEC');

g(0, 'SECTION'); g(2, 'ENTITIES');
// Outside walls, 9.0 m x 7.0 m, 200 mm thick
rect('WALLS', 0, 0, 9000, 7000);
rect('WALLS', 200, 200, 8600, 6600);
// Inside wall between living room and bedroom, with a door gap
line('WALLS', 5000, 200, 5000, 3000);
line('WALLS', 5100, 200, 5100, 3000);
line('WALLS', 5000, 3000, 5100, 3000);
line('WALLS', 5000, 3900, 5000, 6800);
line('WALLS', 5100, 3900, 5100, 6800);
line('WALLS', 5000, 3900, 5100, 3900);
// Door swing
line('DOORS', 5100, 3900, 6000, 3900);
arc('DOORS', 5100, 3900, 900, 270, 360);
// Windows
line('WINDOWS', 1500, 100, 3500, 100);
line('WINDOWS', 6200, 6900, 8000, 6900);
// Furniture
insert('FURNITURE', 'BED', 7100, 4600);
insert('FURNITURE', 'SOFA', 1300, 3200, 90);
circle('FURNITURE', 2600, 4300, 450);
// A rounded rug, to show curved corners
poly('FURNITURE', [[1500, 1000, 0], [3700, 1000, 0.4142], [4000, 1300, 0], [4000, 2300, 0.4142], [3700, 2600, 0], [1500, 2600, 0.4142], [1200, 2300, 0], [1200, 1300, 0.4142]]);
// Labels
text('TEXT', 1900, 5600, 250, 'LIVING ROOM');
text('TEXT', 6300, 2000, 250, 'BEDROOM');
// A simple overall dimension along the bottom
line('DIMENSIONS', 0, -600, 9000, -600);
line('DIMENSIONS', 0, -700, 0, -100);
line('DIMENSIONS', 9000, -700, 9000, -100);
text('DIMENSIONS', 4150, -520, 200, '9000');
g(0, 'ENDSEC');
g(0, 'EOF');

writeFileSync(new URL('../public/samples/flat.dxf', import.meta.url), out.join('\n') + '\n');
console.log('Wrote public/samples/flat.dxf');
