/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const assert = require('assert');
const util = require('util');
const fs = require('fs');
const seedrandom = require('seedrandom');
const {Bar, Presets} = require('cli-progress');

const debugMode = !!process.env.DEBUG;

// You can use this to enable debugging info in this file.
const p = function(x) {
  if (debugMode) { return console.warn(x); }
};
const i = o => util.inspect(o, {colors:true, depth:null});

// By default, use a new seed every 6 hours. This balances making test runs stable while debugging
// with avoiding obscure bugs caused by a rare seed.
//seed = Math.floor Date.now() / (1000*60*60*6)
const seed = process.env.SEED != null ? process.env.SEED : 1;

const restorefile = process.env.SYNCFILE != null ? process.env.SYNCFILE : 'fuzzercrash.data';
let restorestate = {
  iter: 0,
  seedstate: true
};

try {
  restorestate = JSON.parse(fs.readFileSync(restorefile, 'utf8'));
  console.log(`restored from ${restorefile} iteration ${restorestate.iter}`);
} catch (error) {}

const randomReal = (exports.randomReal = seedrandom(seed, {state: restorestate.seedstate}));

// Generate a random int 0 <= k < n
const randomInt = (exports.randomInt = n => Math.floor(randomReal() * n));

// Return a random word from a corpus each time the method is called
const randomWord = (exports.randomWord = (function() {
  const words = fs.readFileSync(__dirname + '/jabberwocky.txt').toString().split(/\W+/);
  return () => words[randomInt(words.length)];
})());

// Cross-transform function. Transform server by client and client by server. Returns
// [server, client].
const transformX = (type, left, right) => [type.transform(left, right, 'left'), type.transform(right, left, 'right')];

// Transform a list of server ops by a list of client ops.
// Returns [serverOps', clientOps'].
// This is O(serverOps.length * clientOps.length)
const transformLists = function(type, serverOps, clientOps) {
  //p "Transforming #{i serverOps} with #{i clientOps}"
  var s, clientOps;
  serverOps = (() => {
    const result = [];
    for (s of serverOps) {
      clientOps = (() => {
        const result1 = [];
        for (let c of clientOps) {
        //p "X #{i s} by #{i c}"
          let c_;
          [s, c_] = Array.from(transformX(type, s, c));
          result1.push(c_);
        }
        return result1;
      })();
      result.push(s);
    }
    return result;
  })();
  
  return [serverOps, clientOps];
};

// Compose a whole list of ops together
const composeList = (type, ops) => ops.reduce(type.compose);

// Hax. Apparently this is still the fastest way to deep clone an object,
// assuming we have support for JSON.
//
// This is needed because calling apply() now destroys the original object.
const clone = function(o) { if (typeof o === 'object') { return JSON.parse(JSON.stringify(o)); } else { return o; } };

