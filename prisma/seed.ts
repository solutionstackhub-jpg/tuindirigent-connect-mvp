/**
 * Demo data.
 *
 * The designers deliberately sit in five different Connect states, because the
 * interesting part of this build is what the product does when a designer is
 * *not* ready to be paid.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { faces, gardens, studio } from '../src/lib/images';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const SERIES = 'TD-2026';

async function main() {
  await prisma.$transaction([
    prisma.ledgerEntry.deleteMany(),
    prisma.document.deleteMany(),
    prisma.purchase.deleteMany(),
    prisma.listing.deleteMany(),
    prisma.designer.deleteMany(),
    prisma.webhookEvent.deleteMany(),
    prisma.documentCounter.deleteMany(),
    prisma.config.deleteMany(),
  ]);

  await prisma.config.create({ data: { id: 1, invoiceSeries: SERIES } });
  await prisma.documentCounter.create({ data: { series: SERIES, lastNumber: 0 } });

  const designers = await Promise.all([
    // Ready to sell: onboarded, VAT on file, self-billing accepted.
    prisma.designer.create({
      data: {
        name: 'Sanne de Vries',
        studioName: 'Studio Groenlicht',
        email: 'sanne@groenlicht.nl',
        slug: 'studio-groenlicht',
        avatarUrl: faces.a,
        headerUrl: gardens.villandry,
        city: 'Utrecht',
        address: 'Oudegracht 182, 3511 NN Utrecht',
        bio: 'Ontwerpt stadstuinen die het hele jaar iets te doen hebben. Werkt het liefst met vaste planten en siergrassen, en tekent alles met de hand voordat het de computer in gaat.',
        stripeAccountId: 'acct_demo_groenlicht',
        connectStatus: 'READY',
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        vatNumber: 'NL123456782B01',
        vatNumberValid: true,
        selfBillingAcceptedAt: new Date('2026-08-14T09:12:00Z'),
        selfBillingVersion: 'v1.2',
      },
    }),
    prisma.designer.create({
      data: {
        name: 'Bram Hoekstra',
        studioName: 'Hoekstra Tuinontwerp',
        email: 'bram@hoekstratuin.nl',
        slug: 'hoekstra-tuinontwerp',
        avatarUrl: faces.b,
        headerUrl: gardens.firePit,
        city: 'Haarlem',
        address: 'Gedempte Oude Gracht 27, 2011 GM Haarlem',
        bio: 'Achtertuinen met een duidelijke verblijfsplek. Veel hout, baksteen en een vuurplaats waar je in oktober nog buiten zit.',
        stripeAccountId: 'acct_demo_hoekstra',
        connectStatus: 'READY',
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        vatNumber: 'NL810123459B01',
        vatNumberValid: true,
        selfBillingAcceptedAt: new Date('2026-09-02T14:40:00Z'),
        selfBillingVersion: 'v1.2',
        holdDaysOverride: 14,
      },
    }),
    // Everything done, Stripe still reviewing. Cannot sell yet.
    prisma.designer.create({
      data: {
        name: 'Fenna Bakker',
        studioName: 'Bakker & Blad',
        email: 'fenna@bakkerenblad.nl',
        slug: 'bakker-en-blad',
        avatarUrl: faces.c,
        headerUrl: gardens.hydrangea,
        city: 'Rotterdam',
        address: 'Witte de Withstraat 44, 3012 BR Rotterdam',
        bio: 'Borders met lange bloei en weinig onderhoud. Specialiseert in daktuinen en binnenterreinen.',
        stripeAccountId: 'acct_demo_bakker',
        connectStatus: 'UNDER_REVIEW',
        chargesEnabled: true,
        payoutsEnabled: false,
        detailsSubmitted: true,
        vatNumber: 'NL820456780B01',
        vatNumberValid: true,
        selfBillingAcceptedAt: new Date('2026-09-20T08:05:00Z'),
        selfBillingVersion: 'v1.2',
      },
    }),
    // Onboarding half done and no BTW number: two blockers, both shown.
    prisma.designer.create({
      data: {
        name: 'Joost Meijer',
        studioName: 'Meijer Buitenruimte',
        email: 'joost@meijerbuiten.nl',
        slug: 'meijer-buitenruimte',
        avatarUrl: faces.d,
        headerUrl: gardens.minimalPatio,
        city: 'Eindhoven',
        bio: 'Strakke buitenruimtes voor nieuwbouw. Werkt veel met beton, cortenstaal en een enkele solitair.',
        stripeAccountId: 'acct_demo_meijer',
        connectStatus: 'INCOMPLETE',
        detailsSubmitted: true,
        requirementsDue: ['external_account', 'individual.id_number'],
      },
    }),
    // Has not started at all.
    prisma.designer.create({
      data: {
        name: 'Lieke van Dijk',
        studioName: 'Van Dijk Tuinarchitectuur',
        email: 'lieke@vandijktuin.nl',
        slug: 'van-dijk-tuinarchitectuur',
        avatarUrl: faces.e,
        headerUrl: gardens.grasses,
        city: 'Groningen',
        bio: 'Grote landelijke tuinen en erfbeplanting. Tekent in samenspraak met de aannemer, zodat het plan ook uitvoerbaar is.',
        connectStatus: 'NOT_STARTED',
      },
    }),
  ]);

  const [sanne, bram, fenna, joost, lieke] = designers;

  const listings: Array<Parameters<typeof prisma.listing.create>[0]['data']> = [
    {
      designerId: sanne.id,
      type: 'DESIGN',
      title: 'Stadstuin Jordaan',
      slug: 'stadstuin-jordaan',
      summary: 'Een besloten stadstuin van 6 bij 9 meter die er in februari nog uitziet alsof er iets gebeurt.',
      description:
        'Volledig ontwerp voor een smalle stadstuin op het noorden. De tekening lost het schaduwprobleem op met een verhoogd terras aan de achterzijde en een beplanting die het van blad moet hebben in plaats van bloei. Inclusief maatvoering, verhardingsplan en een plantlijst met aantallen per vierkante meter.',
      coverUrl: gardens.urbanBrick,
      gallery: [gardens.vertical, gardens.grasses, studio.sketchHands],
      style: 'Stadstuin',
      plotSize: '6 × 9 m',
      deliverables: ['Ontwerptekening 1:50', 'Verhardingsplan', 'Plantlijst met aantallen', 'Onderhoudskalender'],
      priceInclVatCents: 12_100,
      published: true,
    },
    {
      designerId: sanne.id,
      type: 'PACKAGE',
      title: 'Ontwerp + 3D + plantlijst',
      slug: 'ontwerp-3d-plantlijst',
      summary: 'Het complete pakket: plattegrond, drie 3D-beelden en een plantlijst waar de kweker mee vooruit kan.',
      description:
        'Voor wie het plan ook aan een aannemer of een partner moet uitleggen. Naast de plattegrond krijg je drie renders op ooghoogte, zodat duidelijk is hoe de tuin er in het derde jaar bij staat. De plantlijst is besteklaar.',
      coverUrl: studio.deskPlan,
      gallery: [studio.compass, studio.blueprintRuler, gardens.tidyBorder],
      style: 'Compleet pakket',
      plotSize: 'tot 200 m²',
      deliverables: ['Plattegrond 1:50', '3 × 3D-render', 'Besteklaare plantlijst', 'Twee revisierondes'],
      priceInclVatCents: 48_400,
      published: true,
    },
    {
      designerId: sanne.id,
      type: 'DESIGN',
      title: 'Siergrassen en vogelbad',
      slug: 'siergrassen-en-vogelbad',
      summary: 'Een tuin die in de winter mooier is dan in juli. Grassen blijven staan tot maart.',
      description:
        'Beplantingsplan rond een centraal vogelbad, met vier soorten siergras die pas in maart worden teruggezet. Bedoeld voor een tuin waar weinig tijd in gaat maar die er wel uit moet zien.',
      coverUrl: gardens.grasses,
      gallery: [gardens.tidyBorder, gardens.hydrangea],
      style: 'Natuurlijk',
      plotSize: '40 m² border',
      deliverables: ['Beplantingsplan', 'Plantlijst', 'Snoeikalender'],
      priceInclVatCents: 8_950,
      published: true,
    },
    {
      designerId: bram.id,
      type: 'DESIGN',
      title: 'Vuurplaats onder de pergola',
      slug: 'vuurplaats-onder-de-pergola',
      summary: 'Verblijfsplek voor acht personen, met een pergola die in drie jaar dichtgroeit.',
      description:
        'Ontwerp voor het achterste derde deel van een diepe tuin. Gemetselde vuurplaats, houten pergola met blauweregen en een zitrand die ook als keerwand werkt. Inclusief fundering- en afwateringsdetails, want daar gaat het meestal mis.',
      coverUrl: gardens.firePit,
      gallery: [gardens.pergola, gardens.deckDining],
      style: 'Landelijk',
      plotSize: '8 × 7 m',
      deliverables: ['Ontwerptekening', 'Constructiedetails pergola', 'Materiaalstaat', 'Afwateringsdetail'],
      priceInclVatCents: 24_200,
      published: true,
    },
    {
      designerId: bram.id,
      type: 'DESIGN',
      title: 'Houten vlonderterras',
      slug: 'houten-vlonderterras',
      summary: 'Een vlonder die niet gaat werken, met een randdetail dat het gras erbuiten houdt.',
      description:
        'Terrasontwerp in hardhout met verdekte bevestiging, inclusief onderconstructie en een opsluitband die het onderhoud halveert. Geschikt voor een ondergrond die niet vlak is.',
      coverUrl: gardens.deckDining,
      gallery: [gardens.contemporary, gardens.stoneWall],
      style: 'Modern',
      plotSize: '30 m²',
      deliverables: ['Vlondertekening', 'Onderconstructie', 'Materiaalstaat'],
      priceInclVatCents: 14_500,
      published: true,
    },
    {
      designerId: bram.id,
      type: 'PACKAGE',
      title: 'Achtertuin compleet',
      slug: 'achtertuin-compleet',
      summary: 'Van eerste schets tot bestek, voor een gemiddelde achtertuin.',
      description:
        'Drie werksessies, twee revisierondes en een besteklaar pakket waar een hovenier direct mee kan offreren. Bedoeld voor tuinen tot 250 m².',
      coverUrl: studio.drawings,
      gallery: [studio.workspace, gardens.pathways],
      style: 'Compleet pakket',
      plotSize: 'tot 250 m²',
      deliverables: ['Schetsontwerp', 'Definitief ontwerp', 'Bestek en materiaalstaat', 'Begeleiding offertetraject'],
      priceInclVatCents: 89_000,
      published: true,
    },
    {
      designerId: fenna.id,
      type: 'DESIGN',
      title: 'Hortensiaborder op het noorden',
      slug: 'hortensiaborder-noorden',
      summary: 'Schaduwborder met lange bloei, voor een muur waar niets het deed.',
      description:
        'Beplantingsplan voor een noordmuur van twaalf meter. Hortensia als ruggengraat, aangevuld met varens en schaduwvaste vaste planten die elkaar aflossen van mei tot oktober.',
      coverUrl: gardens.hydrangea,
      gallery: [gardens.vertical, gardens.greenhouse],
      style: 'Schaduwtuin',
      plotSize: '12 m muur',
      deliverables: ['Beplantingsplan', 'Plantlijst', 'Grondverbeteringsadvies'],
      priceInclVatCents: 9_900,
      published: true,
    },
    {
      designerId: fenna.id,
      type: 'DESIGN',
      title: 'Daktuin met lichte opbouw',
      slug: 'daktuin-lichte-opbouw',
      summary: 'Een daktuin die binnen het draagvermogen blijft en er toch vol uitziet.',
      description:
        'Ontwerp voor een dakterras van 35 m² met een maximale belasting van 150 kg/m². Lichte substraten, ondiepe bakken en beplanting die tegen wind kan.',
      coverUrl: gardens.backyard,
      gallery: [gardens.minimalPatio, gardens.tulips],
      style: 'Daktuin',
      plotSize: '35 m²',
      deliverables: ['Ontwerptekening', 'Gewichtsberekening per bak', 'Plantlijst', 'Irrigatieadvies'],
      priceInclVatCents: 18_150,
      published: true,
    },
    {
      designerId: joost.id,
      type: 'DESIGN',
      title: 'Cortenstaal en beton',
      slug: 'cortenstaal-en-beton',
      summary: 'Strakke voortuin voor nieuwbouw, met één solitair die het werk doet.',
      description:
        'Voortuinontwerp met gepolijst beton, cortenstalen keerwanden en een meerstammige amelanchier als middelpunt. Onderhoudsarm zonder dat het op een parkeerplaats lijkt.',
      coverUrl: gardens.minimalPatio,
      gallery: [gardens.rockGravel, gardens.contemporary],
      style: 'Minimalistisch',
      plotSize: '5 × 8 m',
      deliverables: ['Ontwerptekening', 'Materiaalstaat', 'Detaillering keerwand'],
      priceInclVatCents: 16_500,
      published: true,
    },
    {
      designerId: lieke.id,
      type: 'DESIGN',
      title: 'Erfbeplanting landelijk',
      slug: 'erfbeplanting-landelijk',
      summary: 'Streekeigen beplanting voor een boerenerf, in overleg met de gemeente.',
      description:
        'Erfbeplantingsplan met streekeigen soorten, geschikt voor een subsidieaanvraag. Inclusief hoogtematen op volwassen leeftijd en een gefaseerde aanplant over twee seizoenen.',
      coverUrl: gardens.pathways,
      gallery: [gardens.topiary, gardens.hothouse],
      style: 'Landelijk',
      plotSize: '2.500 m²',
      deliverables: ['Erfbeplantingsplan', 'Soortenlijst streekeigen', 'Faseringsvoorstel'],
      priceInclVatCents: 32_500,
      published: true,
    },
  ];

  for (const data of listings) await prisma.listing.create({ data });

  console.log(
    `Seeded ${designers.length} designers and ${listings.length} listings. Series ${SERIES} starts at 0.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
