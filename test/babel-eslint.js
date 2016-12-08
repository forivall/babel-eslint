var assert      = require("assert");
var babelEslint = require("..");
var espree      = require("espree");
var util        = require("util");
var unpad       = require("../utils/unpad");

// Checks if the source ast implements the target ast. Ignores extra keys on source ast
function assertImplementsAST(target, source, path) {
  if (!path) {
    path = [];
  }

  function error(text) {
    var err = new Error(`At ${path.join(".")}: ${text}:`);
    err.depth = path.length + 1;
    throw err;
  }

  var typeA = target === null ? "null" : typeof target;
  var typeB = source === null ? "null" : typeof source;
  if (typeA !== typeB) {
    error(`have different types (${typeA} !== ${typeB}) (${target} !== ${source})`);
  } else if (typeA === "object") {
    var keysTarget = Object.keys(target);
    for (var i in keysTarget) {
      var key = keysTarget[i];
      path.push(key);
      assertImplementsAST(target[key], source[key], path);
      path.pop();
    }
  } else if (target !== source) {
    error(`are different (${JSON.stringify(target)} !== ${JSON.stringify(source)})`);
  }
}

function lookup(obj, keypath, backwardsDepth) {
  if (!keypath) { return obj; }

  return keypath.split(".").slice(0, -1 * backwardsDepth)
  .reduce(function (base, segment) { return base && base[segment], obj; }, obj);
}

function parseAndAssertSame(code, options) {
  var esAST = espree.parse(code, {
    ecmaFeatures: {
        // enable JSX parsing
      jsx: true,
        // enable return in global scope
      globalReturn: true,
        // enable implied strict mode (if ecmaVersion >= 5)
      impliedStrict: true,
        // allow experimental object rest/spread
      experimentalObjectRestSpread: true
    },
    tokens: true,
    loc: true,
    range: true,
    comment: true,
    attachComment: true,
    ecmaVersion: 8,
    sourceType: "module"
  });
  var babylonAST = babelEslint.parse(code, options);
  assertASTMatches(esAST, babylonAST);
  // assert.equal(esAST, babylonAST);
}

function assertASTMatches(target, source, targetName, sourceName) {
  try {
    if (target.tokens) {
      delete target.tokens;
    }
    if (source.tokens) {
      delete source.tokens;
    }
    assertImplementsAST(target, source);
  } catch (err) {
    var traversal = err.message.slice(3, err.message.indexOf(":"));
    err.message += `
      ${targetName || "espree"}:
      ${util.inspect(lookup(target, traversal, 2), {depth: err.depth, colors: true})}
      ${sourceName || "babel-eslint"}:
      ${util.inspect(lookup(source, traversal, 2), {depth: err.depth, colors: true})}
    `;
    throw err;
  }
}

