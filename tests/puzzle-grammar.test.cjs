'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
const app = new Function(script + '\nreturn { GRAMMAR_FAMILIES, grammarBuild, grammarAnalyze, generateGrammarPuzzle, initial, step, solve, won, validateLevel, recommend };')();

const familyStats = {};
for (const kind of app.GRAMMAR_FAMILIES) {
  let accepted = 0;
  const maps = new Set();
  const allSteps = [];
  for (let seed = 0; seed < 256; seed++) {
    const candidate = app.grammarBuild(kind, seed);
    const level = candidate.level;
    const metrics = app.grammarAnalyze(level, kind);
    assert.ok(metrics, kind + ' seed ' + seed + ' must pass grammar validation');
    assert.equal(metrics.grammar, kind);
    assert.deepEqual(metrics.required, level.allow, 'every allowed rule must be necessary');
    assert.ok(metrics.paths > 0);
    assert.ok(metrics.states > 0);

    const validated = app.validateLevel(level);
    assert.equal(validated.map.length, 6);
    assert.ok(validated.map.every(row => row.length === 10));

    for (const rule of level.allow) {
      const ablated = { ...level, allow: level.allow.filter(x => x !== rule) };
      assert.equal(app.solve(ablated, app.initial(ablated)), null,
        kind + ': rule ' + rule + ' must be essential');
    }
    for (let i = 0; i < (level.laws || []).length; i++) {
      const ablated = { ...level, laws: level.laws.filter((_, j) => j !== i) };
      assert.equal(app.solve(ablated, app.initial(ablated)), null,
        kind + ': conditional law ' + i + ' must be essential');
    }
    if (kind === 'switch-phase') {
      for (const symbol of ['B', 'T']) {
        const ablated = { ...level, map: level.map.map(row => row.replace(symbol, '.')) };
        assert.equal(app.solve(ablated, app.initial(ablated)), null,
          'switch-phase: ' + symbol + ' must be essential');
      }
    }

    const pathToGoal = app.solve(level, app.initial(level));
    assert.ok(pathToGoal);
    assert.equal(pathToGoal.length, metrics.steps, 'reported length must be shortest');
    let state = app.initial(level);
    for (const action of pathToGoal) {
      state = app.step(level, state, action);
      assert.ok(state, 'every replayed transition must be legal');
    }
    assert.ok(app.won(level, state), 'replayed solution must reach the goal');

    maps.add(level.map.join(''));
    allSteps.push(metrics.steps);
    accepted++;
  }
  familyStats[kind] = {
    accepted,
    uniqueMaps: maps.size,
    minSteps: Math.min(...allSteps),
    maxSteps: Math.max(...allSteps)
  };
}

const generated = Array.from({ length: 500 }, (_, seed) => app.generateGrammarPuzzle(seed, 64));
assert.ok(generated.every(Boolean), 'all held-out seeds must produce a puzzle');
const familyCounts = Object.fromEntries(app.GRAMMAR_FAMILIES.map(kind => [
  kind, generated.filter(level => level.metrics.grammar === kind).length
]));
for (const count of Object.values(familyCounts)) {
  assert.ok(count >= 70 && count <= 130, 'family selection must remain balanced');
}
const uniqueMaps = new Set(generated.map(level =>
  level.metrics.grammar + '|' + level.map.join('')
));
assert.ok(uniqueMaps.size >= 160, 'generation should cover a non-trivial map set');
const meanValidCandidates = generated.reduce((sum, level) =>
  sum + level.metrics.validCandidates, 0) / generated.length;
assert.ok(meanValidCandidates > 45);

for (const seed of [0, 1, 999, 123456, 0xffffffff]) {
  assert.deepEqual(
    app.generateGrammarPuzzle(seed, 64),
    app.generateGrammarPuzzle(seed, 64),
    'same seed must reproduce the same puzzle'
  );
}
for (const rule of ['g', 'p', 'f']) {
  const level = app.generateGrammarPuzzle(20261123, 64, rule, 8);
  assert.ok(level);
  assert.ok(level.metrics.required.includes(rule));
  assert.ok(Math.abs(level.metrics.steps - 8) <= 1, 'target-step selection should choose the nearest available path length');
  const profile = {
    g: { a: 10, b: 2 },
    p: { a: 10, b: 2 },
    f: { a: 10, b: 2 },
    n: 12
  };
  profile[rule] = { a: 2, b: 10 };
  const recommended = app.recommend(profile, 101);
  assert.deepEqual(recommended.metrics.required, [rule],
    'adaptive training should prefer a focused single-rule puzzle');
}
assert.match(html, /生成机制谜题/);
assert.match(html, /generateGrammarPuzzle\(seed,64\)/);
assert.match(html, /EXPERIMENT 019/);

console.log(JSON.stringify({
  families: familyStats,
  generatedSeeds: generated.length,
  familyCounts,
  uniqueMaps: uniqueMaps.size,
  meanValidCandidates: Number(meanValidCandidates.toFixed(2)),
  deterministicSeeds: 5,
  focusedRecommendations: ['g', 'p', 'f']
}, null, 2));
