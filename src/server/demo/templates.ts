// Demo assignments for the seeded demo data and for DemoProvider. Each one is
// a mark scheme plus a small bank of invented pupil answers, each answer with
// the mark, evidence and comment a careful marker would give. Seeded work is
// built from these answers, so DemoProvider can mark any seeded script
// realistically without the network. All content is invented.
//
// Three schemes are the evaluation cases' own (eval/), so the same scheme text
// is used everywhere. The rest follow CCEA-style Key Stage 3 and GCSE framing.
import { EVAL_CASES } from "../../../eval/cases";
import type { WorkType } from "../oversight/figures";

export type Answer = {
  /** The pupil's answer to this question, without the "Q1 " label. May span lines. */
  text: string;
  /** What the AI proposes. */
  awarded: number;
  evidence: string;
  comment: string;
  /** What a careful teacher would give, when it differs from the AI. */
  teacher?: number;
  /** Something for the teacher to check. */
  flag?: string;
};

export type LinedTemplate = {
  key: string;
  workType: "short" | "maths";
  subject: "Mathematics" | "Science" | "English";
  title: string;
  schemeText: string;
  totalMarks: number;
  criteria: { label: string; max: number }[];
  /** One bank of answers per criterion, in the same order. */
  answers: Answer[][];
  feedback: { strong: string[]; middle: string[]; weak: string[] };
};

export type Essay = {
  text: string;
  lines: { awarded: number; evidence: string; comment: string; teacher?: number }[];
  flags: string[];
  feedback: string;
};

export type EssayTemplate = {
  key: string;
  workType: "essay";
  subject: "English";
  title: string;
  schemeText: string;
  totalMarks: number;
  criteria: { label: string; max: number }[];
  essays: Essay[];
};

export type Template = LinedTemplate | EssayTemplate;

const evalCase = (id: string) => {
  const c = EVAL_CASES.find((x) => x.id === id);
  if (!c) throw new Error(`eval case ${id} missing`);
  return c;
};
const cells = evalCase("short-01");
const algebra = evalCase("maths-01");
const market = evalCase("essay-01");

