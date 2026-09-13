import test from 'node:test';
import assert from 'node:assert/strict';

function normalizeBrowserSourceCat(cat) {
  return String(cat).replace(/F[A-Q]$/i, '');
}

function labelForCategory(cat) {
  const match = String(cat).match(/F([A-Q])$/i);
  if (!match) return 'Timetrial';
  const letter = match[1].toUpperCase();
  return `${letter === 'A' ? 'A' : letter === 'B' ? 'B' : letter === 'C' ? 'C' : letter === 'D' ? 'D' : letter === 'E' ? 'E' : letter === 'F' ? 'F' : letter === 'G' ? 'G' : letter === 'H' ? 'H' : letter === 'I' ? 'I' : letter === 'J' ? 'J' : letter === 'K' ? 'K' : letter === 'L' ? 'L' : letter === 'M' ? 'M' : letter === 'N' ? 'N' : letter === 'O' ? 'O' : letter === 'P' ? 'P' : letter === 'Q' ? 'Q' : 'Timetrial'} Finale`;
}

test('dashboard browser source stays on the base field when selecting a family category', () => {
  assert.equal(normalizeBrowserSourceCat('Mix2xFA'), 'Mix2x');
  assert.equal(normalizeBrowserSourceCat('HC4+FB'), 'HC4+');
});

test('dashboard family labels extend through FA..FQ', () => {
  assert.equal(labelForCategory('Mix2xFA'), 'A Finale');
  assert.equal(labelForCategory('HC4+FB'), 'B Finale');
  assert.equal(labelForCategory('HC4+FC'), 'C Finale');
  assert.equal(labelForCategory('HC4+FD'), 'D Finale');
  assert.equal(labelForCategory('HC4+FE'), 'E Finale');
  assert.equal(labelForCategory('HC4+FF'), 'F Finale');
  assert.equal(labelForCategory('HC4+FG'), 'G Finale');
  assert.equal(labelForCategory('HC4+FH'), 'H Finale');
  assert.equal(labelForCategory('HC4+FI'), 'I Finale');
  assert.equal(labelForCategory('HC4+FJ'), 'J Finale');
  assert.equal(labelForCategory('HC4+FK'), 'K Finale');
  assert.equal(labelForCategory('HC4+FL'), 'L Finale');
  assert.equal(labelForCategory('HC4+FM'), 'M Finale');
  assert.equal(labelForCategory('HC4+FN'), 'N Finale');
  assert.equal(labelForCategory('HC4+FO'), 'O Finale');
  assert.equal(labelForCategory('HC4+FP'), 'P Finale');
  assert.equal(labelForCategory('HC4+FQ'), 'Q Finale');
});
