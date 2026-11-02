// Starter decks people can add with one tap.
const deck = (key, name, emoji, columns, rows) => ({ key, name, emoji, columns, rows });

export const SAMPLES = [
  deck('chemistry', 'Chemistry essentials', '⚗️', ['Term', 'Definition'], [
    ['Solute', 'The substance dissolved in a solution.'],
    ['Solvent', 'The substance that dissolves the solute.'],
    ['Oxidation', 'Loss of electrons during a reaction.'],
    ['Reduction', 'Gain of electrons during a reaction.'],
    ['Catalyst', 'A substance that speeds up a reaction without being used up.'],
    ['Molarity', 'Moles of solute per liter of solution.'],
    ['Anion', 'An ion with a negative charge.'],
    ['Cation', 'An ion with a positive charge.'],
    ['Isotope', 'Atoms of the same element with different numbers of neutrons.'],
    ['Covalent bond', 'A bond formed when two atoms share electrons.'],
    ['Ionic bond', 'A bond formed by the attraction between oppositely charged ions.'],
    ['pH', 'A measure of how acidic or basic a solution is.']
  ]),
  deck('biology', 'Biology: the cell', '🧬', ['Term', 'Definition'], [
    ['Mitochondria', 'Organelles that release energy from food by cellular respiration, producing most of the cell’s ATP.'],
    ['Ribosome', 'Structure that builds proteins from amino acids.'],
    ['Nucleus', 'Membrane-bound organelle that holds the cell’s DNA.'],
    ['Cell membrane', 'Selectively permeable barrier that surrounds the cell.'],
    ['Chloroplast', 'Organelle in plant cells where photosynthesis takes place.'],
    ['Osmosis', 'Movement of water across a selectively permeable membrane.'],
    ['Diffusion', 'Movement of particles from an area of higher to lower concentration.'],
    ['Golgi apparatus', 'Organelle that modifies, sorts and packages proteins.'],
    ['Lysosome', 'Organelle containing enzymes that break down waste.'],
    ['Cytoplasm', 'Jelly-like fluid inside the cell that surrounds the organelles.'],
    ['Mitosis', 'Cell division that produces two identical daughter cells.']
  ]),
  deck('spanish', 'Spanish: first words', '💬', ['Spanish', 'English'], [
    ['hola', 'hello'],
    ['gracias', 'thank you'],
    ['por favor', 'please'],
    ['el agua', 'water'],
    ['la manzana', 'apple'],
    ['el perro', 'dog'],
    ['el gato', 'cat'],
    ['la casa', 'house'],
    ['el libro', 'book'],
    ['la escuela', 'school'],
    ['rojo', 'red'],
    ['grande', 'big / large'],
    ['pequeño', 'small / little'],
    ['comer', 'to eat'],
    ['beber', 'to drink'],
    ['hablar', 'to speak / to talk']
  ]),
  deck('capitals', 'World capitals', '🌍', ['Country', 'Capital'], [
    ['France', 'Paris'],
    ['Japan', 'Tokyo'],
    ['Canada', 'Ottawa'],
    ['Australia', 'Canberra'],
    ['Brazil', 'Brasília'],
    ['Egypt', 'Cairo'],
    ['Kenya', 'Nairobi'],
    ['Germany', 'Berlin'],
    ['Mexico', 'Mexico City'],
    ['India', 'New Delhi'],
    ['South Korea', 'Seoul'],
    ['Argentina', 'Buenos Aires'],
    ['Turkey', 'Ankara'],
    ['Nigeria', 'Abuja'],
    ['Spain', 'Madrid']
  ])
];

export function sampleDeck(key, uuid) {
  const s = SAMPLES.find(x => x.key === key);
  if (!s) return null;
  const [a, b] = s.columns;
  return {
    id: uuid(),
    name: s.name,
    columns: [...s.columns],
    templates: { front: `{{${a}}}`, back: `{{${b}}}`, hint: '' },
    cards: s.rows.map(([x, y]) => ({ id: uuid(), data: { [a]: x, [b]: y } }))
  };
}
