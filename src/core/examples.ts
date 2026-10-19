// Example patterns shipped with the app (original patterns written for it).

export interface ExamplePattern {
  id: string;
  name: string;
  hookMm: number;
  yarn: string;
  tags: string[];
  text: string;
  checklist: string[];
}

export const EXAMPLES: ExamplePattern[] = [
  {
    id: 'souris',
    name: 'Souris',
    hookMm: 2.5,
    yarn: 'Coton gris et rose',
    tags: ['amigurumi', 'animal'],
    checklist: ['Placer les yeux de sécurité', 'Rembourrer le corps', 'Coudre les oreilles', 'Coudre la queue', 'Broder les moustaches'],
    text: `Souris
Crochet 2,5 mm, coton. Yeux de sécurité 6 mm, rembourrage.
Taille finie : environ 8 cm.

Couleur A : gris
Couleur B : rose

CORPS (en gris)
R1 : 6 ms dans un cercle magique (6)
R2 : 6 aug (12)
R3 : (1 ms, 1 aug) x 6 (18)
R4 : (2 ms, 1 aug) x 6 (24)
R5 : (3 ms, 1 aug) x 6 (30)
R6 : (4 ms, 1 aug) x 6 (36)
R7-R11 : 1 ms dans chaque m (36)
R12 : (4 ms, 1 dim) x 6 (30)
R13-R14 : 1 ms dans chaque m (30)
Placer les yeux entre les rangs 9 et 10, à 7 mailles d'écart.
R15 : (3 ms, 1 dim) x 6 (24)
R16 : (2 ms, 1 dim) x 6 (18)
Rembourrer.
R17 : (1 ms, 1 dim) x 6 (12)
R18 : 6 dim (6)
Arrêter et fermer.

OREILLES (x2)
Avec la couleur B.
R1 : 6 ms dans un cercle magique (6)
R2 : 6 aug (12)
R3 : (1 ms, 1 aug) x 6 (18)
R4 : (2 ms, 1 aug) x 6 (24)
R5 : 1 ms dans chaque m (24)
Arrêter en laissant un long fil. Ne pas rembourrer.

MUSEAU (en rose)
R1 : 5 ms dans un cercle magique (5)
R2 : 5 aug (10)

QUEUE (en rose)
R1 : 4 ms dans un cercle magique (4)
R2-R12 : 1 ms dans chaque m (4)

Assemblage
Coudre les oreilles entre les rangs 4 et 6, de chaque côté de la tête.
Coudre le museau au rang 12, entre les yeux. Coudre la queue à l'arrière.`,
  },
  {
    id: 'coeur',
    name: 'Heart cushion',
    hookMm: 5,
    yarn: 'Chenille, red',
    tags: ['cushion', 'home'],
    checklist: ['Stuff the lobes', 'Join the lobes', 'Stuff the body', 'Close the point'],
    text: `Heart cushion
Hook: 5 mm. Yarn: chenille, colour A: red.
Finished size: about 24 cm wide.

LOBES (make 2) — with A
Rnd 1: 6 sc in MR (6)
Rnd 2: inc in each st around (12)
Rnd 3: *sc, inc* x6 (18)
Rnd 4: *sc 2, inc* x6 (24)
Rnd 5: *sc 3, inc* x6 (30)
Rnd 6: *sc 4, inc* x6 (36)
Rnds 7-10: sc around (36)
Fasten off the first lobe. Do not fasten off the second one.

BODY
Rnd 1: sc in each st around both lobes = 72 sc
Rnd 2: sc around (72)
Rnd 3: *sc 10, dec* x6 (66)
Rnd 4: sc around (66)
Rnd 5: *sc 9, dec* x6 (60)
Rnd 6: *sc 8, dec* x6 (54)
Rnd 7: *sc 7, dec* x6 (48)
Rnd 8: *sc 6, dec* x6 (42)
Stuff firmly and keep stuffing as you go.
Rnd 9: *sc 5, dec* x6 (36)
Rnd 10: *sc 4, dec* x6 (30)
Rnd 11: *sc 3, dec* x6 (24)
Rnd 12: *sc 2, dec* x6 (18)
Rnd 13: *sc, dec* x6 (12)
Rnd 14: dec around (6)
Fasten off and close the point.`,
  },
  {
    id: 'abeille',
    name: 'Striped bee',
    hookMm: 3,
    yarn: 'Cotton, yellow, black and white',
    tags: ['amigurumi', 'animal'],
    checklist: ['Insert the safety eyes', 'Stuff the body', 'Sew the wings', 'Sew the antennae', 'Embroider the smile'],
    text: `Striped bee
Hook: 3 mm. Cotton yarn. 8 mm safety eyes.
Colour A: yellow
Colour B: black
Colour C: white
Size: about 9 cm tall.

BODY
Start with A.
Rnd 1: 6 sc in MR (6)
Rnd 2: inc around (12)
Rnd 3: (sc, inc) x6 (18)
Rnd 4: (sc 2, inc) x6 (24)
Rnd 5: (sc 3, inc) x6 (30)
Rnd 6: (sc 4, inc) x6 (36)
Rnd 7-11: sc around (36)
Insert the eyes between rounds 8 and 9, 7 sts apart.
Change to B.
Rnd 12-13: sc around (36)
Change to A.
Rnd 14-15: sc around (36)
Change to B.
Rnd 16-17: sc around (36)
Change to A.
Rnd 18: (sc 4, dec) x6 (30)
Rnd 19: (sc 3, dec) x6 (24)
Change to B.
Rnd 20: (sc 2, dec) x6 (18)
Stuff.
Rnd 21: (sc, dec) x6 (12)
Rnd 22: dec around (6)
Fasten off.

WINGS (make 2)
With C.
Rnd 1: 6 sc in MR (6)
Rnd 2: inc around (12)
Rnd 3: (sc, inc) x6 (18)
Rnd 4-6: sc around (18)
Rnd 7: (sc, dec) x6 (12)
Flatten, do not stuff.

ANTENNAE (make 2)
With B.
Rnd 1: 5 sc in MR (5)
Rnd 2: sc around (5)
Rnd 3: sc 3, dec (4)
Rnds 4-8: sc around (4)

Assembly
Sew the wings on the back at round 10. Sew the antennae between rounds 3 and 4.`,
  },
];