describe("babylon-to-esprima", function () {
  describe("templates", function () {
    it("empty template string", function () {
      parseAndAssertSame("``");
    });

    it("template string", function () {
      parseAndAssertSame("`test`");
    });

    it("template string using $", function () {
      parseAndAssertSame("`$`");
    });

    it("template string with expression", function () {
      parseAndAssertSame("`${a}`");
    });

    it("template string with multiple expressions", function () {
      parseAndAssertSame("`${a}${b}${c}`");
    });

    it("template string with expression and strings", function () {
      parseAndAssertSame("`a${a}a`");
    });

    it("template string with binary expression", function () {
      parseAndAssertSame("`a${a + b}a`");
    });

    it("tagged template", function () {
      parseAndAssertSame("jsx`<Button>Click</Button>`");
    });

    it("tagged template with expression", function () {
      parseAndAssertSame("jsx`<Button>Hi ${name}</Button>`");
    });

    it("tagged template with new operator", function () {
      parseAndAssertSame("new raw`42`");
    });

    it("template with nested function/object", function () {
      parseAndAssertSame("`outer${{x: {y: 10}}}bar${`nested${function(){return 1;}}endnest`}end`");
    });

    it("template with braces inside and outside of template string #96", function () {
      parseAndAssertSame("if (a) { var target = `{}a:${webpackPort}{}}}}`; } else { app.use(); }");
    });

    it("template also with braces #96", function () {
      parseAndAssertSame(
        unpad(`
          export default function f1() {
            function f2(foo) {
              const bar = 3;
              return \`\${foo} \${bar}\`;
            }
            return f2;
          }
        `)
      );
    });

    it("template with destructuring #31", function () {
      parseAndAssertSame(
        unpad(`
          module.exports = {
            render() {
              var {name} = this.props;
              return Math.max(null, \`Name: \${name}, Name: \${name}\`);
            }
          };
        `)
      );
    });
  });

  it("simple expression", function () {
    parseAndAssertSame("a = 1");
  });

  it("class declaration", function () {
    parseAndAssertSame("class Foo {}");
  });

  it("class expression", function () {
    parseAndAssertSame("var a = class Foo {}");
  });

  it("jsx expression", function () {
    parseAndAssertSame("<App />");
  });

  it("jsx expression with 'this' as identifier", function () {
    parseAndAssertSame("<this />");
  });

  it("jsx expression with a dynamic attribute", function () {
    parseAndAssertSame("<App foo={bar} />");
  });

  it("jsx expression with a member expression as identifier", function () {
    parseAndAssertSame("<foo.bar />");
  });

  it("jsx expression with spread", function () {
    parseAndAssertSame("var myDivElement = <div {...this.props} />;");
  });

  it("empty jsx text", function () {
    parseAndAssertSame("<a></a>");
  });

  it("jsx text with content", function () {
    parseAndAssertSame("<a>Hello, world!</a>");
  });

  it("nested jsx", function () {
    parseAndAssertSame("<div>\n<h1>Wat</h1>\n</div>");
  });

  it("default import", function () {
    parseAndAssertSame("import foo from \"foo\";");
  });

  it("import specifier", function () {
    parseAndAssertSame("import { foo } from \"foo\";");
  });

  it("import specifier with name", function () {
    parseAndAssertSame("import { foo as bar } from \"foo\";");
  });

  it("import bare", function () {
    parseAndAssertSame("import \"foo\";");
  });

  it("export default class declaration", function () {
    parseAndAssertSame("export default class Foo {}");
  });

  it("export default class expression", function () {
    parseAndAssertSame("export default class {}");
  });

  it("export default function declaration", function () {
    parseAndAssertSame("export default function Foo() {}");
  });

  it("export default function expression", function () {
    parseAndAssertSame("export default function () {}");
  });

  it("export all", function () {
    parseAndAssertSame("export * from \"foo\";");
  });

  it("export named", function () {
    parseAndAssertSame("export { foo };");
  });

  it("export named alias", function () {
    parseAndAssertSame("export { foo as bar };");
  });

  it.skip("empty program with line comment", function () {
    parseAndAssertSame("// single comment");
  });

  it.skip("empty program with block comment", function () {
    parseAndAssertSame("  /* multiline\n * comment\n*/");
  });

  it("line comments", function () {
    parseAndAssertSame(
      unpad(`
        // single comment
        var foo = 15; // comment next to statement
        // second comment after statement
      `)
    );
  });

  it("block comments", function () {
    parseAndAssertSame(
      unpad(`
        /* single comment */
        var foo = 15; /* comment next to statement */
        /*
         * multiline
         * comment
         */
       `)
    );
  });

  it("block comments #124", function () {
    parseAndAssertSame(
      unpad(`
        React.createClass({
          render() {
            // return (
            //   <div />
            // ); // <-- this is the line that is reported
          }
        });
      `)
    );
  });

  it("null", function () {
    parseAndAssertSame("null");
  });

  it("boolean", function () {
    parseAndAssertSame("if (true) {} else if (false) {}");
  });

  it("regexp", function () {
    parseAndAssertSame("/affix-top|affix-bottom|affix|[a-z]/");
  });

  it("regexp in a template string", function () {
    parseAndAssertSame("`${/\\d/.exec(\"1\")[0]}`");
  });

  it("first line is empty", function () {
    parseAndAssertSame("\nimport Immutable from \"immutable\";");
  });

  it("empty", function () {
    parseAndAssertSame("");
  });

  it("jsdoc", function () {
    parseAndAssertSame(
      unpad(`
        /**
        * @param {object} options
        * @return {number}
        */
        const test = function({ a, b, c }) {
          return a + b + c;
        };
        module.exports = test;
      `)
    );
  });

  it("empty block with comment", function () {
    parseAndAssertSame(
      unpad(`
        function a () {
          try {
            b();
          } catch (e) {
            // asdf
          }
        }
      `)
    );
  });

  it("iscript preprocessor directive", function () {
    assertASTMatches(
      babelEslint.parse(unpad(`
        // this is a comment
        #define directive "this is a directive"
      `), {babylon: "babylon-iscript"}), {
        type: "Program",
        start: 60,
        end: 60,
        loc: {
          start: { line: 2, column: 39 },
          end: { line: 2, column: 39 }
        },
        comments: [
          { type: "Line",
            value: " this is a comment",
            start: 0,
            end: 20,
            loc: {
              start: { line: 1, column: 0 },
              end: { line: 1, column: 20 } },
            range: [ 0, 20 ] },
          { type: "Line",
            value: "define directive \"this is a directive\"",
            start: 21,
            end: 60,
            loc: {
              start: { line: 2, column: 0 },
              end: { line: 2, column: 39 }
            },
            range: [ 21, 60 ] } ],
        range: [ 0, 60 ],
        sourceType: "module",
        directives: undefined,
        body: []
      }
    );
  });

  describe("babel 6 tests", function () {
    it("MethodDefinition", function () {
      parseAndAssertSame(
        unpad(`
          export default class A {
            a() {}
          }
        `)
      );
    });

    it("MethodDefinition 2", function () {
      parseAndAssertSame("export default class Bar { get bar() { return 42; }}");
    });

    it("ClassMethod", function () {
      parseAndAssertSame(
        unpad(`
          class A {
            constructor() {
            }
          }
        `)
      );
    });

    it("ClassMethod multiple params", function () {
      parseAndAssertSame(
        unpad(`
          class A {
            constructor(a, b, c) {
            }
          }
        `)
      );
    });

    it("ClassMethod multiline", function () {
      parseAndAssertSame(
        unpad(`
          class A {
            constructor (
              a,
              b,
              c
            )

            {

            }
          }
        `)
      );
    });

    it("ClassMethod oneline", function () {
      parseAndAssertSame("class A { constructor(a, b, c) {} }");
    });

    it("ObjectMethod", function () {
      parseAndAssertSame(
        unpad(`
          var a = {
            b(c) {
            }
          }
        `)
      );
    });

    it("do not allow import export everywhere", function() {
      assert.throws(function () {
        parseAndAssertSame("function F() { import a from \"a\"; }");
      }, /SyntaxError: 'import' and 'export' may only appear at the top level/);
    });

    it("return outside function", function () {
      parseAndAssertSame("return;");
    });

    it("super outside method", function () {
      parseAndAssertSame("function F() { super(); }");
    });

    it("StringLiteral", function () {
      parseAndAssertSame("");
      parseAndAssertSame("");
      parseAndAssertSame("a");
    });

    it("getters and setters", function () {
      parseAndAssertSame("class A { get x ( ) { ; } }");
      parseAndAssertSame(
        unpad(`
          class A {
            get x(
            )
            {
              ;
            }
          }
        `)
      );
      parseAndAssertSame("class A { set x (a) { ; } }");
      parseAndAssertSame(
        unpad(`
          class A {
            set x(a
            )
            {
              ;
            }
          }
        `)
      );
      parseAndAssertSame(
        unpad(`
          var B = {
            get x () {
              return this.ecks;
            },
            set x (ecks) {
              this.ecks = ecks;
            }
          };
        `)
      );
    });

    it("RestOperator", function () {
      parseAndAssertSame("var { a, ...b } = c");
      parseAndAssertSame("var [ a, ...b ] = c");
      parseAndAssertSame("var a = function (...b) {}");
    });

    it("SpreadOperator", function () {
      parseAndAssertSame("var a = { b, ...c }");
      parseAndAssertSame("var a = [ a, ...b ]");
      parseAndAssertSame("var a = sum(...b)");
    });

    it("Async/Await", function() {
      parseAndAssertSame(
        unpad(`
          async function a() {
            await 1;
          }
        `)
      );
    });
  });
});