// Returns client result
const testRandomOp = function(type, genRandomOp, initialDoc = type.create()) {
  let c_s, doc, op, ops, result, s, s_c, set, testInvert;
  const makeDoc = () => ({
    ops:[],
    result:initialDoc
  });
  const opSets = ([0, 1, 2].map((j) => makeDoc()));
  const [client, client2, server] = Array.from(opSets);

  for (let i1 = 0; i1 < 10; i1++) {
    doc = opSets[randomInt(3)];
    [op, doc.result] = Array.from(genRandomOp(doc.result));
    doc.ops.push(op);
  }

  for ({ops, result} of [client, client2, server]) { p(`Doc ${i(initialDoc)} + ${i(ops)} = ${i(result)}`); }

  const checkSnapshotsEq = function(a, b) {
    if (type.serialize) {
      return assert.deepStrictEqual(type.serialize(a), type.serialize(b));
    } else {
      return assert.deepStrictEqual(a, b);
    }
  };

  // First, test type.apply.
  for (set of opSets) {
    s = clone(initialDoc);
    for (op of set.ops) { s = type.apply(s, op); }

    checkSnapshotsEq(s, set.result);
  }

  // If the type has a shatter function, we should be able to shatter all the
  // ops, apply them and get the same results.
  if (type.shatter) {
    for (set of opSets) {
      s = clone(initialDoc);
      for (op of set.ops) {
        for (let atom of type.shatter(op)) {
          s = type.apply(s, atom);
        }
      }

      checkSnapshotsEq(s, set.result);
    }
  }

  if (type.invert != null) {
    // Invert all the ops and apply them to result. Should end up with initialDoc.
    testInvert = function(doc, ops = doc.ops) {
      let snapshot = clone(doc.result);

      // Sadly, coffeescript doesn't seem to support iterating backwards through an array.
      // reverse() reverses an array in-place so it needs to be cloned first.
      ops = doc.ops.slice().reverse();
      for (op of ops) {
        const op_ = type.invert(op);
        snapshot = type.apply(snapshot, op_);
      }

      return checkSnapshotsEq(snapshot, initialDoc);
    };
  
    for (set of opSets) { testInvert(set); }
  }

  if (type.diff != null) {
    const testDiff = function(doc) {
      const op_ = type.diff(clone(initialDoc), doc.result);
      result = type.apply(clone(initialDoc), op_);
      return checkSnapshotsEq(result, doc.result);
    };

    for (set of opSets) { if (doc.ops.length > 0) { testDiff(set); } }
  }

  if (type.diffX != null) {
    const testDiffX = function(doc) {
      const [ op1_, op2_ ] = Array.from(type.diffX(initialDoc, doc.result));
      const result1 = type.apply(clone(doc.result), op1_);
      const result2 = type.apply(clone(initialDoc), op2_);
      checkSnapshotsEq(result1, initialDoc);
      return checkSnapshotsEq(result2, doc.result);
    };

    for (set of opSets) { testDiffX(set); }
  }

  // If all the ops are composed together, then applied, we should get the same result.
  if (type.compose != null) {
    p('COMPOSE');
    const compose = function(doc) {
      if (doc.ops.length > 0) {
        doc.composed = composeList(type, doc.ops);
        p(`Compose ${i(doc.ops)} = ${i(doc.composed)}`);
        // .... And this should match the expected document.
        return checkSnapshotsEq(doc.result, type.apply(clone(initialDoc), doc.composed));
      }
    };

    for (set of opSets) { compose(set); }

    for (set of opSets) { if (set.composed != null) { if (typeof testInvert === 'function') {
      testInvert(set, [set.composed]);
    } } }
  
    // Check the diamond property holds
    if ((client.composed != null) && (server.composed != null)) {
      p(`Diamond\n\toriginal: ${i(initialDoc)}\n\tLeft: + ${i(server.composed)} -> ${i(server.result)}\n\tRight: + ${i(client.composed)} -> ${i(client.result)}`);
      const [server_, client_] = Array.from(transformX(type, server.composed, client.composed));
      p(`XF ${i(server.composed)} x ${i(client.composed)} -> ${i(server_)} x ${i(client_)}`);

      s_c = type.apply(clone(server.result), client_);
      c_s = type.apply(clone(client.result), server_);

      // Interestingly, these will not be the same as s_c and c_s above.
      // Eg, when:
      //  server.ops = [ [ { d: 'x' } ], [ { i: 'c' } ] ]
      //  client.ops = [ 1, { i: 'b' } ]
      checkSnapshotsEq(s_c, c_s);

      if (type.tp2) {
        // This is an interesting property which I don't think is strictly
        // enforced by the TP2 property, but which my text-tp2 type holds. I'm
        // curious if this will hold for any TP2 type.
        //
        // Given X, [A,B] based on a document, I'm testing if:
        //  T(T(x, A), B) == T(x, A.B).
        //
        // Because this holds, it is possible to collapse intermediate ops
        // without effecting the OT code.
        let x1 = server.composed;
        for (let c of client.ops) { x1 = type.transform(x1, c, 'left'); }

        let x2 = server.composed;
        x2 = type.transform(x2, client.composed, 'left');

        assert.deepStrictEqual(x1, x2);
      }

      if (type.tp2 && (client2.composed != null)) {
        // TP2 requires that T(op3, op1 . T(op2, op1)) == T(op3, op2 . T(op1, op2)).
        const lhs = type.transform(client2.composed, type.compose(client.composed, server_), 'left');
        const rhs = type.transform(client2.composed, type.compose(server.composed, client_), 'left');

        assert.deepStrictEqual(lhs, rhs);
      }
    }
  }

  if (type.prune != null) {
    p('PRUNE');
    
    const [op1] = Array.from(genRandomOp(initialDoc));
    const [op2] = Array.from(genRandomOp(initialDoc));

    for (let idDelta of ['left', 'right']) {
      const op1_ = type.transform(op1, op2, idDelta);
      const op1_pruned = type.prune(op1_, op2, idDelta);

      assert.deepStrictEqual(op1, op1_pruned);
    }
  }

  // Now we'll check the n^2 transform method.
  if ((client.ops.length > 0) && (server.ops.length > 0)) {
    p(`s ${i(server.result)} c ${i(client.result)} XF ${i(server.ops)} x ${i(client.ops)}`);
    const [s_, c_] = Array.from(transformLists(type, server.ops, client.ops));
    p(`XF result -> ${i(s_)} x ${i(c_)}`);
    p(`applying ${i(c_)} to ${i(server.result)}`);
    s_c = c_.reduce(type.apply, clone(server.result));
    c_s = s_.reduce(type.apply, clone(client.result));

    checkSnapshotsEq(s_c, c_s);

    // ... And we'll do a round-trip using invert().
    if (type.invert != null) {
      const c_inv = c_.slice().reverse().map(type.invert);
      const server_result_ = c_inv.reduce(type.apply, clone(s_c));
      checkSnapshotsEq(server.result, server_result_);
      const orig_ = server.ops.slice().reverse().map(type.invert).reduce(type.apply, server_result_);
      checkSnapshotsEq(orig_, initialDoc);
    }
  }
  
  return client.result;
};

