/**
 * Photography for the demo, served from the Pexels CDN under its free licence.
 * Every URL here was checked and returns a live image.
 * In production these become designer uploads behind signed Supabase/S3 URLs.
 */
const px = (id: number, w = 1200) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;

export const gardens = {
  villandry: px(38694055, 1600),
  pergola: px(33821319),
  pathways: px(8414362),
  topiary: px(29821815),
  greenhouse: px(17880216),
  rockGravel: px(12676601),
  hydrangea: px(33249106),
  tulips: px(16327475),
  vertical: px(5781635),
  grasses: px(34032121),
  backyard: px(32907363),
  urbanBrick: px(33443310),
  deckDining: px(7587879),
  firePit: px(13871296),
  minimalPatio: px(15800366),
  contemporary: px(7061672),
  stoneWall: px(11802394),
  tidyBorder: px(37639780),
  hothouse: px(5230888),
} as const;

export const studio = {
  compass: px(9618454),
  sketchHands: px(9617407),
  drawings: px(5582599),
  deskPlan: px(923306),
  blueprintRuler: px(6614837),
  planning: px(9052535),
  workspace: px(6615279),
} as const;

export const faces = {
  a: px(29852852, 500),
  b: px(37148308, 500),
  c: px(30198184, 500),
  d: px(12311572, 500),
  e: px(38197025, 500),
  f: px(29995581, 500),
  g: px(37605831, 500),
  h: px(32844866, 500),
} as const;