export const TEMPLATES: Template[] = [
  // -------------------------------------------------------------------------
  {
    key: "cells",
    workType: "short",
    subject: "Science",
    title: cells.title,
    schemeText: cells.schemeText,
    totalMarks: cells.totalMarks,
    criteria: cells.criteria,
    answers: [
      [
        { text: "chloroplasts", awarded: 1, evidence: "chloroplasts", comment: "Correct organelle." },
        { text: "the chloroplast", awarded: 1, evidence: "the chloroplast", comment: "Correct organelle." },
        { text: "the nucleus", awarded: 0, evidence: "the nucleus", comment: "The nucleus controls the cell; photosynthesis happens in chloroplasts." },
        { text: "chlorophyll", awarded: 0, evidence: "chlorophyll", comment: "Chlorophyll is the pigment, not the part of the cell.", teacher: 0, flag: "Q1: 'chlorophyll' names the pigment, not the organelle; check whether your scheme accepts it." },
      ],
      [
        { text: "carbon dioxide + water -> glucose + oxygen", awarded: 2, evidence: "carbon dioxide + water -> glucose + oxygen", comment: "Reactants and products both correct." },
        { text: "carbon dioxide + water makes sugar and oxygen", awarded: 2, evidence: "carbon dioxide + water makes sugar and oxygen", comment: "'Sugar' accepted for glucose; reactants and products correct.", teacher: 1, flag: "Q2: 'sugar' for glucose; check whether you accept it." },
        { text: "oxygen + water -> glucose + carbon dioxide", awarded: 0, evidence: "oxygen + water -> glucose", comment: "Reactants and products are confused." },
        { text: "water and sunlight make glucose", awarded: 0, evidence: "water and sunlight make glucose", comment: "Light is not a reactant; carbon dioxide and oxygen missing." },
      ],
      [
        { text: "cell wall and permanent vacuole", awarded: 2, evidence: "cell wall and permanent vacuole", comment: "Two correct structures." },
        { text: "a cell wall and a big vacuole", awarded: 2, evidence: "a cell wall and a big vacuole", comment: "Two correct structures; 'big vacuole' accepted." },
        { text: "cell wall and cell membrane", awarded: 1, evidence: "cell wall and cell membrane", comment: "Cell wall correct; animal cells also have a membrane." },
        { text: "nucleus and cytoplasm", awarded: 0, evidence: "nucleus and cytoplasm", comment: "Both are found in animal cells too." },
      ],
      [
        { text: "the light gives the energy that is needed to make glucose", awarded: 1, evidence: "light gives the energy", comment: "Energy idea given." },
        { text: "to give them energy for the reaction", awarded: 1, evidence: "energy for the reaction", comment: "Energy idea given." },
        { text: "so they can see", awarded: 0, evidence: "so they can see", comment: "No idea of energy for photosynthesis." },
        { text: "light helps them grow", awarded: 0, evidence: "light helps them grow", comment: "Too vague: no idea of energy for the reaction.", flag: "Q4: 'helps them grow' is vague; you may decide it shows the idea." },
      ],
      [
        { text: "in the dark it can't photosynthesise so no glucose is made, but it still respires and uses up glucose", awarded: 2, evidence: "no glucose is made, but it still respires", comment: "Both marking points." },
        { text: "it cannot make food without light", awarded: 1, evidence: "cannot make food without light", comment: "First point only; respiration not mentioned." },
        { text: "it uses its glucose for respiration", awarded: 1, evidence: "uses its glucose for respiration", comment: "Second point only." },
        { text: "it dries out", awarded: 0, evidence: "it dries out", comment: "Not linked to photosynthesis or respiration." },
      ],
    ],
    feedback: {
      strong: [
        "You linked photosynthesis and respiration clearly to explain the loss of mass. Next, practise the balanced symbol equation as well as the word equation.",
        "Accurate answers throughout, especially the word equation. Next, explain why the permanent vacuole matters to the plant.",
      ],
      middle: [
        "You know where photosynthesis happens and why light is needed. Next, learn the word equation so you can write the reactants and products from memory.",
        "Good recall of plant cell structures. Next, add respiration to your answer about the plant in the dark.",
      ],
      weak: [
        "You have started to name parts of the plant cell. Next, learn the word equation for photosynthesis and practise writing it out.",
        "You attempted every question. Next, revise which parts are only in plant cells using your cell diagram.",
      ],
    },
  },
  // -------------------------------------------------------------------------
  {
    key: "particles",
    workType: "short",
    subject: "Science",
    title: "Particles and changes of state",
    schemeText: [
      "Q1 Name the change of state when a liquid turns into a gas. (1) Evaporation or boiling.",
      "Q2 Describe the arrangement of particles in a solid. (2) Close together (1); regular pattern or fixed positions (1).",
      "Q3 Explain why a gas can be compressed but a solid cannot. (2) Gas particles are far apart (1); so they can be pushed closer together / solid particles already touching (1).",
      "Q4 What happens to the movement of particles when a substance is heated? (1) They move faster / gain energy.",
      "Q5 Why does a puddle disappear on a warm day? (2) Water evaporates (1); particles at the surface gain enough energy to escape (1).",
    ].join("\n"),
    totalMarks: 8,
    criteria: [
      { label: "Q1", max: 1 },
      { label: "Q2", max: 2 },
      { label: "Q3", max: 2 },
      { label: "Q4", max: 1 },
      { label: "Q5", max: 2 },
    ],
    answers: [
      [
        { text: "evaporation", awarded: 1, evidence: "evaporation", comment: "Correct." },
        { text: "boiling", awarded: 1, evidence: "boiling", comment: "Correct." },
        { text: "condensing", awarded: 0, evidence: "condensing", comment: "That is gas to liquid." },
      ],
      [
        { text: "packed close together in rows and they vibrate", awarded: 2, evidence: "packed close together in rows", comment: "Close together and regular arrangement." },
        { text: "close together", awarded: 1, evidence: "close together", comment: "Arrangement not described." },
        { text: "they don't move", awarded: 0, evidence: "they don't move", comment: "Incorrect: particles in a solid vibrate; arrangement not described.", flag: "Q2: the pupil says particles 'don't move'; you may want to address this misconception." },
      ],
      [
        { text: "the gas particles are far apart so they can be squashed together but in a solid they are already touching", awarded: 2, evidence: "far apart so they can be squashed together", comment: "Both points." },
        { text: "gas has spaces between the particles", awarded: 1, evidence: "spaces between the particles", comment: "First point only.", teacher: 1 },
        { text: "because gas is lighter", awarded: 0, evidence: "gas is lighter", comment: "Not about particle spacing." },
      ],
      [
        { text: "they move faster", awarded: 1, evidence: "move faster", comment: "Correct." },
        { text: "they get more energy and vibrate more", awarded: 1, evidence: "get more energy", comment: "Energy idea accepted." },
        { text: "they get bigger", awarded: 0, evidence: "they get bigger", comment: "Particles do not grow; a common misconception.", flag: "Q4: 'particles get bigger' is a common misconception worth addressing." },
      ],
      [
        { text: "the water evaporates because the particles at the top get enough energy to escape into the air", awarded: 2, evidence: "particles at the top get enough energy to escape", comment: "Both points." },
        { text: "it evaporates in the heat", awarded: 1, evidence: "it evaporates", comment: "Evaporation named; no particle explanation." },
        { text: "it soaks into the ground", awarded: 0, evidence: "soaks into the ground", comment: "Not evaporation.", teacher: 0 },
      ],
    ],
    feedback: {
      strong: ["You explained compression using the spacing of particles, which is exactly the idea. Next, link evaporation to the energy of individual particles at the surface."],
      middle: ["You know the names of the changes of state. Next, describe particle arrangements using two features: how close and how ordered."],
      weak: ["You have tried every question. Next, draw the particle diagrams for solid, liquid and gas and label how the particles move."],
    },
  },
  // -------------------------------------------------------------------------
  {
    key: "techniques",
    workType: "short",
    subject: "English",
    title: "Language techniques in poetry",
    schemeText: [
      "Read the extract: 'The wind was a wolf at the window, howling, howling for the light.'",
      "Q1 Name the technique in 'The wind was a wolf'. (1) Metaphor.",
      "Q2 Find an example of repetition. (1) 'howling, howling'.",
      "Q3 What effect does the image of the wolf create? (2) Threat or danger (1); developed with reference to the wind seeming alive or hungry (1).",
      "Q4 Name the sound technique in 'wind was a wolf at the window'. (1) Alliteration.",
      "Q5 Why might the poet repeat 'howling'? (1) To emphasise the noise or how relentless the wind is.",
    ].join("\n"),
    totalMarks: 6,
    criteria: [
      { label: "Q1", max: 1 },
      { label: "Q2", max: 1 },
      { label: "Q3", max: 2 },
      { label: "Q4", max: 1 },
      { label: "Q5", max: 1 },
    ],
    answers: [
      [
        { text: "metaphor", awarded: 1, evidence: "metaphor", comment: "Correct." },
        { text: "a simile", awarded: 0, evidence: "a simile", comment: "No 'like' or 'as': it is a metaphor." },
        { text: "personification", awarded: 0, evidence: "personification", comment: "The scheme credits metaphor.", teacher: 1, flag: "Q1: 'personification' is defensible here; check whether you will credit it." },
      ],
      [
        { text: "howling, howling", awarded: 1, evidence: "howling, howling", comment: "Correct." },
        { text: "wind and window", awarded: 0, evidence: "wind and window", comment: "That is alliteration, not repetition." },
      ],
      [
        { text: "it makes the wind seem dangerous and hungry like it wants to get in", awarded: 2, evidence: "dangerous and hungry like it wants to get in", comment: "Threat, developed with the wind seeming alive." },
        { text: "it makes it sound scary", awarded: 1, evidence: "sound scary", comment: "Threat identified; not developed." },
        { text: "wolves are animals", awarded: 0, evidence: "wolves are animals", comment: "No effect explained." },
      ],
      [
        { text: "alliteration", awarded: 1, evidence: "alliteration", comment: "Correct." },
        { text: "onomatopoeia", awarded: 0, evidence: "onomatopoeia", comment: "The repeated 'w' sound is alliteration." },
      ],
      [
        { text: "to show the wind keeps going and won't stop", awarded: 1, evidence: "keeps going and won't stop", comment: "Relentlessness explained." },
        { text: "because it is a poem", awarded: 0, evidence: "because it is a poem", comment: "No effect given." },
      ],
    ],
    feedback: {
      strong: ["You explained the wolf image with real insight into how the wind seems alive. Next, try commenting on how the techniques work together."],
      middle: ["You identify techniques accurately. Next, push each point further by explaining the effect on the reader."],
      weak: ["You are starting to spot techniques. Next, learn the difference between a simile and a metaphor with two examples of each."],
    },
  },
  // -------------------------------------------------------------------------
  {
    key: "algebra",
    workType: "maths",
    subject: "Mathematics",
    title: algebra.title,
    schemeText: algebra.schemeText,
    totalMarks: algebra.totalMarks,
    criteria: algebra.criteria,
    answers: [
      [
        { text: "3x + 12 - 2x + 2 = x + 14", awarded: 2, evidence: "3x + 12 - 2x + 2 = x + 14", comment: "M1 A1: both brackets expanded and simplified." },
        { text: "3x + 12 - 2x - 2 = x + 10", awarded: 0, evidence: "-2x - 2", comment: "M0 A0: sign error expanding -2(x - 1)." },
        { text: "3x + 4 - 2x - 1 = x + 3", awarded: 0, evidence: "3x + 4", comment: "M0 A0: brackets not multiplied out." },
        { text: "x + 14", awarded: 2, evidence: "x + 14", comment: "Correct answer, no working; full marks per the scheme." },
      ],
      [
        { text: "5x - 2x = 8 + 7\n3x = 15\nx = 5", awarded: 2, evidence: "3x = 15, x = 5", comment: "M1 A1." },
        { text: "3x = 15\nx = 3", awarded: 1, evidence: "3x = 15, x = 3", comment: "M1 for 3x = 15; A0: division error." },
        { text: "7x = 1\nx = 1/7", awarded: 0, evidence: "7x = 1", comment: "M0: terms collected with the wrong signs." },
      ],
      [
        { text: "4(2x + 3) = 44\n8x + 12 = 44\n8x = 32\nx = 4", awarded: 3, evidence: "4(2x + 3) = 44 ... x = 4", comment: "M1 M1 A1." },
        { text: "2x + 3 = 11\n2x = 8\nx = 4", awarded: 3, evidence: "2x + 3 = 11", comment: "M1 (implied) M1 A1: divided by 4 first." },
        { text: "4(2x + 3) = 44\n8x + 3 = 44\nx = 5.125", awarded: 1, evidence: "8x + 3 = 44", comment: "M1 for forming the equation; expansion error.", flag: "Q3: expansion slip after a correct equation; check whether you award the second M mark." },
        { text: "2x + 3 + 4 = 44\n2x = 37", awarded: 0, evidence: "2x + 3 + 4 = 44", comment: "M0: added the sides instead of multiplying for area.", teacher: 0 },
      ],
    ],
    feedback: {
      strong: [
        "Your working is clear and every step follows from the last. Next, check each answer by substituting it back into the original equation.",
        "Accurate algebra throughout. Next, try the same area problem with a quadratic expression.",
      ],
      middle: [
        "Your methods are right and you set up the area equation well. Next, take extra care with negative signs when expanding brackets.",
        "Good equation-forming. Next, check your final division step; substituting back would have caught the slip.",
      ],
      weak: [
        "You have made a start on each question. Next, practise expanding brackets by multiplying every term inside.",
        "You attempted each question. Next, remember that area is length times width, and write that equation first.",
      ],
    },
  },
  // -------------------------------------------------------------------------
  {
    key: "fractions",
    workType: "maths",
    subject: "Mathematics",
    title: "Fractions and percentages",
    schemeText: [
      "Q1 Work out 2/3 + 1/4. (2) M1 common denominator, e.g. 8/12 + 3/12. A1 11/12.",
      "Q2 Find 35% of 240. (2) M1 correct method, e.g. 0.35 x 240 or 10% = 24. A1 84.",
      "Q3 A coat costs £80. It is reduced by 15%. Find the sale price. (2) M1 80 x 0.85 or 80 - 12. A1 £68.",
      "Q4 Write 18 as a percentage of 72. (2) M1 18/72 x 100. A1 25%.",
    ].join("\n"),
    totalMarks: 8,
    criteria: [
      { label: "Q1", max: 2 },
      { label: "Q2", max: 2 },
      { label: "Q3", max: 2 },
      { label: "Q4", max: 2 },
    ],
    answers: [
      [
        { text: "8/12 + 3/12 = 11/12", awarded: 2, evidence: "8/12 + 3/12 = 11/12", comment: "M1 A1." },
        { text: "3/7", awarded: 0, evidence: "3/7", comment: "M0: numerators and denominators added." },
        { text: "8/12 + 3/12 = 11/24", awarded: 1, evidence: "8/12 + 3/12", comment: "M1 for the common denominator; A0.", flag: "Q1: correct common denominator but the denominators were then added." },
      ],
      [
        { text: "10% = 24\n30% = 72\n5% = 12\n72 + 12 = 84", awarded: 2, evidence: "72 + 12 = 84", comment: "M1 A1 by building up from 10%." },
        { text: "0.35 x 240 = 84", awarded: 2, evidence: "0.35 x 240 = 84", comment: "M1 A1." },
        { text: "240 / 35 = 6.9", awarded: 0, evidence: "240 / 35", comment: "M0: divided instead of finding a percentage." },
      ],
      [
        { text: "15% of 80 = 12\n80 - 12 = 68\n£68", awarded: 2, evidence: "80 - 12 = 68", comment: "M1 A1." },
        { text: "15% of 80 = 12\n£12", awarded: 1, evidence: "15% of 80 = 12", comment: "M1; A0: gave the reduction, not the sale price.", teacher: 1 },
        { text: "80 - 15 = 65", awarded: 0, evidence: "80 - 15 = 65", comment: "M0: subtracted 15 pounds, not 15%." },
      ],
      [
        { text: "18/72 = 1/4 = 25%", awarded: 2, evidence: "18/72 = 1/4 = 25%", comment: "M1 A1." },
        { text: "72/18 = 4 so 4%", awarded: 0, evidence: "72/18 = 4", comment: "M0: fraction inverted." },
        { text: "18/72 x 100", awarded: 1, evidence: "18/72 x 100", comment: "M1; answer not completed." },
      ],
    ],
    feedback: {
      strong: ["Confident percentage methods, and building up from 10% was efficient. Next, try reverse percentages: finding the original price."],
      middle: ["You chose sensible methods. Next, read the final question again: was it asking for the reduction or the new price?"],
      weak: ["You attempted each question. Next, practise finding a common denominator before adding fractions."],
    },
  },
  // -------------------------------------------------------------------------
  {
    key: "market",
    workType: "essay",
    subject: "English",
    title: market.title,
    schemeText: market.schemeText,
    totalMarks: market.totalMarks,
    criteria: market.criteria,
    essays: [
      {
        text:
          "Frost crusts the tarpaulins before the first stall opens. A man in a moth-eaten scarf drags crates of oranges into the lamplight, and they glow like small suns against the grey.\n\nBy nine the square is thick with noise. Prices are shouted, coins clink, a radio crackles out a carol nobody is listening to. Steam curls from the chestnut cart and hangs there, refusing to leave.\n\nI stand still for a moment in the middle of it all and let it wash past me.",
        lines: [
          { awarded: 4, evidence: "Frost crusts the tarpaulins before the first stall opens.", comment: "Clear focus; paragraphs build the morning." },
          { awarded: 3, evidence: "they glow like small suns against the grey", comment: "Effective imagery, some well-chosen verbs.", teacher: 4 },
          { awarded: 2, evidence: "Steam curls from the chestnut cart and hangs there", comment: "Accurate, with varied sentences." },
        ],
        flags: ["Language and imagery is between bands 3 and 4; check against your band descriptors."],
        feedback: "Your opening line sets the scene sharply and the steam that 'refuses to leave' is a lovely detail. Next, give the final paragraph the same vivid detail as the rest.",
      },
      {
        text:
          "The market is very busy on a winter morning. There are lots of stalls selling food and clothes and christmas things. It is cold and everyone has coats on.\n\nI like the hot dog stall the best because it smells nice. There is also a man selling scarfs. The lights are pretty.\n\nThen we went home.",
        lines: [
          { awarded: 2, evidence: "There are lots of stalls selling food and clothes", comment: "Relevant ideas; limited structure and abrupt ending." },
          { awarded: 1, evidence: "The lights are pretty.", comment: "Basic vocabulary; little imagery." },
          { awarded: 1, evidence: "christmas things", comment: "Generally accurate but simple sentences and some errors." },
        ],
        flags: [],
        feedback: "You chose good details, like the smell of the hot dog stall. Next, pick one stall and describe it closely using all five senses.",
      },
      {
        text:
          "Breath smokes in the frozen air as the market stirs. Stalls unfold like paper flowers; a baker stacks loaves still warm enough to steam.\n\nThe crowd thickens. Children press their noses to the glass of the sweet stall, leaving small foggy ghosts behind. Somewhere a dog barks at a pigeon, and the pigeon ignores it.\n\nAs the church clock strikes ten the sun finally slides over the rooftops and the frost on the cobbles turns to glitter, then to nothing.",
        lines: [
          { awarded: 4, evidence: "As the church clock strikes ten the sun finally slides over the rooftops", comment: "Well structured: the morning moves on through the piece." },
          { awarded: 4, evidence: "Stalls unfold like paper flowers", comment: "Ambitious, varied imagery used deliberately." },
          { awarded: 2, evidence: "the frost on the cobbles turns to glitter, then to nothing", comment: "Accurate and controlled." },
        ],
        flags: [],
        feedback: "The ending, with the frost turning 'to glitter, then to nothing', is a confident choice. Next, try varying the opening of your paragraphs so they do not all begin with the scene.",
      },
      {
        text:
          "its early and the market is opening. the stalls have lots of stuff on them, my mum buys fish and the fish man shouts alot. its freezing and my hands are numb.\n\nthere is music playing and people are laughing. i got a hot chocolate it was the best part",
        lines: [
          { awarded: 2, evidence: "the fish man shouts alot", comment: "Some relevant ideas, drifting into recount." },
          { awarded: 1, evidence: "my hands are numb", comment: "Mostly basic vocabulary; one effective detail." },
          { awarded: 0, evidence: "i got a hot chocolate it was the best part", comment: "Missing capitals and run-on sentences throughout.", teacher: 1 },
        ],
        flags: ["Accuracy: errors are frequent but meaning stays clear; check whether band 0 or 1 fits better."],
        feedback: "You included real sounds of the market, like the fish seller shouting. Next, start every sentence with a capital letter and end it with a full stop.",
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    key: "persuasive",
    workType: "essay",
    subject: "English",
    title: "Persuasive letter: a longer lunch break",
    schemeText: [
      "Task: Write a letter to your principal arguing that the lunch break should be longer. (10)",
      "Argument and organisation (4): 4 clear, developed argument with a strong structure and a convincing ending; 3 clear argument, mostly well organised; 2 some relevant points, limited development; 1 simple points; 0 nothing relevant.",
      "Persuasive language and tone (4): 4 a range of persuasive devices used with control, tone suits the audience; 3 some effective devices, mostly appropriate tone; 2 some persuasive language, tone uneven; 1 little persuasion; 0 nothing creditable.",
      "Accuracy (2): 2 mostly accurate with letter conventions; 1 errors that do not obscure meaning; 0 errors obscure meaning.",
    ].join("\n"),
    totalMarks: 10,
    criteria: [
      { label: "Argument and organisation", max: 4 },
      { label: "Persuasive language and tone", max: 4 },
      { label: "Accuracy", max: 2 },
    ],
    essays: [
      {
        text:
          "Dear Mr Hendry,\n\nI am writing on behalf of Year 10 to ask you to consider extending our lunch break by fifteen minutes.\n\nAt present, by the time we have queued for food, there are barely ten minutes left to eat. Rushed meals are not healthy meals. A longer break would also let clubs meet without eating into lesson time, which teachers would surely welcome.\n\nSome may argue that the day would finish later. However, fifteen minutes is a small price for pupils who return to class rested, fed and ready to learn.\n\nYours sincerely,\nA Year 10 pupil",
        lines: [
          { awarded: 4, evidence: "Some may argue that the day would finish later. However", comment: "Developed argument; counter-argument handled; strong ending." },
          { awarded: 3, evidence: "Rushed meals are not healthy meals.", comment: "Effective devices and suitable tone.", teacher: 4 },
          { awarded: 2, evidence: "Yours sincerely", comment: "Accurate, with letter conventions." },
        ],
        flags: ["Persuasive language is between bands 3 and 4; check against your band descriptors."],
        feedback: "Answering the counter-argument made your letter far more convincing. Next, add one piece of evidence, such as a survey of your year group.",
      },
      {
        text:
          "Dear Principal,\n\nWe should have a longer lunch because its not long enough. We dont get time to eat and play football. Everyone wants it longer. Please make it longer.\n\nFrom Jamie",
        lines: [
          { awarded: 1, evidence: "We should have a longer lunch because its not long enough.", comment: "Simple points, not developed." },
          { awarded: 1, evidence: "Please make it longer.", comment: "Little persuasion; repetition rather than argument." },
          { awarded: 1, evidence: "its not long enough", comment: "Missing apostrophes; meaning clear." },
        ],
        flags: [],
        feedback: "You stated your view clearly and politely. Next, give each reason its own paragraph and explain why it matters to the school.",
      },
      {
        text:
          "Dear Mrs Patterson,\n\nImagine trying to eat a full meal, finish your homework and catch up with friends in thirty-five minutes. That is what we face every day.\n\nFirstly, a longer lunch would help us eat properly. Secondly, it would give time for clubs. Thirdly, research shows that breaks help concentration.\n\nI hope you will think about this.\n\nYours sincerely,\nRiley",
        lines: [
          { awarded: 3, evidence: "Firstly, a longer lunch would help us eat properly.", comment: "Clear argument, well organised; points listed rather than developed." },
          { awarded: 3, evidence: "Imagine trying to eat a full meal", comment: "Effective opening and rhetorical devices." },
          { awarded: 2, evidence: "Yours sincerely", comment: "Accurate, with letter conventions." },
        ],
        flags: ["'Research shows' is unsupported; you may want to comment on evidence."],
        feedback: "Your opening pulls the reader in straight away. Next, develop each of your three reasons with an example rather than listing them.",
      },
    ],
  },
];

export const templateByKey = (key: string) => {
  const t = TEMPLATES.find((x) => x.key === key);
  if (!t) throw new Error(`template ${key} missing`);
  return t;
};