const collectStats = function(type) {
  let fn;
  const functions = ['transform', 'compose', 'apply', 'prune'];

  const orig = {};
  for (fn of functions) { if (type[fn] != null) { orig[fn] = type[fn]; } }
  const restore = () => (() => {
    const result = [];
    for (fn of functions) {         if (orig[fn] != null) {
        result.push(type[fn] = orig[fn]);
      }
    }
    return result;
  })();
  
  const stats = {};
  for (fn of functions) { if (orig[fn] != null) { stats[fn] = 0; } }

  const collect = fn => (function(...args) {
    stats[fn]++;
    return orig[fn].apply(null, args);
  });
  
  for (fn of functions) { if (orig[fn] != null) { type[fn] = collect(fn); } }

  return [stats, restore];
};

const save = (seedstate, doc, iter) => fs.writeFileSync('fuzzercrash.data', JSON.stringify({seedstate, doc, iter}));

// Run some iterations of the random op tester. Requires a random op generator for the type.
module.exports = function(type, genRandomOp, iterations = 2000) {
  assert.ok(type.transform);

  const [stats, restore] = Array.from(collectStats(type));

  console.error(`   Running ${iterations} randomized tests for type ${type.name}...`);
  if (seed != null) { console.error(`     (seed: ${seed})`); }

  const warnUnless = function(fn) { if (type[fn] == null) { return console.error(`NOTE: Not running ${fn} tests because ${type.name} does not have ${fn}() defined`); } };
  warnUnless('invert');
  warnUnless('compose');

  let doc = restorestate.doc ? type.create(restorestate.doc) : type.create();

  console.time('randomizer');
  if (typeof type.setDebug === 'function') {
    type.setDebug(debugMode);
  }
  // iterationsPerPct = iterations / 100
  const bar = new Bar({fps:3, etaBuffer:4000}, Presets.shades_classic);
  bar.start(iterations, restorestate.iter);

  for (let n = restorestate.iter, end = iterations, asc = restorestate.iter <= end; asc ? n <= end : n >= end; asc ? n++ : n--) {
    // if n % (iterationsPerPct * 2) == 0
    //   process.stdout.write (if n % (iterationsPerPct * 10) == 0 then "#{n / iterationsPerPct}" else '.')

    var seedstate;
    try {
      seedstate = randomReal.state();
      if ((n % 1000) === 0) { save(seedstate, doc, n); }
      bar.update(n);

      // debugger if debugMode

      doc = testRandomOp(type, genRandomOp, doc);
    } catch (e) {
      bar.stop();
      console.log(`----- 💣💥 CRASHED AT ITER ${n} -----`);
      fs.writeFileSync(restorefile, JSON.stringify({seedstate, doc, iter: n}));
      console.log('Fuzzer state saved to fuzzercrash.data');
      throw e;
    }
  }

  bar.stop();

  console.timeEnd('randomizer');
  console.log();

  console.log("Performed:");
  for (let fn in stats) { const number = stats[fn]; console.log(`\t${fn}s: ${number}`); }

  restore();

  return fs.unlinkSync(restorefile);
};

for (let k in exports) { const v = exports[k]; module.exports[k] = v; }
